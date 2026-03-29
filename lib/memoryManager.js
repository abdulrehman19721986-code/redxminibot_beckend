const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

let forwardedCache = null;
let chatMemory = null;

function setCaches(forwarded, chat) {
  forwardedCache = forwarded;
  chatMemory = chat;
}

// Heroku free: 512MB. We clean aggressively but NEVER restart automatically.
// Manual restart can be triggered via .panel or Heroku dashboard.
const MEMORY_CLEAN_MB = 350;   // start cleanup
const MEMORY_WARN_MB  = 420;   // warn owner
const MEMORY_HARD_MB  = 490;   // last-resort aggressive clean (no restart)
const CHECK_INTERVAL  = 60000; // every 60s

let ownerNotified = false;
let sockRef = null;
let ownerJid = null;

function setSockRef(sock, ownerNumber) {
  sockRef = sock;
  ownerJid = ownerNumber ? ownerNumber.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null;
}

async function cleanupMemory(level = 'normal') {
  console.log(`[MEM] 🧹 Cleanup (${level})...`);

  if (forwardedCache && typeof forwardedCache.clear === 'function') {
    forwardedCache.clear();
  }
  if (chatMemory) {
    if (chatMemory.messages) chatMemory.messages.clear();
    if (chatMemory.userInfo) chatMemory.userInfo.clear();
  }

  // Clean tmp/temp folders
  for (const dir of ['tmp', 'temp']) {
    const fullPath = path.join(process.cwd(), dir);
    if (fs.existsSync(fullPath)) {
      try {
        const files = fs.readdirSync(fullPath);
        let cleaned = 0;
        for (const file of files) {
          const filePath = path.join(fullPath, file);
          try {
            const stat = fs.statSync(filePath);
            // On normal clean: remove files older than 10 min
            // On aggressive clean: remove all files
            const ageMs = Date.now() - stat.mtimeMs;
            if (level === 'aggressive' || ageMs > 10 * 60 * 1000) {
              fs.unlinkSync(filePath);
              cleaned++;
            }
          } catch {}
        }
        if (cleaned > 0) console.log(`[MEM] Cleaned ${cleaned} files from /${dir}`);
      } catch {}
    }
  }

  if (global.gc) {
    try { global.gc(); } catch {}
  }
}

function checkMemory() {
  const usage = process.memoryUsage();
  const heapMB = usage.heapUsed / 1024 / 1024;
  const rssMB  = usage.rss / 1024 / 1024;

  console.log(`[MEM] Heap: ${heapMB.toFixed(1)}MB | RSS: ${rssMB.toFixed(1)}MB`);

  if (rssMB >= MEMORY_HARD_MB) {
    console.warn(`[MEM] ⚠️ CRITICAL ${rssMB.toFixed(0)}MB — aggressive cleanup`);
    cleanupMemory('aggressive');
    if (sockRef && ownerJid && !ownerNotified) {
      ownerNotified = true;
      sockRef.sendMessage(ownerJid, {
        text: `⚠️ *REDX BOT — Memory Warning*\n\nRAM: ${rssMB.toFixed(0)}MB / 512MB\n\nAggressive cleanup done. Bot is *NOT* restarting.\n\nIf bot becomes slow, use \`.cleartmp\` or restart from Heroku dashboard.`
      }).catch(() => {});
      setTimeout(() => { ownerNotified = false; }, 30 * 60 * 1000); // re-notify after 30 min
    }
  } else if (rssMB >= MEMORY_WARN_MB) {
    console.warn(`[MEM] ⚠️ High RAM ${rssMB.toFixed(0)}MB — running cleanup`);
    cleanupMemory('normal');
  } else if (rssMB >= MEMORY_CLEAN_MB) {
    cleanupMemory('light');
  }
}

function startMonitoring() {
  console.log('[MEM] 📊 Memory monitor started (no-restart mode)');
  setInterval(checkMemory, CHECK_INTERVAL);
  setTimeout(checkMemory, 10000);
}

module.exports = { startMonitoring, setCaches, cleanupMemory, setSockRef };
