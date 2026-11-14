/**
 * PM2 Process Configuration for Undangan WhatsApp Bridge
 * Memungkinkan identifikasi job yang unik dan intuitif saat berjalan bersamaan dengan bridge lain (seperti bms-wa-bridge).
 *
 * Penggunaan:
 *   pm2 start ecosystem.config.js
 *   pm2 logs undangan-hf-wa-bridge
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const appName = process.env.APP_NAME || 'undangan-hf-wa-bridge';

module.exports = {
  apps: [
    {
      name: appName,
      script: 'src/index.js',
      instances: 1, // 1 proses menangani kedua soket (CPP & CPW)
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        APP_NAME: appName,
        PROCESS_TITLE: appName,
      },
      error_file: './data/logs/pm2-error.log',
      out_file: './data/logs/pm2-out.log',
      time: true,
    },
  ],
};
