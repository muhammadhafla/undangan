'use strict';

const { logger } = require('./utils/logger');
const { initDatabase, closeDatabase } = require('./db/queue.db');
const { initAllSessions } = require('./services/baileys.service');
const { startQueueWorker, stopQueueWorker } = require('./services/queue.service');
const { initSupabaseWorker, stopSupabaseWorker } = require('./services/supabase.worker');

async function main() {
  const appName = process.env.APP_NAME || 'undangan-hf-wa-bridge';
  process.title = appName;

  console.log(`
  =======================================================
    UNDANGAN WA BRIDGE - DUAL SESSION (CPP & CPW)
    Job Name: ${appName}
    Tema: Hafla & Fifi Wedding (H&F)
    Zero Inbound Port • Supabase Realtime • Anti-Ban Jitter
  =======================================================
  `);

  logger.info({ appName }, 'Starting Undangan WA Bridge Worker...');

  // 1. Inisialisasi Database Antrean SQLite Lokal
  initDatabase();

  // 2. Mulai Worker Pemrosesan Antrean Pengiriman
  startQueueWorker();

  // 3. Mulai Worker Sinkronisasi Supabase Realtime
  initSupabaseWorker();

  // 4. Inisialisasi Soket Baileys (CPP & CPW)
  await initAllSessions();

  logger.info('✅ Worker siap! QR Code dan status tersinkronisasi ke Dashboard Admin.');

  // Graceful Shutdown
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutdown signal received. Cleaning up...');
    stopQueueWorker();
    stopSupabaseWorker();
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, 'Fatal error during startup');
  process.exit(1);
});
