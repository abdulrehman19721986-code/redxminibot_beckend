/**
 * ╔══════════════════════════════════════════════════════╗
 * ║            🔥 REDXBOT302 v6.0.0 🔥                  ║
 * ║   WhatsApp MD Bot — Baileys Multi-Device             ║
 * ║   Built-in Web Server + Admin API + Frontend         ║
 * ║   Owner  : Abdul Rehman Rajpoot +923009842133        ║
 * ║   Co-Own : Muzamil Khan         +923183928892        ║
 * ║   GitHub : github.com/AbdulRehman19721986             ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * HOW IT WORKS:
 *   npm start           → bot starts, web server on PORT
 *   /                   → public pair page  (users)
 *   /admin              → admin panel       (owner only, hidden)
 *   /api/*              → public APIs
 *   /api/admin/*        → protected APIs (x-admin-auth header)
 */

'use strict';

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const http     = require('http');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const multer   = require('multer');

const {
  useMultiFileAuthState,
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} = require('@whiskeysockets/baileys');
const P = require('pino');

// ════════════════════════════════════════════════════════
//  CONFIG
// ════════════════════════════════════════════════════════
const BOT_NAME       = process.env.BOT_NAME       || '🔥 REDXBOT302 🔥';
const OWNER_NAME     = process.env.OWNER_NAME     || 'Abdul Rehman Rajpoot';
const OWNER_NUM      = process.env.OWNER_NUMBER   || '923009842133';
const CO_OWNER       = process.env.CO_OWNER       || 'Muzamil Khan';
const CO_OWNER_NUM   = process.env.CO_OWNER_NUM   || '923183928892';
const PREFIX         = process.env.PREFIX         || '.';
const MENU_IMAGE     = process.env.MENU_IMAGE     || 'https://files.catbox.moe/s36b12.jpg';
const NEWSLETTER_JID = process.env.NEWSLETTER_JID || '120363405513439052@newsletter';
const REPO_LINK      = 'https://github.com/AbdulRehman19721986/REDXBOT-MD';
const WA_GROUP       = 'https://chat.whatsapp.com/LhSmx2SeXX75r8I2bxsNDo';
const WA_CHANNEL     = 'https://whatsapp.com/channel/0029VbCPnYf96H4SNehkev10';
const TG_GROUP       = 'https://t.me/TeamRedxhacker2';
const YOUTUBE        = 'https://youtube.com/@rootmindtech';
const PORT           = process.env.PORT || 3000;

// Admin credentials — default redx/redx, changeable from panel
const DATA_DIR       = path.join(__dirname, 'data');
const CREDS_FILE     = path.join(DATA_DIR, 'admin_creds.json');
const BOT_DATA_FILE  = path.join(DATA_DIR, 'bot.json');
const CFG_FILE       = path.join(DATA_DIR, 'config.json');
const SESS_DIR       = path.join(__dirname, 'sessions');
const PLUGINS_DIR    = path.join(__dirname, 'plugins');
const PUBLIC_DIR     = path.join(__dirname, 'public');

[DATA_DIR, SESS_DIR, PLUGINS_DIR, PUBLIC_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Load / init admin creds
let ADMIN_USER = 'redx';
let ADMIN_PASS = 'redx';
try {
  const c = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
  ADMIN_USER = c.user || ADMIN_USER;
  ADMIN_PASS = c.pass || ADMIN_PASS;
} catch {}

function saveAdminCreds() {
  fs.writeFileSync(CREDS_FILE, JSON.stringify({ user: ADMIN_USER, pass: ADMIN_PASS }, null, 2));
}

// Load / init bot data
let botData = { totalUsers: 0, deployIds: {} };
try { botData = { ...botData, ...JSON.parse(fs.readFileSync(BOT_DATA_FILE, 'utf8')) }; } catch {}
const saveBot = () => { try { fs.writeFileSync(BOT_DATA_FILE, JSON.stringify(botData, null, 2)); } catch {} };
setInterval(saveBot, 30000);

const rjson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8') || '{}'); } catch { return {}; } };
const wjson = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// Globals
global.BOT_MODE   = process.env.BOT_MODE || 'public';
global.START_TIME = Date.now();

// ════════════════════════════════════════════════════════
//  EXPRESS — serves public/ AND admin API
// ════════════════════════════════════════════════════════
const app    = express();
const server = http.createServer(app);
const upload = multer({ dest: path.join(DATA_DIR, 'uploads/'), limits: { fileSize: 5 * 1024 * 1024 } });

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(PUBLIC_DIR));  // serves index.html, admin.html, assets

// ── Admin auth middleware ──────────────────────────────
function adminAuth(req, res, next) {
  const h = req.headers['x-admin-auth'] || '';
  try {
    const decoded = Buffer.from(h, 'base64').toString();
    const colon   = decoded.indexOf(':');
    const u = decoded.substring(0, colon);
    const p = decoded.substring(colon + 1);
    if (u === ADMIN_USER && p === ADMIN_PASS) return next();
  } catch {}
  res.status(401).json({ error: 'Unauthorized' });
}

// ════════════════════════════════════════════════════════
//  HEALTH CHECK — Railway/Render/Heroku require this
// ════════════════════════════════════════════════════════
app.get('/health', (_, res) => res.status(200).json({ status: 'ok', uptime: process.uptime() }));
app.get('/healthz', (_, res) => res.status(200).send('OK'));
app.get('/ping',   (_, res) => res.status(200).send('pong'));

// ════════════════════════════════════════════════════════
//  PUBLIC API ROUTES
// ════════════════════════════════════════════════════════
app.get('/api/status', (_, res) => res.json({
  status: 'online',
  bot: BOT_NAME,
  version: '6.0.0',
  instances: Object.keys(botData.deployIds).length,
  totalUsers: botData.totalUsers,
  commands: commands.size + 10,
  uptime: Math.floor((Date.now() - global.START_TIME) / 1000),
}));

app.get('/api/lookup/:id', (req, res) => {
  const entry = botData.deployIds[req.params.id?.toUpperCase()];
  if (!entry) return res.status(404).json({ success: false, error: 'ID not found' });
  const isOnline = activeConns.has(entry.phone);
  res.json({ success: true, deployId: req.params.id.toUpperCase(), phone: entry.phone,
    status: isOnline ? 'online' : 'offline', createdAt: entry.createdAt });
});

// Pairing endpoint
app.post('/api/pair', async (req, res) => {
  let tempConn;
  try {
    const num = (req.body.number || '').replace(/\D/g, '');
    if (!num || num.length < 7) return res.status(400).json({ error: 'Invalid phone number' });
    const sessDir = path.join(SESS_DIR, num);
    if (!fs.existsSync(sessDir)) fs.mkdirSync(sessDir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(sessDir);
    const { version }          = await fetchLatestBaileysVersion();
    tempConn = makeWASocket({
      logger: P({ level: 'silent' }),
      auth: state, version,
      browser: Browsers.macOS('Safari'),
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
    });
    const isNew = !botData.deployIds[num] && !activeConns.has(num);
    if (isNew) { botData.totalUsers++; saveBot(); }
    activeConns.set(num, { conn: tempConn, saveCreds });
    setupConn(tempConn, num, saveCreds);
    await new Promise(r => setTimeout(r, 3000));
    const pairingCode = await tempConn.requestPairingCode(num);
    const deployId    = getDeployId(num);
    // Auto-register this user
    const usrs = rjson(USERS_FILE);
    if (!usrs[deployId]) { usrs[deployId] = { phone: num, deployId, createdAt: new Date().toISOString(), banned: false, note: '', lastSeen: new Date().toISOString() }; wjson(USERS_FILE, usrs); }
    res.json({ success: true, pairingCode, deployId });
  } catch (e) {
    if (tempConn) try { tempConn.ws?.close(); } catch {}
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// ════════════════════════════════════════════════════════
//  ADMIN API ROUTES (all require x-admin-auth header)
// ════════════════════════════════════════════════════════

// Stats
app.get('/api/admin/stats', adminAuth, (_, res) => res.json({
  totalUsers: botData.totalUsers,
  instances: Object.keys(botData.deployIds).length,
  onlineNow: activeConns.size,
  plugins: fs.existsSync(PLUGINS_DIR) ? fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js')).length : 0,
  commands: commands.size + 10,
  uptime: Math.floor((Date.now() - global.START_TIME) / 1000),
  mode: global.BOT_MODE,
}));

// All instances
app.get('/api/admin/instances', adminAuth, (_, res) => {
  const list = Object.entries(botData.deployIds).map(([id, v]) => ({
    deployId: id, phone: v.phone, createdAt: v.createdAt,
    status: activeConns.has(v.phone) ? 'online' : 'offline',
  }));
  res.json({ success: true, instances: list });
});
app.delete('/api/admin/instances/:id', adminAuth, (req, res) => {
  const id = req.params.id.toUpperCase();
  if (botData.deployIds[id]) {
    const phone = botData.deployIds[id].phone;
    delete botData.deployIds[id];
    saveBot();
    // Kill connection if active
    if (activeConns.has(phone)) {
      try { activeConns.get(phone).conn?.ws?.close(); } catch {}
      activeConns.delete(phone);
    }
  }
  res.json({ success: true });
});

// Bot config
app.get('/api/admin/config', adminAuth, (_, res) => res.json({ success: true, config: rjson(CFG_FILE) }));
app.post('/api/admin/config', adminAuth, (req, res) => {
  const updated = { ...rjson(CFG_FILE), ...req.body, updatedAt: new Date().toISOString() };
  wjson(CFG_FILE, updated);
  // Apply live settings
  if (req.body.mode) global.BOT_MODE = req.body.mode;
  res.json({ success: true, config: updated });
});

// Change admin password
app.post('/api/admin/change-password', adminAuth, (req, res) => {
  const { newUser, newPass } = req.body;
  if (!newPass || newPass.length < 3) return res.status(400).json({ error: 'Password too short (min 3)' });
  ADMIN_USER = newUser || ADMIN_USER;
  ADMIN_PASS = newPass;
  saveAdminCreds();
  res.json({ success: true, message: 'Credentials updated. Please log in again.' });
});

// Plugin manager
app.get('/api/admin/plugins', adminAuth, (_, res) => {
  if (!fs.existsSync(PLUGINS_DIR)) return res.json({ success: true, plugins: [] });
  const plugins = fs.readdirSync(PLUGINS_DIR)
    .filter(f => f.endsWith('.js'))
    .map(f => {
      const s = fs.statSync(path.join(PLUGINS_DIR, f));
      return { name: f, size: s.size, modified: s.mtime };
    });
  res.json({ success: true, plugins });
});

app.post('/api/admin/plugins/upload', adminAuth, upload.single('plugin'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!req.file.originalname.endsWith('.js')) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Only .js files allowed' });
  }
  const dest = path.join(PLUGINS_DIR, req.file.originalname);
  fs.renameSync(req.file.path, dest);
  setTimeout(loadPlugins, 500); // hot reload
  res.json({ success: true, message: `✅ ${req.file.originalname} installed & reloaded.` });
});

app.get('/api/admin/plugins/:name', adminAuth, (req, res) => {
  const fp = path.join(PLUGINS_DIR, path.basename(req.params.name));
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, content: fs.readFileSync(fp, 'utf8') });
});

app.put('/api/admin/plugins/:name', adminAuth, (req, res) => {
  const fp = path.join(PLUGINS_DIR, path.basename(req.params.name));
  fs.writeFileSync(fp, req.body.content || '', 'utf8');
  setTimeout(loadPlugins, 200);
  res.json({ success: true });
});

app.delete('/api/admin/plugins/:name', adminAuth, (req, res) => {
  const fp = path.join(PLUGINS_DIR, path.basename(req.params.name));
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(fp);
  setTimeout(loadPlugins, 200);
  res.json({ success: true });
});

// File manager (data/ and plugins/ only)
const SAFE = [path.resolve(DATA_DIR), path.resolve(PLUGINS_DIR)];
const safeP = rel => {
  const abs = path.resolve(__dirname, rel.replace(/^\/+/, ''));
  return SAFE.some(s => abs.startsWith(s)) ? abs : null;
};

app.get('/api/admin/files', adminAuth, (req, res) => {
  try {
    const fp = safeP(req.query.path || 'data');
    if (!fp || !fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) {
      const items = fs.readdirSync(fp).map(name => {
        const full = path.join(fp, name), s = fs.statSync(full);
        return { name, path: (req.query.path || 'data').replace(/\\/g,'/') + '/' + name, isDir: s.isDirectory(), size: s.size };
      });
      return res.json({ success: true, items });
    }
    res.json({ success: true, content: fs.readFileSync(fp, 'utf8') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/files', adminAuth, (req, res) => {
  const fp = safeP(req.body.path || '');
  if (!fp) return res.status(403).json({ error: 'Forbidden path' });
  fs.writeFileSync(fp, req.body.content || '', 'utf8');
  res.json({ success: true });
});

app.delete('/api/admin/files', adminAuth, (req, res) => {
  const fp = safeP(req.query.path || '');
  if (!fp || !fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(fp);
  res.json({ success: true });
});

// Announcement (admin write)
app.get('/api/admin/announcements', adminAuth, (_, res) => {
  const d = rjson(path.join(DATA_DIR, 'ann.json'));
  res.json({ success: true, list: d.list || [] });
});
app.post('/api/admin/announcements', adminAuth, (req, res) => {
  const f = path.join(DATA_DIR, 'ann.json');
  const d = rjson(f); if (!d.list) d.list = [];
  d.list.unshift({
    title: req.body.title || '',
    body: req.body.body || req.body.text || '',
    type: req.body.type || 'info',
    visibility: req.body.visibility || 'all',
    at: new Date().toISOString(),
  });
  if (d.list.length > 50) d.list = d.list.slice(0, 50);
  wjson(f, d);
  broadcastSSE({ type: 'announcement', message: '📢 New announcement posted', at: new Date().toISOString() });
  res.json({ success: true });
});

// Public announcements (users access with Deploy ID)
app.get('/api/announcements', (_, res) => {
  const d = rjson(path.join(DATA_DIR, 'ann.json'));
  res.json({ success: true, list: (d.list || []).filter(a => a.visibility !== 'admins') });
});

// Activity log
const ACT_FILE = path.join(DATA_DIR, 'activity.json');
function logActivity(ev) {
  try {
    const d = rjson(ACT_FILE);
    if (!d.events) d.events = [];
    d.events.unshift({ ...ev, time: new Date().toISOString() });
    if (d.events.length > 200) d.events = d.events.slice(0, 200);
    wjson(ACT_FILE, d);
    broadcastSSE(ev);
  } catch {}
}
app.get('/api/admin/activity', adminAuth, (_, res) => {
  const d = rjson(ACT_FILE);
  res.json({ success: true, events: d.events || [] });
});

// Plugin install from URL
app.post('/api/admin/plugins/install', adminAuth, async (req, res) => {
  const { url } = req.body;
  if (!url || !url.startsWith('http') || !url.endsWith('.js')) return res.status(400).json({ error: 'Invalid URL' });
  try {
    const axios = require('axios');
    const r     = await axios.get(url, { timeout: 20000, responseType: 'text' });
    const fname = url.split('/').pop().split('?')[0];
    const dest  = path.join(PLUGINS_DIR, fname);
    fs.writeFileSync(dest, r.data, 'utf8');
    setTimeout(loadPlugins, 300);
    res.json({ success: true, message: `✅ ${fname} installed & bot reloaded.` });
  } catch (e) { res.status(500).json({ error: 'Download failed: ' + e.message }); }
});

// ── SSE (Server-Sent Events) for live panel updates ──────────────────────
const sseClients = new Set();

function broadcastSSE(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { sseClients.delete(res); }
  }
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
  sseClients.add(res);
  // Send initial stats
  const stats = {
    type: 'stats',
    totalUsers: botData.totalUsers,
    instances: Object.keys(botData.deployIds).length,
    onlineNow: activeConns.size,
    commands: commands.size + 10,
    uptime: Math.floor((Date.now() - global.START_TIME) / 1000),
  };
  res.write(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`);
  // Heartbeat every 25s
  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(hb); sseClients.delete(res); }
  }, 25000);
  req.on('close', () => { sseClients.delete(res); clearInterval(hb); });
});

// Broadcast stats every 15s
setInterval(() => {
  if (sseClients.size === 0) return;
  broadcastSSE({
    type: 'stats',
    totalUsers: botData.totalUsers,
    instances: Object.keys(botData.deployIds).length,
    onlineNow: activeConns.size,
    commands: commands.size + 10,
    uptime: Math.floor((Date.now() - global.START_TIME) / 1000),
  });
}, 15000);

// ════════════════════════════════════════════════════════
//  PLUGIN LOADER
// ════════════════════════════════════════════════════════
const commands       = new Map();
const activeConns    = new Map();
const downloadSess   = new Map();
const userPrefixes   = new Map();

function loadPlugins() {
  commands.clear();
  if (!fs.existsSync(PLUGINS_DIR)) return;
  const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js') && !f.startsWith('_'));
  let count = 0;
  for (const file of files) {
    try {
      const fp = path.join(PLUGINS_DIR, file);
      delete require.cache[require.resolve(fp)];
      const mod = require(fp);
      const reg = cmd => {
        if (!cmd?.pattern || !cmd?.execute) return;
        commands.set(cmd.pattern, cmd);
        count++;
        (cmd.alias || []).forEach(a => commands.set(a, cmd));
      };
      if (mod.pattern && mod.execute)       reg(mod);
      else if (Array.isArray(mod))          mod.forEach(reg);
      else if (typeof mod === 'object')     Object.values(mod).filter(v => v?.pattern).forEach(reg);
    } catch (e) {
      console.error(`❌ Plugin [${file}]: ${e.message}`);
    }
  }
  console.log(`🔌 Loaded ${count} commands from ${files.length} plugins`);
}
loadPlugins();

// Hot-reload on file change
fs.watch(PLUGINS_DIR, (_, f) => { if (f?.endsWith('.js')) { setTimeout(loadPlugins, 300); } });

// ════════════════════════════════════════════════════════
//  DEPLOY ID
// ════════════════════════════════════════════════════════
function getDeployId(phone) {
  const ex = Object.entries(botData.deployIds).find(([, v]) => v.phone === phone);
  if (ex) return ex[0];
  let id;
  do { id = 'REDX' + crypto.randomBytes(4).toString('hex').toUpperCase(); }
  while (botData.deployIds[id]);
  botData.deployIds[id] = { phone, createdAt: new Date().toISOString() };
  saveBot();
  return id;
}

// ════════════════════════════════════════════════════════
//  BAILEYS — CONNECTION
// ════════════════════════════════════════════════════════
const ctxBase = () => ({
  forwardingScore: 999, isForwarded: true,
  forwardedNewsletterMessageInfo: { newsletterJid: NEWSLETTER_JID, newsletterName: `🔥 ${BOT_NAME}`, serverMessageId: 200 },
});

function setupConn(conn, phone, saveCreds) {
  conn.ev.on('creds.update', saveCreds);

  conn.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log(`✅ Connected: ${phone}`);
      logActivity({ type: 'connect', message: `✅ Bot connected: +${phone}`, phone, deployId: getDeployId(phone) });
      try { if (conn.newsletterFollow) await conn.newsletterFollow(NEWSLETTER_JID); } catch {}
      const deployId = getDeployId(phone);
      const botJid   = conn.user.id.split(':')[0] + '@s.whatsapp.net';
      await new Promise(r => setTimeout(r, 3000));
      // Welcome message
      try {
        await conn.sendMessage(botJid, {
          image: { url: MENU_IMAGE },
          caption: welcomeMsg(phone, deployId),
          contextInfo: { ...ctxBase(),
            externalAdReply: { title: `🔥 ${BOT_NAME} ONLINE`, body: `Owner: ${OWNER_NAME}`,
              thumbnailUrl: MENU_IMAGE, sourceUrl: REPO_LINK, mediaType: 1, renderLargerThumbnail: true },
          },
        });
        await new Promise(r => setTimeout(r, 1200));
        await conn.sendMessage(botJid, {
          text: `🔑 *YOUR DEPLOY ID*\n\n╔══════════════════╗\n║  *${deployId}*  ║\n╚══════════════════╝\n\nSave this! Check status at your bot URL.\n\n> 🔥 ${BOT_NAME}`,
        });
      } catch {}
    } else if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      logActivity({ type: 'disconnect', message: `🔴 Bot disconnected: +${phone}`, phone });
      if (code !== DisconnectReason.loggedOut) {
        console.log(`🔄 Reconnecting ${phone}...`);
        setTimeout(() => reconnect(phone), 5000);
      } else {
        activeConns.delete(phone);
        console.log(`🚪 Logged out: ${phone}`);
      }
    }
  });

  conn.ev.on('call', async calls => {
    for (const call of calls) {
      if (call.status !== 'offer') continue;
      try { const ac = require('./plugins/anticall'); if (ac.handleIncomingCall) await ac.handleIncomingCall(conn, call); } catch {}
    }
  });

  conn.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message) continue;
      // Cache for antidelete (including own messages)
      try { const ad = require('./plugins/antidelete'); if (ad.cacheMessage) await ad.cacheMessage(msg); } catch {}
      // Skip own messages — bot should not respond to itself
      if (msg.key.fromMe) continue;
      try { await handleMsg(conn, msg, phone); } catch (e) { console.error('MsgErr:', e.message); }
    }
  });

  conn.ev.on('group-participants.update', async update => {
    try {
      const GE = require('./data/groupevents');
      await GE(conn, update, { botName: BOT_NAME, ownerName: OWNER_NAME, menuImage: MENU_IMAGE, newsletterJid: NEWSLETTER_JID });
    } catch {}
  });

  conn.ev.on('messages.delete', async item => {
    try { const ad = require('./plugins/antidelete'); if (ad.handleDelete) await ad.handleDelete(conn, item); } catch {}
  });
}

async function reconnect(phone) {
  if (!activeConns.has(phone)) return;
  const sessDir = path.join(SESS_DIR, phone);
  if (!fs.existsSync(sessDir)) return;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessDir);
    const { version }          = await fetchLatestBaileysVersion();
    const c = makeWASocket({ logger: P({ level: 'silent' }), auth: state, version,
      browser: Browsers.macOS('Safari'), connectTimeoutMs: 60000, keepAliveIntervalMs: 25000 });
    activeConns.set(phone, { conn: c, saveCreds });
    setupConn(c, phone, saveCreds);
  } catch (e) { console.error('Reconnect error:', e.message); }
}

async function restoreAll() {
  if (!fs.existsSync(SESS_DIR)) return;
  const dirs = fs.readdirSync(SESS_DIR).filter(d => fs.statSync(path.join(SESS_DIR, d)).isDirectory());
  for (const phone of dirs) {
    if (!fs.existsSync(path.join(SESS_DIR, phone, 'creds.json'))) continue;
    console.log(`🔄 Restoring: ${phone}`);
    try {
      const { state, saveCreds } = await useMultiFileAuthState(path.join(SESS_DIR, phone));
      const { version }          = await fetchLatestBaileysVersion();
      const c = makeWASocket({ logger: P({ level: 'silent' }), auth: state, version,
        browser: Browsers.macOS('Safari'), connectTimeoutMs: 60000, keepAliveIntervalMs: 25000 });
      activeConns.set(phone, { conn: c, saveCreds });
      setupConn(c, phone, saveCreds);
    } catch (e) { console.error(`Restore [${phone}]:`, e.message); }
  }
}

// ════════════════════════════════════════════════════════
//  MESSAGE HANDLER
// ════════════════════════════════════════════════════════
async function handleMsg(conn, msg, phone) {
  if (!msg.message) return;
  const from   = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  if (!from || from.endsWith('@newsletter')) return;

  // Status auto-seen/react
  if (from === 'status@broadcast') {
    await conn.readMessages([msg.key]).catch(() => {});
    const emojis = ['🔥','⚡','💯','👑','🚀','💎','❤️'];
    await conn.sendMessage(from, { react: { text: emojis[Math.floor(Math.random()*emojis.length)], key: msg.key } },
      { statusJidList: [msg.key.participant, conn.user.id] }).catch(() => {});
    return;
  }

  const isGroup = from.endsWith('@g.us');
  const isOwner = [OWNER_NUM, CO_OWNER_NUM, process.env.TEMP_OWNER || ''].includes(sender.split('@')[0]);
  if (global.BOT_MODE === 'private' && !isOwner) return;

  // Group anti-abuse
  if (isGroup) {
    try { const af = require('./plugins/antilink');  if (af.handleAntiLink)  await af.handleAntiLink(conn, msg); } catch {}
    try { const ab = require('./plugins/antibadword'); if (ab.handleAntiBadword) await ab.handleAntiBadword(conn, msg); } catch {}
  }

  const pfx  = userPrefixes.get(phone) || PREFIX;
  const body = getText(msg).trim();

  // Auto-react
  try {
    const store = require('./lib/lightweight_store');
    const ar = await store.getSetting(from, 'autoreact').catch(() => null);
    if (ar?.enabled && !msg.key.fromMe) {
      await conn.sendMessage(from, { react: { text: ar.emoji || '❤️', key: msg.key } }).catch(() => {});
    }
  } catch {}

  // Auto-read
  try {
    const store = require('./lib/lightweight_store');
    const autoread = await store.getSetting('global', 'autoread').catch(() => null);
    if (autoread) await conn.readMessages([msg.key]).catch(() => {});
  } catch {}

  // Auto-reply (keyword responder)
  if (body && !body.startsWith(pfx)) {
    try {
      const store   = require('./lib/lightweight_store');
      const replies = await store.getSetting(from, 'autoreplies').catch(() => null);
      if (replies) {
        const match = replies[body.toLowerCase().trim()];
        if (match) { await conn.sendMessage(from, { text: match }, { quoted: msg }); return; }
      }
    } catch {}
  }

  // Download number-selection
  const dlKey = `${from}_${sender}`;
  if (downloadSess.has(dlKey) && body && !body.startsWith(pfx)) {
    const num = parseInt(body.trim());
    if (!isNaN(num) && num > 0) {
      const sess = downloadSess.get(dlKey);
      if (sess?.handler) {
        try { await sess.handler(conn, msg, num, sess); } catch (e) {
          await conn.sendMessage(from, { text: `❌ ${e.message}` }, { quoted: msg });
        }
        if (sess.type !== 'menu') downloadSess.delete(dlKey);
        return;
      }
    }
  }

  if (!body.startsWith(pfx)) return;

  // Safe parse: extract command name and args correctly
  const sliced   = body.slice(pfx.length).trim();           // e.g. "play alan walker"
  const spaceIdx = sliced.search(/\s/);                     // first whitespace
  const cmd      = (spaceIdx === -1 ? sliced : sliced.slice(0, spaceIdx)).toLowerCase();
  const q        = spaceIdx === -1 ? '' : sliced.slice(spaceIdx + 1).trim();
  const args     = q ? q.split(/\s+/) : [];

  if (!cmd) return;

  // Typing indicator
  try {
    const store   = require('./lib/lightweight_store');
    const typing  = await store.getSetting('global', 'autotyping').catch(() => null);
    if (typing) await conn.sendPresenceUpdate('composing', from).catch(() => {});
  } catch {}

  console.log(`[${new Date().toLocaleTimeString()}] ${cmd} | ${sender.split('@')[0]}`);

  if (await builtIn(conn, msg, cmd, args, q, from, sender, phone, pfx, isOwner)) return;

  const plug = commands.get(cmd);
  if (!plug) return;

  try {
    const reply = (text, opts = {}) => conn.sendMessage(from, { text }, { quoted: msg, ...opts });
    let groupMetadata = null, isAdmin = false;
    if (isGroup) {
      try { groupMetadata = await conn.groupMetadata(from); } catch {}
      if (groupMetadata) {
        const p = groupMetadata.participants.find(x => x.id === sender);
        isAdmin = !!p?.admin;
      }
    }
    await plug.execute(conn, msg, {
      mentionedJid: msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
      quoted: getQuoted(msg), sender, key: msg.key,
      downloadSessions: downloadSess, dlKey,
    }, {
      args, q, reply, from, isGroup, groupMetadata,
      sender, isAdmin, isOwner, isCreator: false,
      botName: BOT_NAME, ownerName: OWNER_NAME,
      prefix: pfx, phone, downloadSessions: downloadSess, dlKey,
    });
  } catch (e) { console.error(`Plugin error [${cmd}]:`, e.message); }
}

// ════════════════════════════════════════════════════════
//  BUILT-IN COMMANDS
// ════════════════════════════════════════════════════════
async function builtIn(conn, msg, cmd, args, q, from, sender, phone, pfx, isOwner) {
  const ctx = () => ({
    forwardingScore: 999, isForwarded: true,
    forwardedNewsletterMessageInfo: { newsletterJid: NEWSLETTER_JID, newsletterName: `🔥 ${BOT_NAME}`, serverMessageId: 200 },
    externalAdReply: { title: `🔥 ${BOT_NAME}`, body: `Owner: ${OWNER_NAME}`, thumbnailUrl: MENU_IMAGE, sourceUrl: REPO_LINK, mediaType: 1 },
  });
  const s = t => conn.sendMessage(from, { text: t, contextInfo: ctx() }, { quoted: msg });

  switch (cmd) {
    case 'ping': case 'speed': {
      const ms = Date.now();
      await conn.sendMessage(from, { react: { text: '⚡', key: msg.key } });
      return s(`⚡ *Pong!* ${Date.now() - ms}ms`), true;
    }
    case 'menu': case 'help': case 'm':
      await sendMenu(conn, from, msg, pfx); return true;
    case 'allmenu':
      await sendAllMenu(conn, from, msg, pfx); return true;
    case 'id': case 'myid': case 'deployid':
      await s(`🔑 *Deploy ID:* *${getDeployId(phone)}*`); return true;
    case 'mode':
      if (!isOwner) { await s('❌ Owner only!'); return true; }
      if (['public','private'].includes(args[0])) { global.BOT_MODE = args[0]; await s(`✅ Mode: *${args[0].toUpperCase()}*`); }
      else await s(`Current mode: *${global.BOT_MODE.toUpperCase()}*\n.mode public|private`);
      return true;
    case 'setprefix':
      if (!isOwner) { await s('❌ Owner only!'); return true; }
      if (args[0]) { userPrefixes.set(phone, args[0]); await s(`✅ Prefix: *${args[0]}*`); }
      return true;
    case 'setbotname':
      if (!isOwner) { await s('❌ Owner only!'); return true; }
      if (q) { global.BOT_NAME_G = q; await s(`✅ Bot name: *${q}* (temp)`); }
      return true;
    case 'setowner':
      if (!isOwner) { await s('❌ Owner only!'); return true; }
      if (args[0]) { process.env.TEMP_OWNER = args[0].replace(/\D/g,''); await s(`✅ Temp owner: +${process.env.TEMP_OWNER}`); }
      return true;
    case 'owner':
      await conn.sendMessage(from, {
        contacts: { displayName: OWNER_NAME, contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${OWNER_NAME}\nTEL;type=CELL;waid=${OWNER_NUM}:+${OWNER_NUM}\nEND:VCARD` }] },
      }, { quoted: msg });
      return true;
    case 'prefix':
      await s(`📌 Prefix: *${userPrefixes.get(phone) || pfx}*`); return true;
    default: return false;
  }
}

// ════════════════════════════════════════════════════════
//  MENU BUILDERS
// ════════════════════════════════════════════════════════
async function sendMenu(conn, from, msg, pfx) {
  const cats = {}; const catMap = {};
  for (const [n, c] of commands) {
    const cat = c.category || 'Other';
    if (!cats[cat]) cats[cat] = new Set();
    cats[cat].add(n);
  }
  cats['⚙️ System'] = new Set(['ping','menu','allmenu','id','mode','prefix','owner','setowner','setbotname','setprefix']);
  const uptime = Math.floor((Date.now() - global.START_TIME) / 60000);
  let text = `╔══════════════════════════╗\n║  🔥 *REDXBOT302 v6 MENU* 🔥║\n╚══════════════════════════╝\n\n`;
  text += `👑 *${OWNER_NAME}* | Prefix: *${pfx}* | Mode: *${global.BOT_MODE.toUpperCase()}*\n`;
  text += `🤖 Commands: *${commands.size + 10}+* | Uptime: *${uptime}m*\n\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `*Reply with a number:*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  let n = 1;
  const catEmoji = { AI:'🤖',Fun:'🎉',Group:'👥',Sticker:'🎭',Download:'📥',Tools:'🔧',Media:'🎬',Games:'🎮',Utility:'🛠️',Owner:'👑',Auto:'⚙️',Search:'🔍',Other:'📦' };
  for (const cat of Object.keys(cats)) {
    const e = catEmoji[cat.replace('⚙️ ','')] || '📂';
    text += `  ${e} *${n}.* ${cat} (${cats[cat].size})\n`;
    catMap[n] = cat; n++;
  }
  text += `\n> 🔥 ${BOT_NAME} — By ${OWNER_NAME}`;
  await conn.sendMessage(from, { image: { url: MENU_IMAGE }, caption: text,
    contextInfo: { ...ctxBase(), externalAdReply: { title: `🔥 ${BOT_NAME}`, body: `${commands.size + 10}+ commands`, thumbnailUrl: MENU_IMAGE, sourceUrl: REPO_LINK, mediaType: 1, renderLargerThumbnail: true } },
  }, { quoted: msg });
  const dlKey = `${from}_${(msg.key.participant || msg.key.remoteJid)}`;
  downloadSess.set(dlKey, {
    type: 'menu', catMap, cats,
    handler: async (c2, m2, num, sess) => {
      const cat = sess.catMap[num]; if (!cat) return;
      const cmds = Array.from(sess.cats[cat]);
      let t = `${catEmoji[cat.replace('⚙️ ','')] || '📂'} *${cat.toUpperCase()} COMMANDS*\n\n`;
      t += cmds.map(x => `  ▸ ${pfx}${x}`).join('\n');
      t += `\n\n> 🔥 ${BOT_NAME}`;
      await c2.sendMessage(from, { text: t }, { quoted: m2 });
      downloadSess.delete(dlKey);
    },
  });
  setTimeout(() => downloadSess.delete(dlKey), 60000);
}

async function sendAllMenu(conn, from, msg, pfx) {
  const cats = {}; const catEmoji = { AI:'🤖',Fun:'🎉',Group:'👥',Sticker:'🎭',Download:'📥',Tools:'🔧',Media:'🎬',Games:'🎮',Utility:'🛠️',Owner:'👑',Auto:'⚙️',Search:'🔍',Other:'📦' };
  for (const [n, c] of commands) {
    const cat = c.category || 'Other';
    if (!cats[cat]) cats[cat] = new Set();
    cats[cat].add(n);
  }
  cats['System'] = new Set(['ping','menu','allmenu','id','mode','prefix','owner','setowner','setbotname','setprefix']);
  let t = `╭┈┄───【 *REDXBOT302 v6* 】───┄┈╮\n├■ 👑 ${OWNER_NAME}\n├■ 📜 ${commands.size + 10}+ Commands\n├■ 📌 Prefix: ${pfx}\n├■ 🌍 Mode: ${global.BOT_MODE.toUpperCase()}\n╰┈┄─────────────────────┄┈╯\n\n`;
  for (const [cat, cmds] of Object.entries(cats)) {
    const e = catEmoji[cat] || '📂';
    t += `╭──「 ${e} *${cat.toUpperCase()}* 」\n`;
    t += Array.from(cmds).map(c => `│  ◈ ${pfx}${c}`).join('\n') + '\n';
    t += `╰──────────────────\n\n`;
  }
  t += `╭┈┄───【 🔗 LINKS 】───┄┈╮\n├ WA: ${WA_GROUP}\n├ TG: ${TG_GROUP}\n├ YT: ${YOUTUBE}\n╰┈┄──────────────────┄┈╯\n\n> ✨ ${BOT_NAME}`;
  await conn.sendMessage(from, { image: { url: MENU_IMAGE }, caption: t,
    contextInfo: { ...ctxBase(), externalAdReply: { title: `🔥 ${BOT_NAME} — All Commands`, body: `${commands.size + 10}+ commands`, thumbnailUrl: MENU_IMAGE, sourceUrl: REPO_LINK, mediaType: 1 } },
  }, { quoted: msg });
}

// ════════════════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════════════════
function getType(msg) {
  const m = msg.message;
  if (!m) return 'UNKNOWN';
  // Unwrap ephemeral / view-once wrappers
  const inner = m.ephemeralMessage?.message
    || m.viewOnceMessage?.message
    || m.viewOnceMessageV2?.message
    || m.documentWithCaptionMessage?.message
    || m;
  const types = [
    'conversation','extendedTextMessage','imageMessage','videoMessage',
    'audioMessage','documentMessage','stickerMessage','buttonsResponseMessage',
    'listResponseMessage','templateButtonReplyMessage',
  ];
  for (const t of types) {
    if (inner[t]) return (t === 'conversation' || t === 'extendedTextMessage') ? 'TEXT' : t.replace('Message','').toUpperCase();
  }
  return 'UNKNOWN';
}

function getText(msg) {
  const m = msg.message;
  if (!m) return '';
  // Unwrap wrappers
  const inner = m.ephemeralMessage?.message
    || m.viewOnceMessage?.message
    || m.viewOnceMessageV2?.message
    || m.documentWithCaptionMessage?.message
    || m;
  return (
    inner?.conversation
    || inner?.extendedTextMessage?.text
    || inner?.imageMessage?.caption
    || inner?.videoMessage?.caption
    || inner?.documentMessage?.caption
    || inner?.buttonsResponseMessage?.selectedButtonId
    || inner?.listResponseMessage?.singleSelectReply?.selectedRowId
    || inner?.templateButtonReplyMessage?.selectedId
    || ''
  );
}
function getQuoted(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx?.quotedMessage) return null;
  return { message: { key: { remoteJid: ctx.participant, id: ctx.stanzaId, fromMe: false }, message: ctx.quotedMessage }, sender: ctx.participant };
}
function welcomeMsg(phone, deployId) {
  return `╔══════════════════════════╗\n║  🔥 *REDXBOT302 ONLINE* 🔥 ║\n╚══════════════════════════╝\n\n✅ Connected: *+${phone}*\n👑 Owner: ${OWNER_NAME}\n📌 Prefix: ${PREFIX}\n🌍 Mode: ${global.BOT_MODE.toUpperCase()}\n🤖 Commands: ${commands.size + 10}+\n\n${REPO_LINK}\n${WA_CHANNEL}\n\n> Type *${PREFIX}menu* for commands\n> Type *${PREFIX}allmenu* for all 500+ commands`;
}

// ════════════════════════════════════════════════════════
//  START
// ════════════════════════════════════════════════════════
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`
╔══════════════════════════════════════════╗
║   🔥 REDXBOT302 v6.0.0 Started!         ║
╠══════════════════════════════════════════╣
║   👑 Owner  : ${OWNER_NAME.padEnd(27)}║
║   🌐 Port   : ${String(PORT).padEnd(27)}║
║   🔌 Plugins: ${String(commands.size).padEnd(27)}║
║   🌍 Mode   : ${global.BOT_MODE.toUpperCase().padEnd(27)}║
╠══════════════════════════════════════════╣
║   🌐 Public : http://0.0.0.0:${PORT}/         ║
║   🔒 Admin  : http://0.0.0.0:${PORT}/admin    ║
║   🏥 Health : http://0.0.0.0:${PORT}/health   ║
╚══════════════════════════════════════════╝
`);
  await restoreAll();
});

// ════════════════════════════════════════════════════════
//  SERVER MANAGER — admin adds Railway/Render/Heroku links
//  Users see servers only after registering their Deploy ID
// ════════════════════════════════════════════════════════
const SERVERS_FILE = path.join(DATA_DIR, 'servers.json');
const USERS_FILE   = path.join(DATA_DIR, 'users.json');

const rjFile = f => { try { return JSON.parse(fs.readFileSync(f,'utf8')||'[]'); } catch { return []; } };
const wjFile = (f,d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// ── User registration (called after pairing) ─────────────────────────────
app.post('/api/user/register', (req, res) => {
  const { deployId, phone } = req.body;
  const id = (deployId||'').toUpperCase().trim();
  if (!id.startsWith('REDX') || !phone) return res.status(400).json({ error: 'deployId and phone required' });
  const users = rjson(USERS_FILE);
  if (!users[id]) {
    users[id] = { phone: phone.replace(/\D/g,''), deployId: id, createdAt: new Date().toISOString(), banned: false, note: '', lastSeen: new Date().toISOString() };
    wjson(USERS_FILE, users);
    broadcastSSE({ type: 'user_joined', message: `🔗 New user: ${id}`, deployId: id });
  } else {
    users[id].lastSeen = new Date().toISOString();
    wjson(USERS_FILE, users);
  }
  res.json({ success: true, user: users[id] });
});

// ── User: get their own info + servers ───────────────────────────────────
app.get('/api/user/me', (req, res) => {
  const id = (req.headers['x-deploy-id'] || req.query.id || '').toUpperCase();
  if (!id.startsWith('REDX')) return res.status(401).json({ error: 'Invalid Deploy ID' });
  const users = rjson(USERS_FILE);
  const user  = users[id];
  if (!user) return res.status(404).json({ error: 'Deploy ID not registered. Pair your bot first.' });
  if (user.banned) return res.status(403).json({ error: 'This bot has been suspended.' });
  // Update last seen
  users[id].lastSeen = new Date().toISOString();
  wjson(USERS_FILE, users);
  const servers = rjFile(SERVERS_FILE);
  const anns    = rjson(path.join(DATA_DIR,'ann.json')).list || [];
  res.json({
    success: true, user, deployId: id,
    servers,
    announcements: anns.filter(a => a.visibility !== 'admins'),
    botStatus: activeConns.has(user.phone) ? 'online' : 'offline',
  });
});

// ── Admin: all users ─────────────────────────────────────────────────────
app.get('/api/admin/users', adminAuth, (_, res) => {
  const users = rjson(USERS_FILE);
  const list  = Object.entries(users).map(([id, u]) => ({ ...u, deployId: id, isOnline: activeConns.has(u.phone) }));
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, users: list, total: list.length });
});

app.patch('/api/admin/users/:id', adminAuth, (req, res) => {
  const users = rjson(USERS_FILE);
  const id    = req.params.id.toUpperCase();
  if (!users[id]) return res.status(404).json({ error: 'User not found' });
  ['name','note','banned'].forEach(k => { if (req.body[k] !== undefined) users[id][k] = req.body[k]; });
  users[id].updatedAt = new Date().toISOString();
  wjson(USERS_FILE, users);
  broadcastSSE({ type: 'user_updated', deployId: id });
  res.json({ success: true, user: users[id] });
});

app.delete('/api/admin/users/:id', adminAuth, (req, res) => {
  const users = rjson(USERS_FILE);
  const id    = req.params.id.toUpperCase();
  if (!users[id]) return res.status(404).json({ error: 'User not found' });
  delete users[id];
  wjson(USERS_FILE, users);
  broadcastSSE({ type: 'user_deleted', deployId: id });
  res.json({ success: true });
});

app.post('/api/admin/users/bulk', adminAuth, (req, res) => {
  const { ids, action } = req.body;
  const users = rjson(USERS_FILE); let count = 0;
  (ids||[]).forEach(id => {
    const uid = id.toUpperCase();
    if (!users[uid]) return;
    if (action === 'delete') delete users[uid];
    else if (action === 'ban')   users[uid].banned = true;
    else if (action === 'unban') users[uid].banned = false;
    count++;
  });
  wjson(USERS_FILE, users);
  broadcastSSE({ type: 'bulk_action', action, count });
  res.json({ success: true, affected: count });
});

// ── Admin: Server Manager ────────────────────────────────────────────────
app.get('/api/admin/servers', adminAuth, (_, res) => {
  res.json({ success: true, servers: rjFile(SERVERS_FILE) });
});

app.post('/api/admin/servers', adminAuth, (req, res) => {
  const { name, region, url, notes, tags, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const servers = rjFile(SERVERS_FILE);
  const srv = {
    id: crypto.randomBytes(4).toString('hex'),
    name, region: region||'Global', url: url||'',
    notes: notes||'', tags: tags||[],
    status: status||'online',
    addedAt: new Date().toISOString(),
  };
  servers.push(srv);
  wjFile(SERVERS_FILE, servers);
  broadcastSSE({ type: 'server_added', message: `🖥️ Server added: ${name}`, server: srv });
  res.json({ success: true, server: srv });
});

app.patch('/api/admin/servers/:id', adminAuth, (req, res) => {
  const servers = rjFile(SERVERS_FILE);
  const idx     = servers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  ['name','region','url','notes','tags','status'].forEach(k => { if (req.body[k] !== undefined) servers[idx][k] = req.body[k]; });
  servers[idx].updatedAt = new Date().toISOString();
  wjFile(SERVERS_FILE, servers);
  broadcastSSE({ type: 'server_updated', server: servers[idx] });
  res.json({ success: true, server: servers[idx] });
});

app.delete('/api/admin/servers/:id', adminAuth, (req, res) => {
  const servers = rjFile(SERVERS_FILE);
  const srv     = servers.find(s => s.id === req.params.id);
  wjFile(SERVERS_FILE, servers.filter(s => s.id !== req.params.id));
  if (srv) broadcastSSE({ type: 'server_removed', id: req.params.id, name: srv.name });
  res.json({ success: true });
});

// Public server list for SSE init
app.get('/api/servers', (_, res) => {
  res.json({ success: true, servers: rjFile(SERVERS_FILE) });
});

// ════════════════════════════════════════════════════════
//  ERRORS & START
// ════════════════════════════════════════════════════════
server.on('error', (err) => {
  console.error('❌ Server error:', err.message);
  process.exit(1);
});

process.on('uncaughtException',  (e) => console.error('Uncaught:', e.message));
process.on('unhandledRejection', (e) => console.error('Unhandled:', e));

module.exports = { app, server };
