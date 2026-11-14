'use strict';

const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const { config } = require('../utils/config');
const { logger } = require('../utils/logger');
const { bridgeEmitter } = require('../events/emitter');
const {
  insertQueueItem,
  getQueueStats,
  markCancelled,
} = require('../db/queue.db');
const { normalizePhone } = require('../utils/phone');
const {
  logoutSession,
  reconnectSession,
  getSessionState,
  getLatestQr,
} = require('./baileys.service');
const { triggerImmediate } = require('./queue.service');

let supabase;
let realtimeChannel = null;
let pollingTimer = null;
let isPolling = false;
let heartbeatTimer = null;

const IDLE_POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 menit safety-net

async function handleSystemCommand(cmd) {
  if (!supabase || !cmd || !cmd.id) return;
  const sessionId = (cmd.sender_role || 'cpp').toLowerCase();
  const action = String(cmd.message || '').trim().toUpperCase();

  logger.info({ id: cmd.id, sessionId, action }, 'Executing remote system_command from Admin');

  try {
    await supabase
      .from('wa_outbox')
      .update({ status: 'processing' })
      .eq('id', cmd.id);

    if (action === 'LOGOUT') {
      logger.info({ sessionId }, 'Executing remote LOGOUT command');
      await logoutSession(sessionId);
      await syncBridgeStatusToSupabase(sessionId, {
        connected: false,
        phone: null,
        name: null,
        qr_base64: null,
      });

      await supabase
        .from('wa_outbox')
        .update({ status: 'sent', error_message: null })
        .eq('id', cmd.id);

    } else if (action === 'RESET_SESSION') {
      logger.info({ sessionId }, 'Executing remote RESET_SESSION command');
      await logoutSession(sessionId);
      await reconnectSession(sessionId, true);

      await supabase
        .from('wa_outbox')
        .update({ status: 'sent', error_message: null })
        .eq('id', cmd.id);
    } else {
      logger.warn({ action, sessionId }, 'Unknown system_command received');
      await supabase
        .from('wa_outbox')
        .update({ status: 'failed', error_message: `Unknown command: ${action}` })
        .eq('id', cmd.id);
    }
  } catch (err) {
    logger.error({ err: err.message, id: cmd.id, sessionId }, 'Error executing system_command');
    await supabase
      .from('wa_outbox')
      .update({ status: 'failed', error_message: err.message })
      .eq('id', cmd.id);
  }
}

function subscribeToOutboxRealtime() {
  if (!supabase) return;

  if (realtimeChannel) {
    try {
      supabase.removeChannel(realtimeChannel);
    } catch (_) {}
    realtimeChannel = null;
  }

  const channelName = `wa_outbox_${Date.now()}`;
  logger.info({ channelName }, 'Creating Supabase Realtime subscription for wa_outbox');

  realtimeChannel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'wa_outbox',
      },
      (payload) => {
        const item = payload.new;
        if (!item) return;

        logger.info({ id: item.id, type: item.type, status: item.status, role: item.sender_role }, 'Realtime: outbox insert event');

        if (item.type === 'system_command' && item.status === 'pending') {
          handleSystemCommand(item);
        } else if (item.status === 'pending') {
          scheduleNextPoll(100);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'wa_outbox',
      },
      (payload) => {
        const item = payload.new;
        if (!item) return;

        if (item.type === 'system_command' && item.status === 'pending') {
          handleSystemCommand(item);
        } else if (item.status === 'pending') {
          scheduleNextPoll(100);
        } else if (item.status === 'cancelled') {
          markCancelled(item.id);
        }
      }
    )
    .subscribe((status, err) => {
      logger.info({ status, err: err?.message }, 'Supabase Realtime subscription status');
      if (status === 'SUBSCRIBED') {
        scheduleNextPoll(500);
      }
    });
}

function scheduleNextPoll(delayMs) {
  if (pollingTimer) clearTimeout(pollingTimer);
  pollingTimer = setTimeout(pollOutbox, delayMs);
}

async function pollOutbox() {
  if (isPolling || !supabase) return;
  isPolling = true;
  let nextDelayMs = IDLE_POLL_INTERVAL_MS;

  try {
    const { data: messages, error } = await supabase
      .from('wa_outbox')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) {
      logger.error({ err: error.message }, 'Error polling from Supabase wa_outbox');
      nextDelayMs = 30000;
      return;
    }

    if (!messages || messages.length === 0) {
      return;
    }

    nextDelayMs = messages.length === 10 ? 2000 : IDLE_POLL_INTERVAL_MS;

    const systemCommands = [];
    const regularMessages = [];

    for (const msg of messages) {
      if (msg.type === 'system_command') {
        systemCommands.push(msg);
      } else {
        regularMessages.push(msg);
      }
    }

    // Eksekusi perintah sistem
    for (const cmd of systemCommands) {
      await handleSystemCommand(cmd);
    }

    if (regularMessages.length === 0) return;

    // Batch update status pesan reguler ke 'processing'
    const messageIds = regularMessages.map(m => m.id);
    const { error: batchErr } = await supabase
      .from('wa_outbox')
      .update({ status: 'processing' })
      .in('id', messageIds);

    if (batchErr) {
      logger.error({ err: batchErr.message }, 'Failed to batch update wa_outbox to processing');
      nextDelayMs = 30000;
      return;
    }

    // Masukkan ke SQLite antrean lokal
    for (const msg of regularMessages) {
      const sessionId = (msg.sender_role || 'cpp').toLowerCase();
      try {
        insertQueueItem({
          id: msg.id,
          sessionId,
          phone: normalizePhone(msg.phone),
          type: msg.type || 'text',
          payload: { message: msg.message },
        });

        logger.info({ id: msg.id, sessionId, phone: msg.phone }, 'Queued message to local SQLite');
        triggerImmediate(sessionId);
      } catch (insertErr) {
        logger.error({ id: msg.id, err: insertErr.message }, 'Failed to queue locally, reverting Supabase status');
        await supabase
          .from('wa_outbox')
          .update({ status: 'pending' })
          .eq('id', msg.id);
      }
    }

  } catch (err) {
    logger.error({ err: err.message }, 'Exception in pollOutbox');
    nextDelayMs = 30000;
  } finally {
    isPolling = false;
    if (pollingTimer !== null) {
      scheduleNextPoll(nextDelayMs);
    }
  }
}

async function syncBridgeStatusToSupabase(sessionId, patch = {}) {
  if (!supabase) return;
  const sid = (sessionId || 'cpp').toLowerCase();
  try {
    const stats = getQueueStats(sid);
    const conn = getSessionState(sid);
    const qrInfo = getLatestQr(sid);

    const payload = {
      session_id: sid,
      label: conn.label,
      connected: conn.connected ?? false,
      phone: conn.phone || null,
      name: conn.name || null,
      is_session_corrupted: conn.is_session_corrupted ?? false,
      qr_base64: conn.connected ? null : (qrInfo.qr_base64 || null),
      qr_expires_at: conn.connected ? null : (qrInfo.expires_at || null),
      queue_stats: stats,
      updated_at: new Date().toISOString(),
      ...patch,
    };

    const { error } = await supabase
      .from('wa_bridge_status')
      .upsert(payload, { onConflict: 'session_id' });

    if (error) {
      logger.warn({ sid, err: error.message }, 'Failed to sync wa_bridge_status to Supabase');
    }
  } catch (err) {
    logger.warn({ sid, err: err.message }, 'Exception in syncBridgeStatusToSupabase');
  }
}

async function syncAllStatuses() {
  await syncBridgeStatusToSupabase('cpp');
  await syncBridgeStatusToSupabase('cpw');
}

function initSupabaseWorker() {
  if (!config.supabaseUrl || !config.supabaseKey) {
    logger.warn('Supabase URL or Key missing in wa-bridge/.env. Worker disabled.');
    return;
  }

  supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket },
    global: { WebSocket },
  });

  logger.info({ url: config.supabaseUrl }, 'Supabase worker initialized');

  subscribeToOutboxRealtime();
  syncAllStatuses();
  scheduleNextPoll(1000);

  // Heartbeat sync tiap 30 detik
  heartbeatTimer = setInterval(syncAllStatuses, 30000);

  // Listener event soket Baileys
  bridgeEmitter.on('qr_updated', (data) => {
    syncBridgeStatusToSupabase(data.sessionId, {
      connected: false,
      qr_base64: data.qr_base64,
      qr_expires_at: data.expires_at,
    });
  });

  bridgeEmitter.on('connected', (data) => {
    syncBridgeStatusToSupabase(data.sessionId, {
      connected: true,
      phone: data.phone,
      name: data.name,
      qr_base64: null,
    });
  });

  bridgeEmitter.on('disconnected', (data) => {
    syncBridgeStatusToSupabase(data.sessionId, {
      connected: false,
    });
  });

  bridgeEmitter.on('message_sent', async (data) => {
    if (!supabase || !data?.queue_id) return;
    try {
      await supabase
        .from('wa_outbox')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', data.queue_id);
      syncBridgeStatusToSupabase(data.sessionId);
    } catch (_) {}
  });

  bridgeEmitter.on('outbox_delivered', async (data) => {
    if (!supabase || !data?.wa_message_id) return;
    try {
      // Cari outbox id by wa_message_id di queue
      const { markDelivered } = require('../db/queue.db');
      const res = markDelivered(data.wa_message_id);
      if (res?.queueId) {
        await supabase
          .from('wa_outbox')
          .update({ status: 'delivered' })
          .eq('id', res.queueId);
      }
    } catch (_) {}
  });

  bridgeEmitter.on('outbox_read', async (data) => {
    if (!supabase || !data?.wa_message_id) return;
    try {
      const { markRead } = require('../db/queue.db');
      const res = markRead(data.wa_message_id);
      if (res?.queueId) {
        await supabase
          .from('wa_outbox')
          .update({ status: 'read' })
          .eq('id', res.queueId);
      }
    } catch (_) {}
  });

  bridgeEmitter.on('message_failed', async (data) => {
    if (!supabase || !data?.queue_id) return;
    try {
      await supabase
        .from('wa_outbox')
        .update({
          status: 'failed',
          error_message: data.error || 'Gagal terkirim',
        })
        .eq('id', data.queue_id);
      syncBridgeStatusToSupabase(data.sessionId);
    } catch (_) {}
  });
}

function stopSupabaseWorker() {
  if (pollingTimer) clearInterval(pollingTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (realtimeChannel && supabase) {
    supabase.removeChannel(realtimeChannel);
  }
}

module.exports = {
  initSupabaseWorker,
  stopSupabaseWorker,
  syncBridgeStatusToSupabase,
};
