'use strict';

const path = require('path');
const fs = require('fs');

// Muat .env dari folder wa-bridge atau root project
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
if (!process.env.SUPABASE_URL) {
  require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
}

const baseDataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '../../data'));
const sessionRootDir = path.join(baseDataDir, 'wa-session');
const queueDbPath = path.join(baseDataDir, 'wa-queue.db');

if (!fs.existsSync(baseDataDir)) {
  fs.mkdirSync(baseDataDir, { recursive: true });
}

const config = {
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  minDelayMs: parseInt(process.env.BROADCAST_MIN_DELAY_MS || '5000', 10),
  maxDelayMs: parseInt(process.env.BROADCAST_MAX_DELAY_MS || '12000', 10),
  baseDataDir,
  sessionRootDir,
  queueDbPath,
};

module.exports = { config };
