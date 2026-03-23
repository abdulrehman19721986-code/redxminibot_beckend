'use strict';
/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  🔥 REDXBOT302 — FINAL EDITION v5.2.0                  ║
 * ║  No SESSION_ID · Pair Only · Separate Files             ║
 * ║  Owner: Abdul Rehman Rajpoot (+923009842133)             ║
 * ╚══════════════════════════════════════════════════════════╝
 */

const express  = require('express');
const cors     = require('cors');
const http     = require('http');
const socketIo = require('socket.io');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
require('dotenv').config();

const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const P = require('pino');

// ── Local modules ────────────────────────────────────────────
const cfg    = require('./lib/config');
const loader = require('./lib/loader');
const menu   = require('./lib/menu');
const store  = require('./lib/store');
const fvc    = require('./lib/fakevcard');
const { getBody, getQuoted, getMentioned, react, formatRuntime } = require('./lib/utils');

// ── Express + Socket.IO ───────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, { cors: { origin: '*' }, transports: ['websocket', 'polling'] });
const PORT   = process.env.PORT || 3000;
const START  = Date.now();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── State ─────────────────────────────────────────────────────
global.BOT_MODE  = store.settings.get('mode') || process.env.BOT_MODE || 'public';
let ADMIN_USER   = process.env.ADMIN_USERNAME || 'redx';
let ADMIN_PASS   = process.env.ADMIN_PASSWORD || 'redx';

// ── Paths ─────────────────────────────────────────────────────
const SESS_DIR = path.join(__dirname, 'sessions');
const DATA_DIR = path.join(__dirname, 'data');
[SESS_DIR, DATA_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Helpers ────────────────────────────────────────────────────
const jLoad = (f, d) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; } catch { return d; } };
const jSave = (f, d) => { try { fs.writeFileSync(f, JSON.stringify(d, null, 2)); } catch {} };

// ── Deploy ID ──────────────────────────────────────────────────
const DID_FILE = path.join(DATA_DIR, 'deploy_id.txt');
const DEPLOY_ID = (() => {
  if (fs.existsSync(DID_FILE)) return fs.readFileSync(DID_FILE, 'utf8').trim();
  const id = process.env.DEPLOY_ID || ('REDX-' + crypto.randomBytes(4).toString('hex').toUpperCase());
  fs.writeFileSync(DID_FILE, id); return id;
})();
module.exports = { DEPLOY_ID };

const getPlatform = () => {
  if (process.env.DYNO)                return 'Heroku';
  if (process.env.RAILWAY_ENVIRONMENT) return 'Railway';
  if (process.env.RENDER)              return 'Render';
  return 'Local/VPS';
};

// ── Persistent stores ──────────────────────────────────────────
let stats   = { totalUsers: 0, pairCount: 0, ...jLoad(path.join(DATA_DIR, 'stats.json'), {}) };
let deploys = jLoad(path.join(DATA_DIR, 'deploys.json'), {});
let servers = jLoad(path.join(DATA_DIR, 'servers.json'), []);
const saveSt  = () => jSave(path.join(DATA_DIR, 'stats.json'),   { ...stats, ts: new Date().toISOString() });
const saveDep = () => jSave(path.join(DATA_DIR, 'deploys.json'), deploys);
const saveSrv = () => jSave(path.join(DATA_DIR, 'servers.json'), servers);
setInterval(saveSt, 30000);
module.exports.deploys = deploys;

// Ensure current deploy entry
if (!deploys[DEPLOY_ID]) {
  deploys[DEPLOY_ID] = {
    id: DEPLOY_ID, platform: getPlatform(), createdAt: new Date().toISOString(),
    numbers: [], pairCount: 0, botName: cfg.BOT_NAME, ownerName: cfg.OWNER_NAME,
    prefix: cfg.PREFIX, mode: 'public',
    deployKey: crypto.randomBytes(24).toString('hex'),
  };
  saveDep();
}
deploys[DEPLOY_ID].lastSeen = new Date().toISOString();
deploys[DEPLOY_ID].platform = getPlatform();
saveDep();

// ── In-memory ──────────────────────────────────────────────────
const conns   = new Map(); // number → { conn, saveCreds, connected, welcomed, attempts }
const admSess = new Map(); // token  → { user, ts }
// Menu reply map: number → selectedMenuPage (1-15)
const menuReply  = new Map(); // msgId → { from, catNum }
// Spam counter
const spamCount  = new Map(); // jid → { count, ts }

// ── Load plugins ───────────────────────────────────────────────
loader.load(path.join(__dirname, 'plugins'));
// Watch for hot reload
fs.watch(path.join(__dirname, 'plugins'), (e, f) => {
  if (f?.endsWith('.js')) {
    loader.load(path.join(__dirname, 'plugins'));
    io.emit('pluginsReloaded', { count: loader.count });
  }
});

const broadcastStats = () => {
  const active = [...conns.values()].filter(c => c.connected).length;
  io.emit('stats', { active, total: stats.totalUsers, pairs: stats.pairCount, uptime: Math.floor((Date.now() - START) / 1000), commands: loader.count + 8 });
};

// ════════════════════════════════════════════════════════════
//  BOT CONNECTION  (Arslan-MD per-number architecture)
// ════════════════════════════════════════════════════════════
async function initConn(number) {
  const sessDir = path.join(SESS_DIR, number);
  if (!fs.existsSync(sessDir)) fs.mkdirSync(sessDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(sessDir);
  const { version }          = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version, logger: P({ level: 'silent' }), printQRInTerminal: false,
    auth: state, browser: Browsers.macOS('Safari'),
    connectTimeoutMs: 30000, keepAliveIntervalMs: 10000,
    defaultQueryTimeoutMs: 30000, retryRequestDelayMs: 250,
    maxRetries: 5, markOnlineOnConnect: true, syncFullHistory: false,
  });

  const prev = conns.get(number) || {};
  conns.set(number, { conn: sock, saveCreds, connected: false, welcomed: prev.welcomed || false, attempts: prev.attempts || 0 });
  setupHandlers(sock, number, saveCreds);
  return sock;
}

function setupHandlers(sock, number, saveCreds) {
  const entry = conns.get(number);

  sock.ev.on('creds.update', async () => { try { await saveCreds(); } catch {} });

  // ── Connection state ─────────────────────────────────────
  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    console.log(`[${number}] ${connection}`);

    if (connection === 'open') {
      entry.connected = true; entry.attempts = 0;
      stats.pairCount++; stats.totalUsers++;
      saveSt();
      const dep = deploys[DEPLOY_ID];
      if (!dep.numbers.includes(number)) dep.numbers.push(number);
      dep.pairCount = (dep.pairCount || 0) + 1;
      dep.lastPaired = new Date().toISOString();
      saveDep();
      broadcastStats();
      io.emit('linked',    { number });
      io.emit('botStatus', { connected: true, number, deployId: DEPLOY_ID, platform: getPlatform() });
      if (!entry.welcomed) { entry.welcomed = true; setTimeout(() => sendWelcome(sock, number).catch(() => {}), 3000); }
    }

    if (connection === 'close') {
      entry.connected = false; broadcastStats();
      io.emit('botStatus', { connected: false, number });
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut || code === 401 || code === 405) {
        try { fs.rmSync(path.join(SESS_DIR, number), { recursive: true, force: true }); } catch {}
        conns.delete(number);
        io.emit('unlinked', { number });
      } else if (entry.attempts < 10) {
        entry.attempts++;
        setTimeout(async () => {
          try { sock.ev.removeAllListeners(); sock.ws?.terminate(); await initConn(number); } catch (e) { console.error(e.message); }
        }, Math.min(3000 * entry.attempts, 20000));
      } else { conns.delete(number); io.emit('unlinked', { number }); }
    }
  });

  // ── Group events ─────────────────────────────────────────
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    if (!id.endsWith('@g.us')) return;
    const dep    = deploys[DEPLOY_ID];
    const prefix = dep?.prefix || cfg.PREFIX;

    if (action === 'add' && store.settings.get('welcome_' + id)) {
      const gm = await sock.groupMetadata(id).catch(() => null);
      for (const p of participants) {
        const txt = `🎉 *Welcome to ${gm?.subject || 'the group'}!*\n\n@${p.split('@')[0]}, glad to have you here!\n\n> 🔥 Type *${prefix}menu* to see bot commands`;
        sock.sendMessage(id, { text: txt, mentions: [p] }, { quoted: fvc });
      }
    }
    if (action === 'remove' && store.settings.get('goodbye_' + id)) {
      const gm = await sock.groupMetadata(id).catch(() => null);
      for (const p of participants) {
        const txt = `👋 *Goodbye!*\n\n@${p.split('@')[0]} has left ${gm?.subject || 'the group'}.\n> 🔥 REDXBOT302`;
        sock.sendMessage(id, { text: txt, mentions: [p] }, { quoted: fvc });
      }
    }
  });

  // ── Auto-reject calls ─────────────────────────────────────
  sock.ev.on('call', async (calls) => {
    if (!store.anticall.get('enabled')) return;
    for (const call of calls) {
      if (call.status === 'offer') {
        await sock.rejectCall(call.id, call.from);
        sock.sendMessage(call.from, { text: `📵 Calls are disabled on this bot.\n> 🔥 REDXBOT302` });
      }
    }
  });

  // ── Messages ──────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try { await handleMsg(sock, msg, number); } catch (e) { console.error(e.message); }
    }
  });

  // ── Message delete (antidelete) ───────────────────────────
  sock.ev.on('messages.delete', async ({ keys }) => {
    if (!keys?.length) return;
    for (const key of keys) {
      if (!store.antidel.get(key.remoteJid)) continue;
      // We'd need to have the original message cached — simplified version
      sock.sendMessage(key.remoteJid, { text: `♻️ *Anti-Delete:* A message was deleted by @${key.participant?.split('@')[0] || 'someone'}`, mentions: key.participant ? [key.participant] : [] }, { quoted: fvc });
    }
  });
}

// ── Welcome message (single professional message) ─────────────
async function sendWelcome(sock, number) {
  const dep    = deploys[DEPLOY_ID];
  const jid    = `${number}@s.whatsapp.net`;
  const pfx    = dep?.prefix || cfg.PREFIX;
  let name     = 'User';
  try { name = sock.user?.name || sock.user?.notify || 'User'; } catch {}

  const welcomeText =
    `╭┈━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
    `┃   🔥 *REDXBOT302 v5.2.0* 🔥   ┃\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━┈╯\n\n` +
    `👋 *Hey ${name}!*\n` +
    `✅ *Bot Connected Successfully!*\n\n` +
    `╭─── 📋 Bot Info ───╮\n` +
    `│ 📱 Number  : *+${number}*\n` +
    `│ 🆔 Deploy  : \`${DEPLOY_ID}\`\n` +
    `│ 🌐 Platform: *${getPlatform()}*\n` +
    `│ 👑 Owner   : *${dep?.ownerName || cfg.OWNER_NAME}*\n` +
    `│ 📦 Commands: *${loader.count + 8}+*\n` +
    `│ 📌 Prefix  : *${pfx}*\n` +
    `│ 🌍 Mode    : *${global.BOT_MODE.toUpperCase()}*\n` +
    `│ 🖼️ Version : *5.2.0*\n` +
    `╰──────────────────╯\n\n` +
    `🔑 *Your Secret Deploy Key:*\n` +
    `\`\`\`\n${dep?.deployKey || 'N/A'}\n\`\`\`\n` +
    `⚠️ *KEEP THIS PRIVATE — NEVER SHARE!*\n\n` +
    `📌 Use this key on the dashboard to:\n` +
    `  • View/manage your bot live\n` +
    `  • Change prefix, mode, name\n` +
    `  • Restart or logout your bot\n\n` +
    `╭──── 💡 Quick Start ────╮\n` +
    `│ ${pfx}menu   → Select category\n` +
    `│ ${pfx}allmenu → All commands list\n` +
    `│ ${pfx}help   → This help message\n` +
    `╰─────────────────────╯\n\n` +
    `> 🌐 WA Group: ${cfg.WA_GROUP}\n` +
    `> 📲 Telegram: ${cfg.TG_GROUP}\n` +
    `> 🔥 *REDXBOT302* — By *${cfg.OWNER_NAME}*`;

  // Single message with image thumbnail — no double image
  await sock.sendMessage(jid, {
    text: welcomeText,
    contextInfo: {
      forwardingScore:     999,
      isForwarded:         true,
      forwardedNewsletterMessageInfo: {
        newsletterJid:   cfg.NL_JID,
        newsletterName:  '🔥 REDXBOT302',
        serverMessageId: -1,
      },
      externalAdReply: {
        title:                 '🔥 REDXBOT302 — Connected!',
        body:                  `Deploy: ${DEPLOY_ID} | ${getPlatform()}`,
        thumbnailUrl:          cfg.BOT_IMG,
        sourceUrl:             cfg.REPO,
        mediaType:             1,
        renderLargerThumbnail: false,
      },
    },
  });
}

// ════════════════════════════════════════════════════════════
//  MESSAGE HANDLER
// ════════════════════════════════════════════════════════════
async function handleMsg(sock, msg, sessionId) {
  const from   = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const sNum   = sender.split('@')[0].split(':')[0];
  const isOwner= sNum === cfg.OWNER_NUM || sNum === cfg.CO_OWNER || sNum === sessionId;
  const isGroup= from.endsWith('@g.us');

  // ── Status reactions ──────────────────────────────────────
  if (from === 'status@broadcast') {
    if (process.env.AUTO_STATUS_SEEN !== 'false') sock.readMessages([msg.key]).catch(() => {});
    if (process.env.AUTO_STATUS_REACT !== 'false') {
      const emojis = ['🔥','⚡','💯','👑','🚀','💎','❤️','💜','✨','🌟'];
      sock.sendMessage(from, { react: { text: emojis[Math.floor(Math.random()*emojis.length)], key: msg.key } }, { statusJidList: [sender, sock.user.id] }).catch(() => {});
    }
    return;
  }

  if (!msg.message || from?.endsWith('@newsletter')) return;
  if (store.blocked.get(sender)) return;
  if (global.BOT_MODE === 'private' && !isOwner) return;

  const dep    = deploys[DEPLOY_ID];
  const pfx    = dep?.prefix || cfg.PREFIX;
  const body   = getBody(msg);
  const quoted = getQuoted(msg);
  const mentioned = getMentioned(msg);

  // ── ANTI-SPAM CHECK ───────────────────────────────────────
  if (isGroup && store.antispam.get(from)) {
    const key  = `${from}:${sender}`;
    const now  = Date.now();
    const sc   = spamCount.get(key) || { count: 0, ts: now };
    if (now - sc.ts > 5000) { spamCount.set(key, { count: 1, ts: now }); }
    else {
      sc.count++;
      spamCount.set(key, sc);
      if (sc.count > 8 && !isOwner && !await require('./lib/utils').isAdmin(sock, from, sender)) {
        await sock.groupParticipantsUpdate(from, [sender], 'remove').catch(() => {});
        sock.sendMessage(from, { text: `🚫 @${sender.split('@')[0]} kicked for spamming!`, mentions: [sender] }, { quoted: fvc });
        spamCount.delete(key);
        return;
      }
    }
  }

  // ── ANTI-LINK CHECK ───────────────────────────────────────
  if (isGroup && store.antilink.get(from)) {
    if (/https?:\/\/|chat\.whatsapp\.com/i.test(body) && !isOwner && !await require('./lib/utils').isAdmin(sock, from, sender)) {
      await sock.groupParticipantsUpdate(from, [sender], 'remove').catch(() => {});
      sock.sendMessage(from, { text: `🚫 @${sender.split('@')[0]} kicked for sending links!`, mentions: [sender] }, { quoted: fvc });
      return;
    }
  }

  // ── ANTI-TAG CHECK ────────────────────────────────────────
  if (isGroup && store.antitag.get(from)) {
    if (mentioned.length > 5 && !isOwner && !await require('./lib/utils').isAdmin(sock, from, sender)) {
      await sock.groupParticipantsUpdate(from, [sender], 'remove').catch(() => {});
      sock.sendMessage(from, { text: `🚫 @${sender.split('@')[0]} kicked for bulk tagging!`, mentions: [sender] }, { quoted: fvc });
      return;
    }
  }

  // ── CHATBOT MODE ──────────────────────────────────────────
  if (store.chatbot.get(from) && body && !body.startsWith(pfx)) {
    const axios = require('axios');
    try {
      const { data } = await axios.get(`https://api.ryzendesu.vip/api/ai/chatgpt?text=${encodeURIComponent(body)}`, { timeout: 15000 });
      const r = data.response || data.result;
      if (r) sock.sendMessage(from, { text: r }, { quoted: msg });
    } catch {}
    return;
  }

  // ── CHECK PENDING DOWNLOAD REPLY (SONG / VIDEO) ───────────
  const { pendingDownloads, handleDownloadReply } = require('./plugins/04-downloader');
  const replyCtx = msg.message?.extendedTextMessage?.contextInfo;
  if (replyCtx?.stanzaId && ['1','2','3'].includes(body.trim())) {
    if (await handleDownloadReply(sock, msg, body.trim(), replyCtx.stanzaId)) return;
  }

  // ── CHECK MENU SELECTION REPLY ────────────────────────────
  if (replyCtx?.stanzaId && menuReply.has(replyCtx.stanzaId)) {
    const choice = parseInt(body.trim());
    if (choice >= 1 && choice <= 15) {
      const catId = menu.CATEGORIES.find(c => c.num === choice)?.id;
      if (catId) {
        const catMenu = menu.buildCategoryMenu(catId, loader.getAll(), pfx);
        await sock.sendMessage(from, { image: { url: cfg.BOT_IMG }, caption: catMenu }, { quoted: msg });
        menuReply.delete(replyCtx.stanzaId);
        return;
      }
    }
    menuReply.delete(replyCtx.stanzaId);
  }

  // ── MUST START WITH PREFIX ────────────────────────────────
  if (!body.startsWith(pfx)) return;

  const args  = body.slice(pfx.length).trim().split(/ +/);
  const cmd   = args.shift().toLowerCase();
  const q     = body.slice(pfx.length + cmd.length).trim();

  // ── BUILT-IN COMMANDS ─────────────────────────────────────
  if (await handleBuiltin(sock, msg, cmd, args, q, from, sender, isOwner, pfx, isGroup)) return;

  // ── PLUGIN COMMANDS ───────────────────────────────────────
  if (loader.has(cmd)) {
    const plugin = loader.get(cmd);
    try {
      let gMeta = null, isAdmin = false;
      if (isGroup) {
        try { gMeta = await sock.groupMetadata(from); } catch {}
        if (gMeta) { const p = gMeta.participants.find(p => p.id === sender); isAdmin = p?.admin === 'admin' || p?.admin === 'superadmin'; }
      }
      const reply = (text, opts = {}) => sock.sendMessage(from, { text }, { quoted: msg, ...opts });
      await plugin.execute(sock, msg, { mentionedJid: mentioned, quoted, sender, key: msg.key, message: msg.message, isGroup, gMeta },
        { args, q, reply, from, isGroup, groupMetadata: gMeta, sender, isAdmin, isOwner, botName: cfg.BOT_NAME, ownerName: cfg.OWNER_NAME, prefix: pfx, senderNumber: sNum });
    } catch (e) { console.error(`[${cmd}]: ${e.message}`); }
  }
}

// ════════════════════════════════════════════════════════════
//  BUILT-IN COMMANDS
// ════════════════════════════════════════════════════════════
async function handleBuiltin(sock, msg, cmd, args, q, from, sender, isOwner, pfx, isGroup) {
  const dep = deploys[DEPLOY_ID];
  const nlc = {
    forwardingScore: 999, isForwarded: true,
    forwardedNewsletterMessageInfo: { newsletterJid: cfg.NL_JID, newsletterName: '🔥 REDXBOT302', serverMessageId: -1 },
    externalAdReply: { title: '🔥 REDXBOT302', body: `Owner: ${cfg.OWNER_NAME}`, thumbnailUrl: cfg.BOT_IMG, sourceUrl: cfg.REPO, mediaType: 1 },
  };
  const s = text => sock.sendMessage(from, { text, contextInfo: nlc }, { quoted: fvc });

  switch (cmd) {
    // ── MENU (interactive select) ──────────────────────────
    case 'menu': case 'm': case 'help': {
      const rt  = formatRuntime(Date.now() - START);
      const txt = menu.buildSelectMenu(pfx, rt, getPlatform(), loader.count + 8, dep.ownerName || cfg.OWNER_NAME, cfg.OWNER_NAME2, '5.2.0');
      const sent = await sock.sendMessage(from, { image: { url: cfg.BOT_IMG }, caption: txt }, { quoted: fvc });
      menuReply.set(sent.key.id, { from, pfx });
      setTimeout(() => menuReply.delete(sent.key.id), 300000);
      return true;
    }
    // ── ALLMENU (full list) ────────────────────────────────
    case 'allmenu': case 'listcmds': {
      const rt  = formatRuntime(Date.now() - START);
      const txt = menu.buildAllMenu(loader.getAll(), pfx, rt, loader.count + 8);
      sock.sendMessage(from, { image: { url: cfg.BOT_IMG }, caption: txt }, { quoted: fvc });
      return true;
    }
    // ── AI 1-15 CATEGORY SHORTCUT ─────────────────────────
    case '1': case '2': case '3': case '4': case '5': case '6':
    case '7': case '8': case '9': case '10': case '11': case '12':
    case '13': case '14': case '15': {
      // Direct category selection via prefix+number
      const catId = menu.CATEGORIES.find(c => c.num === parseInt(cmd))?.id;
      if (catId) {
        const catMenu = menu.buildCategoryMenu(catId, loader.getAll(), pfx);
        sock.sendMessage(from, { image: { url: cfg.BOT_IMG }, caption: catMenu }, { quoted: fvc });
        return true;
      }
      return false;
    }
    // ── PING ──────────────────────────────────────────────
    case 'ping': case 'speed': {
      const t = Date.now(); await react(sock, msg, '⚡');
      s(`⚡ *Pong!* \`${Date.now()-t}ms\`\n💾 ${(process.memoryUsage().heapUsed/1048576).toFixed(1)}MB`);
      return true;
    }
    // ── OWNER ─────────────────────────────────────────────
    case 'owner': {
      await sock.sendMessage(from, { contacts: { displayName: cfg.OWNER_NAME, contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${cfg.OWNER_NAME}\nTEL;type=CELL;waid=${cfg.OWNER_NUM}:+${cfg.OWNER_NUM}\nEND:VCARD` }] } }, { quoted: fvc });
      s(`👑 *${cfg.OWNER_NAME}*\n📱 +${cfg.OWNER_NUM}\n🤝 Co-Owner: *${cfg.OWNER_NAME2}*\n\n🌐 WA Group: ${cfg.WA_GROUP}\n📲 Telegram: ${cfg.TG_GROUP}`);
      return true;
    }
    // ── MODE ──────────────────────────────────────────────
    case 'mode': {
      if (!isOwner) { s('❌ Owner only'); return true; }
      const mv = args[0]?.toLowerCase();
      if (mv === 'public' || mv === 'private') { global.BOT_MODE = mv; dep.mode = mv; store.settings.set('mode', mv); saveDep(); s(`✅ Mode: *${mv.toUpperCase()}*`); }
      else s(`📌 Mode: *${global.BOT_MODE.toUpperCase()}*\n💡 .mode public | private`);
      return true;
    }
    // ── RUNTIME / UPTIME ──────────────────────────────────
    case 'runtime': case 'uptime': {
      const up = process.uptime();
      const h=Math.floor(up/3600),mn=Math.floor((up%3600)/60),sc=Math.floor(up%60);
      s(`⏱️ *Runtime*\n\n⏰ *${h}h ${mn}m ${sc}s*\n💾 RAM: ${(process.memoryUsage().heapUsed/1048576).toFixed(1)}MB\n📦 Commands: ${loader.count+8}+`);
      return true;
    }
    // ── DEPLOYID ──────────────────────────────────────────
    case 'deployid': case 'myid': {
      s(`🆔 *Deploy ID:* \`${DEPLOY_ID}\`\n🔑 *Key:* \`${dep?.deployKey?.slice(0,8)}...\`\n🌐 *Platform:* ${getPlatform()}`);
      return true;
    }
    // ── UPDATE/RELOAD ─────────────────────────────────────
    case 'update': case 'reload': {
      if (!isOwner) { s('❌ Owner only'); return true; }
      loader.load(path.join(__dirname, 'plugins'));
      io.emit('pluginsReloaded', { count: loader.count });
      s(`✅ *Plugins reloaded!*\n📦 ${loader.count + 8}+ commands`);
      return true;
    }
    // ── RESTART ───────────────────────────────────────────
    case 'restart': {
      if (!isOwner) { s('❌ Owner only'); return true; }
      s('🔄 *Restarting bot...*');
      setTimeout(() => process.exit(0), 2000);
      return true;
    }
    // ── WELCOME TOGGLE ────────────────────────────────────
    case 'welcome': {
      if (!isGroup) { s('❌ Group only'); return true; }
      const val = args[0]?.toLowerCase();
      if (!['on','off'].includes(val)) { s(`⚙️ .welcome on/off\nCurrent: *${store.settings.get('welcome_'+from)?'ON ✅':'OFF ❌'}*`); return true; }
      store.settings.set('welcome_' + from, val === 'on');
      s(`✅ Welcome messages *${val==='on'?'ON ✅':'OFF ❌'}*`);
      return true;
    }
    // ── GOODBYE TOGGLE ────────────────────────────────────
    case 'goodbye': {
      if (!isGroup) { s('❌ Group only'); return true; }
      const val = args[0]?.toLowerCase();
      if (!['on','off'].includes(val)) { s(`⚙️ .goodbye on/off\nCurrent: *${store.settings.get('goodbye_'+from)?'ON ✅':'OFF ❌'}*`); return true; }
      store.settings.set('goodbye_' + from, val === 'on');
      s(`✅ Goodbye messages *${val==='on'?'ON ✅':'OFF ❌'}*`);
      return true;
    }
    default: return false;
  }
}

// ── Session reload on start ───────────────────────────────────
async function reloadSessions() {
  if (!fs.existsSync(SESS_DIR)) return;
  const dirs = fs.readdirSync(SESS_DIR).filter(d => { try { return fs.statSync(path.join(SESS_DIR,d)).isDirectory(); } catch { return false; } });
  console.log(`📂 Found ${dirs.length} session(s)`);
  for (const n of dirs) {
    if (fs.existsSync(path.join(SESS_DIR, n, 'creds.json'))) {
      try { await initConn(n); } catch (e) { console.error(`Reload ${n}: ${e.message}`); }
    }
  }
  broadcastStats();
}

// ══════════════════════════════════════════════════════════════
//  EXPRESS ROUTES
// ══════════════════════════════════════════════════════════════
app.get('/',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'ok', deploy: DEPLOY_ID }));

app.get('/api/status', (req, res) => {
  const active = [...conns.values()].filter(c => c.connected).length;
  const num    = [...conns.entries()].find(([,v]) => v.connected)?.[0] || '';
  const dep    = deploys[DEPLOY_ID];
  res.json({
    connected: active > 0, active, botNumber: num,
    commands: loader.count + 8, categories: Object.keys(menu.CATEGORIES.reduce((a,c)=>({...a,[c.id]:true}),{})).length,
    categoriesList: menu.CATEGORIES.reduce((a,c) => { a[c.id] = loader.getAll().filter(p=>(p.category||'other')===c.id).map(p=>p.pattern); return a; }, {}),
    totalUsers: stats.totalUsers, pairCount: stats.pairCount,
    uptime: Math.floor((Date.now() - START) / 1000), mode: global.BOT_MODE,
    deployId: DEPLOY_ID, platform: getPlatform(),
    hasSession: fs.existsSync(path.join(SESS_DIR, num || '_', 'creds.json')),
    botName: dep?.botName || cfg.BOT_NAME, ownerName: dep?.ownerName || cfg.OWNER_NAME,
    prefix: dep?.prefix || cfg.PREFIX, version: '5.2.0',
  });
});

app.get('/api/config', (req, res) => res.json({
  botName: cfg.BOT_NAME, ownerName: cfg.OWNER_NAME, coOwner: cfg.OWNER_NAME2,
  prefix: cfg.PREFIX, menuImage: cfg.BOT_IMG, repoLink: cfg.REPO,
  waGroup: cfg.WA_GROUP, tgGroup: cfg.TG_GROUP,
  deployId: DEPLOY_ID, platform: getPlatform(),
  commands: loader.count + 8, categories: menu.CATEGORIES.map(c => ({ id: c.id, name: c.name, emoji: c.emoji, num: c.num })),
}));

// ── PAIR ──────────────────────────────────────────────────────
app.post('/api/pair', async (req, res) => {
  let sock;
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Phone number required' });
    const num = number.replace(/\D/g, '');
    if (num.length < 7) return res.status(400).json({ error: 'Invalid phone number' });
    const ex = conns.get(num);
    if (ex?.connected) return res.status(400).json({ error: 'Already connected! Use logout to re-pair.' });
    if (ex?.conn) { try { ex.conn.ev.removeAllListeners(); ex.conn.ws?.terminate(); } catch {} conns.delete(num); await new Promise(r => setTimeout(r, 600)); }
    const sessDir = path.join(SESS_DIR, num);
    if (!fs.existsSync(sessDir)) fs.mkdirSync(sessDir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(sessDir);
    const { version }          = await fetchLatestBaileysVersion();
    sock = makeWASocket({ version, logger: P({level:'silent'}), printQRInTerminal: false, auth: state, browser: Browsers.macOS('Safari'), connectTimeoutMs: 30000, keepAliveIntervalMs: 10000, defaultQueryTimeoutMs: 30000, retryRequestDelayMs: 250, maxRetries: 5, markOnlineOnConnect: true, syncFullHistory: false });
    conns.set(num, { conn: sock, saveCreds, connected: false, welcomed: false, attempts: 0 });
    setupHandlers(sock, num, saveCreds);
    await new Promise(r => setTimeout(r, 3000)); // Arslan-MD: wait 3s before requesting code
    const code = await sock.requestPairingCode(num);
    const fmt  = (code || '').toString().trim().match(/.{1,4}/g)?.join('-') || code;
    console.log(`📱 Code for ${num}: ${fmt}`);
    return res.json({ success: true, code: fmt, number: num });
  } catch (err) {
    if (sock) { try { sock.ev.removeAllListeners(); sock.ws?.terminate(); } catch {} }
    return res.status(500).json({ error: err.message || 'Pairing failed. Please try again.' });
  }
});

// ── LOGOUT ────────────────────────────────────────────────────
app.post('/api/logout', async (req, res) => {
  try {
    const num = (req.body.number || '').replace(/\D/g, '');
    const go  = n => {
      const e = conns.get(n);
      if (e?.conn) { try { e.conn.ev.removeAllListeners(); e.conn.ws?.terminate(); } catch {} }
      conns.delete(n);
      try { fs.rmSync(path.join(SESS_DIR, n), { recursive: true, force: true }); } catch {}
      io.emit('unlinked', { number: n });
    };
    if (num) go(num);
    else { for (const n of conns.keys()) go(n); }
    broadcastStats(); io.emit('botStatus', { connected: false, number: '' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/reload', (req, res) => {
  loader.load(path.join(__dirname, 'plugins'));
  io.emit('pluginsReloaded', { count: loader.count });
  res.json({ success: true, commands: loader.count });
});

// ── PUBLIC DEPLOY LOOKUP ──────────────────────────────────────
app.get('/api/deploy/:id', (req, res) => {
  const d = deploys[req.params.id.toUpperCase()];
  if (!d) return res.status(404).json({ error: 'Deploy ID not found' });
  res.json({ id: d.id, platform: d.platform, pairCount: d.pairCount || 0, createdAt: d.createdAt, lastSeen: d.lastSeen, numbers: d.numbers?.length || 0 });
});

// ── USER DEPLOY KEY API ───────────────────────────────────────
const dkAuth = (req, res, next) => {
  const key = req.headers['x-deploy-key'] || req.body?.deployKey;
  const dep = Object.values(deploys).find(d => d.deployKey === key);
  if (!dep) return res.status(401).json({ error: 'Invalid deploy key' });
  req.deploy = dep; next();
};

app.post('/api/user/info',    dkAuth, (req, res) => {
  const d = req.deploy;
  const active = [...conns.entries()].filter(([n,v]) => d.numbers.includes(n) && v.connected).length;
  res.json({ id: d.id, platform: d.platform, pairCount: d.pairCount||0, numbers: d.numbers||[], createdAt: d.createdAt, lastSeen: d.lastSeen, botName: d.botName, ownerName: d.ownerName, prefix: d.prefix, mode: d.mode, connected: active > 0, activeConnections: active });
});
app.post('/api/user/update',  dkAuth, (req, res) => {
  const d = req.deploy;
  const { botName, ownerName, ownerNum, prefix, mode } = req.body;
  if (botName)   d.botName   = botName;
  if (ownerName) d.ownerName = ownerName;
  if (ownerNum)  d.ownerNum  = ownerNum;
  if (prefix)    d.prefix    = prefix;
  if (mode && (mode==='public'||mode==='private')) { d.mode = mode; if (d.id===DEPLOY_ID) { global.BOT_MODE = mode; store.settings.set('mode', mode); } }
  saveDep();
  res.json({ success: true, deploy: { id: d.id, botName: d.botName, ownerName: d.ownerName, prefix: d.prefix, mode: d.mode } });
});

// ── PUBLIC servers list (no auth — shown to all users in server selector) ──
app.get('/api/servers', (req, res) => {
  res.json({ servers: servers.map(s => ({ id: s.id, name: s.name, url: s.url, platform: s.platform, description: s.description || '' })) });
});
app.post('/api/user/logout',  dkAuth, async (req, res) => {
  const d = req.deploy;
  for (const n of (d.numbers || [])) {
    const e = conns.get(n);
    if (e?.conn) { try { e.conn.ev.removeAllListeners(); e.conn.ws?.terminate(); } catch {} }
    conns.delete(n);
    try { fs.rmSync(path.join(SESS_DIR, n), { recursive: true, force: true }); } catch {}
  }
  d.numbers = []; saveDep(); broadcastStats();
  res.json({ success: true, message: 'All sessions cleared' });
});
app.post('/api/user/restart', dkAuth, (req, res) => { res.json({ success: true }); setTimeout(() => process.exit(0), 500); });

// ── ADMIN API ─────────────────────────────────────────────────
const admAuth = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  const s = admSess.get(token);
  if (!s || Date.now() - s.ts > 86400000) { admSess.delete(token); return res.status(401).json({ error: 'Unauthorized' }); }
  req.adminUser = s.user; next();
};

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USER || password !== ADMIN_PASS) return res.status(401).json({ error: 'Invalid credentials' });
  const token = crypto.randomBytes(32).toString('hex');
  admSess.set(token, { user: username, ts: Date.now() });
  res.json({ success: true, token, username });
});
app.post('/api/admin/logout', admAuth, (req, res) => { admSess.delete(req.headers['x-admin-token']); res.json({ success: true }); });

app.get('/api/admin/overview', admAuth, (req, res) => res.json({
  stats: { totalDeploys: Object.keys(deploys).length, totalPairs: stats.pairCount, totalUsers: stats.totalUsers, uptime: Math.floor((Date.now()-START)/1000), commands: loader.count+8 },
  deploys: Object.values(deploys), servers,
  connections: [...conns.entries()].map(([n,v]) => ({ number: '+'+n, connected: v.connected })),
  platform: getPlatform(), adminUser: req.adminUser, nodeVersion: process.version,
  memUsage: process.memoryUsage(), botVersion: '5.2.0',
}));
app.get('/api/admin/deploys',         admAuth, (req, res) => res.json({ deploys: Object.values(deploys) }));
app.delete('/api/admin/deploys/:id',  admAuth, (req, res) => {
  const id = req.params.id.toUpperCase();
  if (id === DEPLOY_ID) return res.status(400).json({ error: 'Cannot remove current deploy' });
  delete deploys[id]; saveDep(); res.json({ success: true });
});
app.get('/api/admin/servers',         admAuth, (req, res) => res.json({ servers }));
app.post('/api/admin/servers',        admAuth, (req, res) => {
  const { name, url, platform: p, description } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Name and URL required' });
  const srv = { id: crypto.randomBytes(4).toString('hex'), name, url, platform: p||'Unknown', description: description||'', addedAt: new Date().toISOString() };
  servers.push(srv); saveSrv(); res.json({ success: true, server: srv });
});
app.delete('/api/admin/servers/:id',  admAuth, (req, res) => { servers = servers.filter(s => s.id !== req.params.id); saveSrv(); res.json({ success: true }); });
app.post('/api/admin/bot/restart',    admAuth, (req, res) => { res.json({ success: true }); setTimeout(() => process.exit(0), 500); });
app.post('/api/admin/bot/logout',     admAuth, async (req, res) => {
  for (const [n,e] of conns) { if (e?.conn) { try { e.conn.ev.removeAllListeners(); e.conn.ws?.terminate(); } catch {} } try { fs.rmSync(path.join(SESS_DIR,n),{recursive:true,force:true}); } catch {} }
  conns.clear(); broadcastStats(); io.emit('botStatus',{connected:false}); res.json({success:true});
});
app.post('/api/admin/plugins/reload', admAuth, (req, res) => {
  loader.load(path.join(__dirname, 'plugins'));
  io.emit('pluginsReloaded', { count: loader.count });
  res.json({ success: true, commands: loader.count });
});
app.post('/api/admin/settings',       admAuth, (req, res) => {
  const { newUsername, newPassword, currentPassword } = req.body;
  if (currentPassword !== ADMIN_PASS) return res.status(403).json({ error: 'Wrong current password' });
  if (newUsername) ADMIN_USER = newUsername;
  if (newPassword) ADMIN_PASS = newPassword;
  res.json({ success: true });
});

// ── Socket.IO ─────────────────────────────────────────────────
io.on('connection', socket => {
  const active = [...conns.values()].filter(c => c.connected).length;
  const num    = [...conns.entries()].find(([,v]) => v.connected)?.[0] || '';
  socket.emit('botStatus', { connected: active > 0, number: num, deployId: DEPLOY_ID, platform: getPlatform() });
  socket.emit('stats', { active, total: stats.totalUsers, pairs: stats.pairCount, uptime: Math.floor((Date.now()-START)/1000), commands: loader.count+8 });
  socket.emit('pluginsReloaded', { count: loader.count });
});

// ── Graceful shutdown ─────────────────────────────────────────
let shutting = false;
const shutdown = sig => {
  if (shutting) return; shutting = true;
  console.log(`\n🛑 ${sig} — saving...`);
  saveSt();
  conns.forEach(e => { try { e.conn.ws?.terminate(); } catch {} });
  setTimeout(() => process.exit(0), 2000);
};
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException',  err => console.error('uncaughtException:', err.message));
process.on('unhandledRejection', err => console.error('unhandledRejection:', err));

// ── Start ─────────────────────────────────────────────────────
server.listen(PORT, async () => {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  🔥 REDXBOT302 v5.2.0 — FINAL EDITION           ║`);
  console.log(`║  🌐 Port: ${String(PORT).padEnd(40)}║`);
  console.log(`║  🆔 ${String(DEPLOY_ID).padEnd(45)}║`);
  console.log(`║  🔑 ${String(deploys[DEPLOY_ID]?.deployKey?.slice(0,16)+'...').padEnd(45)}║`);
  console.log(`║  🔌 ${String((loader.count+8)+' commands loaded').padEnd(45)}║`);
  console.log(`║  🌐 ${String(getPlatform()).padEnd(45)}║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
  await reloadSessions();
});

module.exports.DEPLOY_ID = DEPLOY_ID;
module.exports.deploys   = deploys;
