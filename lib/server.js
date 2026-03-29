// lib/server.js — HTTP server helpers for REDXBOT ULTRA
const express    = require('express');
const { createServer } = require('http');
const path       = require('path');
const packageInfo = require('../package.json');
const settings   = require('../settings');

const app    = express();
const server = createServer(app);
const PORT   = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Ping (keep-alive)
app.get('/ping', (req, res) => res.json({ pong: true, ts: Date.now() }));

// Health
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    name: settings.botName,
    version: settings.version,
    platform: settings.platform,
    uptime: Math.floor(process.uptime())
  });
});

// Commands list (for frontend command browser)
app.get('/api/commands', (req, res) => {
  try {
    const commandHandler = require('./commandHandler');
    const commands = [];
    for (const [name, plugin] of commandHandler.commands) {
      commands.push({
        name,
        desc: plugin.description || plugin.desc || '',
        cat: plugin.category || 'misc',
        usage: plugin.usage || ('.' + name),
        aliases: plugin.aliases || []
      });
    }
    res.json({ commands, total: commands.length });
  } catch {
    res.json({ commands: [], total: 0 });
  }
});

// Simple fallback status page
app.get('/', (req, res) => {
  const uptime = Math.floor(process.uptime());
  const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60), s = uptime % 60;
  res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${settings.botName} Status</title>
<meta http-equiv="refresh" content="30">
<style>
body{margin:0;background:#050508;color:#f0ede8;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.box{background:rgba(20,20,30,0.95);border:1px solid rgba(255,60,0,.3);border-radius:20px;padding:40px;text-align:center;max-width:420px;width:90%}
h1{color:#ff3c00;margin:0 0 6px;font-size:1.6rem} .badge{background:rgba(0,255,136,.1);border:1px solid rgba(0,255,136,.3);color:#00ff88;padding:4px 14px;border-radius:100px;font-size:.75rem;display:inline-block;margin-bottom:20px}
.row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.row:last-child{border:none} .lbl{color:#6b6880;font-size:.8rem} .val{font-weight:700;font-size:.85rem;font-family:monospace}
a{color:#ff6a35;text-decoration:none} footer{margin-top:20px;font-size:.7rem;color:#475569}
</style></head><body><div class="box">
<div class="badge">● ONLINE</div>
<h1>${settings.botName}</h1>
<p style="color:#6b6880;margin-bottom:20px;font-size:.9rem">v${settings.version} — Ultra WhatsApp Bot</p>
<div class="row"><span class="lbl">Uptime</span><span class="val">${h}h ${m}m ${s}s</span></div>
<div class="row"><span class="lbl">Platform</span><span class="val">${settings.platform.toUpperCase()}</span></div>
<div class="row"><span class="lbl">Owner</span><span class="val">${settings.botOwner}</span></div>
<div class="row"><span class="lbl">Co-Owner</span><span class="val">${settings.secondOwner}</span></div>
<footer>
  <a href="${settings.channelLink}" target="_blank">WA Channel</a> &nbsp;·&nbsp;
  <a href="${settings.githubRepo}" target="_blank">GitHub</a> &nbsp;·&nbsp;
  <a href="${settings.youtubeChannel}" target="_blank">YouTube</a><br><br>
  © Abdul Rehman Rajpoot & Muzamil Khan
</footer></div></body></html>`);
});

module.exports = { app, server, PORT };
