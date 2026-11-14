'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { config } = require('../utils/config');
const { logger } = require('../utils/logger');

let db;

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

function initDatabase() {
  const dir = path.dirname(config.queueDbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(config.queueDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS message_queue (
      id            TEXT PRIMARY KEY,
      session_id    TEXT NOT NULL DEFAULT 'cpp',
      phone         TEXT NOT NULL,
      type          TEXT NOT NULL DEFAULT 'text',
      payload       TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      retry_count   INTEGER NOT NULL DEFAULT 0,
      last_error    TEXT,
      retry_after   TEXT,
      wa_message_id TEXT,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      sent_at       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_status ON message_queue(status);
    CREATE INDEX IF NOT EXISTS idx_session ON message_queue(session_id);
    CREATE INDEX IF NOT EXISTS idx_status_session ON message_queue(status, session_id);
    CREATE INDEX IF NOT EXISTS idx_status_retry ON message_queue(status, retry_after);
    CREATE INDEX IF NOT EXISTS idx_wa_msg_id ON message_queue(wa_message_id);
  `);

  logger.info({ path: config.queueDbPath }, 'Queue database initialized with dual-session support');
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

const stmts = {};
function getStmt(key, sql) {
  if (!stmts[key]) stmts[key] = getDb().prepare(sql);
  return stmts[key];
}

function insertQueueItem({ id, sessionId = 'cpp', phone, type = 'text', payload, sendAfter = null }) {
  const stmt = getStmt('insertQueueItem', `
    INSERT INTO message_queue (id, session_id, phone, type, payload, status, retry_count, last_error, retry_after)
    VALUES (@id, @sessionId, @phone, @type, @payload, 'pending', 0, NULL, @retry_after)
    ON CONFLICT(id) DO UPDATE SET
      session_id = excluded.session_id,
      phone = excluded.phone,
      type = excluded.type,
      payload = excluded.payload,
      status = 'pending',
      retry_count = 0,
      last_error = NULL,
      retry_after = excluded.retry_after,
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  `);
  stmt.run({
    id,
    sessionId: (sessionId || 'cpp').toLowerCase(),
    phone,
    type,
    payload: JSON.stringify(payload),
    retry_after: sendAfter
  });
}

function getPendingItemsBySession(sessionId, limit = 5) {
  return getStmt('getPendingItemsBySession', `
    SELECT * FROM message_queue
    WHERE status = 'pending'
      AND session_id = ?
      AND (retry_after IS NULL OR retry_after <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    ORDER BY created_at ASC
    LIMIT ?
  `).all(sessionId, limit);
}

function markProcessing(id) {
  getStmt('markProcessing', `
    UPDATE message_queue
    SET status = 'processing', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?
  `).run(id);
}

function markSent(id) {
  getStmt('markSent', `
    UPDATE message_queue
    SET status = 'sent',
        sent_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        last_error = NULL
    WHERE id = ?
  `).run(id);
}

function setWaMessageId(id, waMessageId) {
  if (!id || !waMessageId) return;
  getStmt('setWaMessageId', `
    UPDATE message_queue
    SET wa_message_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?
  `).run(waMessageId, id);
}

function markDelivered(waMessageId) {
  if (!waMessageId) return null;
  const item = getMessageByWaId(waMessageId);
  const result = getStmt('markDelivered', `
    UPDATE message_queue
    SET status = 'delivered', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE wa_message_id = ? AND status = 'sent'
  `).run(waMessageId);
  if (result.changes > 0) {
    return { queueId: item?.id, changes: result.changes };
  }
  return null;
}

function markRead(waMessageId) {
  if (!waMessageId) return null;
  const item = getMessageByWaId(waMessageId);
  const result = getStmt('markRead', `
    UPDATE message_queue
    SET status = 'read', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE wa_message_id = ? AND status IN ('sent', 'delivered')
  `).run(waMessageId);
  if (result.changes > 0) {
    return { queueId: item?.id, changes: result.changes };
  }
  return null;
}

function markFailed(id, errorMessage) {
  getStmt('markFailed', `
    UPDATE message_queue
    SET status = 'failed',
        last_error = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?
  `).run(errorMessage, id);
}

function incrementRetry(id, errorMessage, retryAfterISO = null) {
  getStmt('incrementRetry', `
    UPDATE message_queue
    SET status = 'pending',
        retry_count = retry_count + 1,
        last_error = ?,
        retry_after = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?
  `).run(errorMessage, retryAfterISO, id);
}

function getItemById(id) {
  return getStmt('getItemById', 'SELECT * FROM message_queue WHERE id = ?').get(id);
}

function getMessageByWaId(waMessageId) {
  if (!waMessageId) return null;
  return getStmt('getMessageByWaId', 'SELECT * FROM message_queue WHERE wa_message_id = ?').get(waMessageId);
}

function getQueueStats(sessionId = null) {
  if (sessionId) {
    return getStmt('getQueueStatsBySession', `
      SELECT status, COUNT(*) as count
      FROM message_queue
      WHERE session_id = ?
      GROUP BY status
    `).all(sessionId).reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, { pending: 0, processing: 0, sent: 0, delivered: 0, read: 0, failed: 0 });
  }

  return getStmt('getQueueStatsTotal', `
    SELECT status, COUNT(*) as count
    FROM message_queue
    GROUP BY status
  `).all().reduce((acc, row) => {
    acc[row.status] = row.count;
    return acc;
  }, { pending: 0, processing: 0, sent: 0, delivered: 0, read: 0, failed: 0 });
}

function markCancelled(id) {
  getStmt('markCancelled', `
    UPDATE message_queue
    SET status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?
  `).run(id);
}

function resetStuckItems() {
  const result = getStmt('resetStuckItems', `
    UPDATE message_queue
    SET status = 'pending', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE status = 'processing'
  `).run();
  if (result.changes > 0) {
    logger.warn({ count: result.changes }, 'Reset stuck processing items to pending');
  }
}

module.exports = {
  initDatabase,
  closeDatabase,
  insertQueueItem,
  getPendingItemsBySession,
  markProcessing,
  markSent,
  setWaMessageId,
  markDelivered,
  markRead,
  markFailed,
  incrementRetry,
  getItemById,
  getMessageByWaId,
  getQueueStats,
  markCancelled,
  resetStuckItems,
};
