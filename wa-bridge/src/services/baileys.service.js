'use strict';

const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const { config } = require('../utils/config');
const { logger } = require('../utils/logger');
const { bridgeEmitter } = require('../events/emitter');
const { normalizePhone } = require('../utils/phone');

let makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidNormalizedUser, Browsers;

async function loadBaileys() {
  if (makeWASocket) return;
  const baileys = await import('@whiskeysockets/baileys');
  makeWASocket = baileys.default;
  DisconnectReason = baileys.DisconnectReason;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
  makeCacheableSignalKeyStore = baileys.makeCacheableSignalKeyStore;
  jidNormalizedUser = baileys.jidNormalizedUser;
  Browsers = baileys.Browsers;
}

const sessions = {
  cpp: {
    sessionId: 'cpp',
    label: 'Pengantin Pria (CPP)',
    sock: null,
    isConnected: false,
    phone: null,
    name: null,
    lastQrBase64: null,
    qrExpiresAt: null,
    reconnectAttempt: 0,
    isLoggedOut: false,
    isSessionCorrupted: false,
    reconnectTimer: null,
  },
  cpw: {
    sessionId: 'cpw',
    label: 'Pengantin Wanita (CPW)',
    sock: null,
    isConnected: false,
    phone: null,
    name: null,
    lastQrBase64: null,
    qrExpiresAt: null,
    reconnectAttempt: 0,
    isLoggedOut: false,
    isSessionCorrupted: false,
    reconnectTimer: null,
  },
};

function getSession(sessionId) {
  const sid = (sessionId || 'cpp').toLowerCase();
  return sessions[sid] || sessions.cpp;
}

function getSessionDir(sessionId) {
  const sid = (sessionId || 'cpp').toLowerCase();
  const dir = path.join(config.sessionRootDir, sid);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function clearSessionDir(sessionId) {
  const dir = getSessionDir(sessionId);
  try {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        fs.rmSync(path.join(dir, file), { recursive: true, force: true });
      }
      logger.info({ sessionId }, 'Session directory cleared');
    }
  } catch (err) {
    logger.warn({ err: err.message, sessionId }, 'Error clearing session directory');
  }
}

async function connectSession(sessionId) {
  await loadBaileys();
  const session = getSession(sessionId);
  const sessionDir = getSessionDir(sessionId);

  session.isLoggedOut = false;
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }

  logger.info({ sessionId, label: session.label }, 'Initializing WhatsApp socket...');

  const { state: authState, saveCreds } = await useMultiFileAuthState(sessionDir);

  let version = [2, 3000, 1015901307];
  try {
    const vResult = await fetchLatestBaileysVersion();
    if (vResult?.version) version = vResult.version;
  } catch (_) {
    // Gunakan fallback version
  }

  const pinoSilent = require('pino')({ level: 'silent' });

  const sock = makeWASocket({
    version,
    auth: {
      creds: authState.creds,
      keys: makeCacheableSignalKeyStore(authState.keys, pinoSilent),
    },
    logger: pinoSilent,
    printQRInTerminal: false,
    browser: Browsers.macOS('Desktop'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
  });

  session.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // 1. QR Code Update
    if (qr) {
      try {
        const qrDataUrl = await qrcode.toDataURL(qr, { margin: 2, scale: 6 });
        const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();
        session.lastQrBase64 = qrDataUrl;
        session.qrExpiresAt = expiresAt;
        session.isConnected = false;

        logger.info({ sessionId, label: session.label }, 'QR Code refreshed');
        bridgeEmitter.emit('qr_updated', {
          sessionId,
          qr_base64: qrDataUrl,
          expires_at: expiresAt,
        });
      } catch (qrErr) {
        logger.error({ err: qrErr.message, sessionId }, 'Failed to convert QR to DataURL');
      }
    }

    // 2. Connection Open
    if (connection === 'open') {
      session.isConnected = true;
      session.reconnectAttempt = 0;
      session.lastQrBase64 = null;
      session.qrExpiresAt = null;
      session.isSessionCorrupted = false;

      const userJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
      session.phone = userJid ? userJid.split('@')[0] : null;
      session.name = sock.user?.name || sock.user?.notify || session.label;

      logger.info({ sessionId, phone: session.phone, name: session.name }, 'WhatsApp connection established');
      bridgeEmitter.emit('connected', {
        sessionId,
        phone: session.phone,
        name: session.name,
      });
    }

    // 3. Connection Close
    if (connection === 'close') {
      session.isConnected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || 'unknown';
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      logger.warn({ sessionId, statusCode, reason, isLoggedOut }, 'WhatsApp connection closed');
      bridgeEmitter.emit('disconnected', { sessionId, reason });

      if (isLoggedOut) {
        logger.warn({ sessionId }, 'Device logged out by user or server');
        await logoutSession(sessionId);
      } else if (!session.isLoggedOut) {
        scheduleSessionReconnect(sessionId);
      }
    }
  });

  // Track status centang pesan (delivered & read)
  sock.ev.on('messages.update', (updates) => {
    for (const update of updates) {
      const waMessageId = update.key?.id;
      if (!waMessageId) continue;

      if (update.update?.status === 3) {
        bridgeEmitter.emit('outbox_delivered', { sessionId, wa_message_id: waMessageId });
      } else if (update.update?.status === 4) {
        bridgeEmitter.emit('outbox_read', { sessionId, wa_message_id: waMessageId });
      }
    }
  });

  return sock;
}

function scheduleSessionReconnect(sessionId) {
  const session = getSession(sessionId);
  if (session.isLoggedOut) return;

  session.reconnectAttempt++;
  const delay = Math.min(5000 * Math.min(session.reconnectAttempt, 10), 30000);
  logger.info({ sessionId, attempt: session.reconnectAttempt, delayMs: delay }, 'Scheduling reconnect for session...');

  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
  }

  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null;
    if (!session.isLoggedOut && !session.isConnected) {
      connectSession(sessionId).catch(err => {
        logger.error({ sessionId, err: err.message }, 'Reconnect failed, will retry');
      });
    }
  }, delay);
}

async function logoutSession(sessionId) {
  const session = getSession(sessionId);
  session.isLoggedOut = true;
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }

  if (session.sock) {
    try {
      await session.sock.logout();
    } catch (_) {}
    try {
      session.sock.ws?.close();
    } catch (_) {}
    session.sock = null;
  }

  await clearSessionDir(sessionId);
  session.isConnected = false;
  session.phone = null;
  session.name = null;
  session.lastQrBase64 = null;
  session.qrExpiresAt = null;

  logger.info({ sessionId }, 'Session logged out and cleared');
  bridgeEmitter.emit('disconnected', { sessionId, reason: 'logout' });
}

async function reconnectSession(sessionId, forceClean = false) {
  const session = getSession(sessionId);
  if (session.sock) {
    try {
      session.sock.ws?.close();
    } catch (_) {}
    session.sock = null;
  }

  if (forceClean) {
    await clearSessionDir(sessionId);
  }

  session.isLoggedOut = false;
  session.reconnectAttempt = 0;
  return connectSession(sessionId);
}

function toJid(phone) {
  const clean = normalizePhone(phone);
  return `${clean}@s.whatsapp.net`;
}

async function sendTextMessage(sessionId, phone, text) {
  const session = getSession(sessionId);
  if (!session.isConnected || !session.sock) {
    throw new Error(`Sesi WhatsApp ${sessionId.toUpperCase()} belum terhubung. Silakan scan QR code di admin.`);
  }

  const jid = toJid(phone);

  // 1. Cek apakah nomor terdaftar di WhatsApp
  try {
    const [result] = await session.sock.onWhatsApp(jid);
    if (!result?.exists) {
      throw new Error(`Nomor ${phone} tidak terdaftar di WhatsApp.`);
    }
  } catch (err) {
    if (err.message.includes('tidak terdaftar')) throw err;
    // Abaikan jika check onWhatsApp error sementara
  }

  // 2. Simulasi typing 'composing' 2 detik untuk anti-ban
  try {
    await session.sock.sendPresenceUpdate('composing', jid);
    await new Promise(r => setTimeout(r, 2000));
  } catch (_) {}

  // 3. Kirim pesan
  const sentResult = await session.sock.sendMessage(jid, { text });
  try {
    await session.sock.sendPresenceUpdate('paused', jid);
  } catch (_) {}

  const waMessageId = sentResult?.key?.id || null;
  logger.info({ sessionId, phone, waMessageId }, 'WhatsApp message dispatched successfully');
  return waMessageId;
}

function getSessionState(sessionId) {
  const session = getSession(sessionId);
  return {
    sessionId: session.sessionId,
    label: session.label,
    connected: session.isConnected,
    phone: session.phone,
    name: session.name,
    is_session_corrupted: session.isSessionCorrupted,
  };
}

function getLatestQr(sessionId) {
  const session = getSession(sessionId);
  return {
    qr_base64: session.lastQrBase64,
    expires_at: session.qrExpiresAt,
  };
}

async function initAllSessions() {
  await loadBaileys();
  for (const sid of ['cpp', 'cpw']) {
    connectSession(sid).catch(err => {
      logger.error({ sessionId: sid, err: err.message }, 'Failed to start initial connection for session');
    });
  }
}

module.exports = {
  sessions,
  initAllSessions,
  connectSession,
  logoutSession,
  reconnectSession,
  sendTextMessage,
  getSessionState,
  getLatestQr,
};
