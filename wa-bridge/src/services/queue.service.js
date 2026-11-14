'use strict';

const {
  getPendingItemsBySession,
  markProcessing,
  markSent,
  markFailed,
  incrementRetry,
  setWaMessageId,
  resetStuckItems,
} = require('../db/queue.db');
const { sendTextMessage, getSessionState } = require('./baileys.service');
const { bridgeEmitter } = require('../events/emitter');
const { logger } = require('../utils/logger');
const { config } = require('../utils/config');

let isRunning = false;
const activeWorkers = {
  cpp: false,
  cpw: false,
};

let queueIntervalTimer = null;

function randomJitter(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function processSessionQueue(sessionId) {
  if (activeWorkers[sessionId]) return;
  activeWorkers[sessionId] = true;

  try {
    const sessionState = getSessionState(sessionId);
    if (!sessionState.connected) {
      // Sesi belum terhubung, tidak bisa memproses antrean
      return;
    }

    const items = getPendingItemsBySession(sessionId, 1);
    if (!items || items.length === 0) {
      return;
    }

    const item = items[0];
    let payload = {};
    try {
      payload = JSON.parse(item.payload);
    } catch (_) {
      payload = { message: item.payload };
    }

    markProcessing(item.id);
    logger.info({ id: item.id, sessionId, phone: item.phone }, 'Processing blast message from queue');

    try {
      const waMsgId = await sendTextMessage(sessionId, item.phone, payload.message);
      markSent(item.id);
      if (waMsgId) {
        setWaMessageId(item.id, waMsgId);
      }

      bridgeEmitter.emit('message_sent', {
        queue_id: item.id,
        sessionId,
        phone: item.phone,
        wa_message_id: waMsgId,
      });

      // Berikan jeda acak (jitter delay) anti-ban sebelum pesan berikutnya diproses
      const jitterMs = randomJitter(config.minDelayMs, config.maxDelayMs);
      logger.info({ sessionId, jitterMs }, 'Applying anti-ban delay before next item...');
      await sleep(jitterMs);

    } catch (sendErr) {
      logger.error({ id: item.id, sessionId, err: sendErr.message }, 'Failed to send WhatsApp message');

      if (item.retry_count >= 2) {
        markFailed(item.id, sendErr.message);
        bridgeEmitter.emit('message_failed', {
          queue_id: item.id,
          sessionId,
          phone: item.phone,
          error: sendErr.message,
        });
      } else {
        const retryAfter = new Date(Date.now() + 30000).toISOString();
        incrementRetry(item.id, sendErr.message, retryAfter);
      }
    }
  } catch (err) {
    logger.error({ sessionId, err: err.message }, 'Exception in processSessionQueue');
  } finally {
    activeWorkers[sessionId] = false;
  }
}

async function cycleAllQueues() {
  if (!isRunning) return;
  await Promise.all([
    processSessionQueue('cpp'),
    processSessionQueue('cpw'),
  ]);
}

function startQueueWorker() {
  if (isRunning) return;
  isRunning = true;
  resetStuckItems();

  logger.info('Queue worker started for dual sessions (CPP & CPW)');

  queueIntervalTimer = setInterval(() => {
    cycleAllQueues().catch(err => {
      logger.error({ err: err.message }, 'Error in cycleAllQueues');
    });
  }, 2000);
}

function stopQueueWorker() {
  isRunning = false;
  if (queueIntervalTimer) {
    clearInterval(queueIntervalTimer);
    queueIntervalTimer = null;
  }
}

function triggerImmediate(sessionId = null) {
  if (sessionId) {
    processSessionQueue(sessionId);
  } else {
    processSessionQueue('cpp');
    processSessionQueue('cpw');
  }
}

module.exports = {
  startQueueWorker,
  stopQueueWorker,
  triggerImmediate,
};
