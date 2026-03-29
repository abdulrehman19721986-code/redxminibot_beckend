/*****************************************************************************
 *  REDX BOT — .antibot
 *  Detects when OTHER bots are used in the group and warns/kicks them.
 *  Owner/sudo/admins are always exempt.
 *****************************************************************************/

const store = require('../lib/lightweight_store');
const isOwnerOrSudo = require('../lib/isOwner');
const isAdmin = require('../lib/isAdmin');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(process.cwd(), 'data', 'antibot.json');
const HAS_DB = !!(process.env.MONGO_URL || process.env.POSTGRES_URL || process.env.DB_URL);
const warnCount = new Map(); // `${chatId}:${jid}` → count

// Common bot prefixes and patterns that indicate another bot is present
const BOT_PREFIXES = [
    '!', '/', '#', '$', '%', '^', '&', '*', '+', '=',
    '?', '<', '>', '~', '`', '|', '\\',
];
const BOT_INDICATORS = [
    /^\s*[!\/\$\?#%&*+=>~`|\\][a-z]/i,         // starts with bot prefix + letter
    /╔|╗|╚|╝|║|🤖.*bot|bot.*🤖/i,              // bot-style box formatting
    /\*\*.*\*\*|__.*__|~~.*~~/,                  // markdown heavy usage by bots
];

async function readConfig(chatId) {
    try {
        if (HAS_DB) {
            const c = await store.getSetting(chatId, 'antibot');
            return c || { enabled: false, maxWarnings: 3, mode: 'warn' };
        }
        if (!fs.existsSync(CONFIG_PATH)) return { enabled: false, maxWarnings: 3, mode: 'warn' };
        const all = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8') || '{}');
        return all[chatId] || { enabled: false, maxWarnings: 3, mode: 'warn' };
    } catch { return { enabled: false, maxWarnings: 3, mode: 'warn' }; }
}

async function writeConfig(chatId, config) {
    try {
        if (HAS_DB) return await store.saveSetting(chatId, 'antibot', config);
        let all = {};
        if (fs.existsSync(CONFIG_PATH)) all = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8') || '{}');
        all[chatId] = config;
        if (!fs.existsSync(path.dirname(CONFIG_PATH))) fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(all, null, 2));
    } catch (e) { console.error('[ANTIBOT] write error:', e.message); }
}

/**
 * Called from messageHandler for every group message
 */
async function handleAntibotCheck(sock, message, chatId, senderId) {
    try {
        const config = await readConfig(chatId);
        if (!config.enabled) return;
        if (!chatId.endsWith('@g.us')) return;

        // Exempt owner/sudo
        const isOwnerSudo = await isOwnerOrSudo(senderId, sock, chatId);
        if (isOwnerSudo) return;

        // Exempt admins
        try {
            const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
            if (isSenderAdmin) return;
        } catch {}

        // Exempt if it's the bot itself
        const botId = sock.user?.id?.split(':')[0];
        if (senderId.includes(botId)) return;

        // Check if this looks like a bot response
        const msgText = message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            message.message?.imageMessage?.caption ||
            message.message?.videoMessage?.caption || '';

        if (!msgText) return;

        // Detect bot-like patterns
        const isBot = BOT_INDICATORS.some(p => p.test(msgText));
        if (!isBot) return;

        const warningKey = `${chatId}:${senderId}`;
        let currentWarns = warnCount.get(warningKey) || 0;
        currentWarns++;
        warnCount.set(warningKey, currentWarns);

        const maxWarnings = config.maxWarnings || 3;
        const shortId = senderId.split('@')[0];

        // Delete the bot message
        try {
            await sock.sendMessage(chatId, {
                delete: { remoteJid: chatId, fromMe: false, id: message.key.id, participant: senderId }
            });
        } catch {}

        if (config.mode === 'kick' || currentWarns >= maxWarnings) {
            // Kick user
            try {
                await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                await sock.sendMessage(chatId, {
                    text: `🤖❌ @${shortId} was *removed* for using another bot in this group. (${currentWarns}/${maxWarnings} warnings)`,
                    mentions: [senderId]
                });
                warnCount.delete(warningKey);
            } catch (e) {
                await sock.sendMessage(chatId, { text: `⚠️ Could not remove bot user. Make sure I am admin.` });
            }
        } else if (config.mode === 'delete') {
            // Silent delete only
        } else {
            // Warn mode
            await sock.sendMessage(chatId, {
                text: `⚠️ *Antibot Warning (${currentWarns}/${maxWarnings})*\n\n@${shortId}, using other bots in this group is not allowed!\n_${maxWarnings - currentWarns} more warning(s) before kick._`,
                mentions: [senderId]
            });
        }
    } catch (e) {
        console.error('[ANTIBOT] error:', e.message);
    }
}

module.exports = {
    command: 'antibot',
    aliases: ['abot', 'nobot'],
    category: 'admin',
    description: 'Detect and warn/kick users who use other bots in the group',
    usage: '.antibot on/off/kick/delete/warn/max <n>',
    groupOnly: true,
    adminOnly: true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};
        const config = await readConfig(chatId);
        const action = args[0]?.toLowerCase();

        if (!action) {
            return sock.sendMessage(chatId, {
                text: `*🤖 ANTIBOT SETTINGS*\n\n` +
                    `*Status:* ${config.enabled ? '✅ ON' : '❌ OFF'}\n` +
                    `*Mode:* ${config.mode || 'warn'}\n` +
                    `*Max Warnings:* ${config.maxWarnings || 3}\n\n` +
                    `*Commands:*\n` +
                    `• \`.antibot on\` — Enable\n` +
                    `• \`.antibot off\` — Disable\n` +
                    `• \`.antibot warn\` — Warn then kick (default)\n` +
                    `• \`.antibot kick\` — Direct kick\n` +
                    `• \`.antibot delete\` — Delete silently\n` +
                    `• \`.antibot max <n>\` — Set warn limit\n\n` +
                    `_Exempt: Owner, Sudo, Admins_`
            }, { quoted: message });
        }

        switch (action) {
            case 'on':
                config.enabled = true;
                await writeConfig(chatId, config);
                return sock.sendMessage(chatId, { text: `✅ *Antibot enabled* (mode: ${config.mode || 'warn'})` }, { quoted: message });
            case 'off':
                config.enabled = false;
                await writeConfig(chatId, config);
                return sock.sendMessage(chatId, { text: `❌ *Antibot disabled*` }, { quoted: message });
            case 'kick':
                config.mode = 'kick'; config.enabled = true; config.maxWarnings = 1;
                await writeConfig(chatId, config);
                return sock.sendMessage(chatId, { text: `🚫 *Antibot: Direct Kick mode*` }, { quoted: message });
            case 'delete':
                config.mode = 'delete'; config.enabled = true;
                await writeConfig(chatId, config);
                return sock.sendMessage(chatId, { text: `🗑️ *Antibot: Delete-only mode*` }, { quoted: message });
            case 'warn':
                config.mode = 'warn'; config.enabled = true;
                await writeConfig(chatId, config);
                return sock.sendMessage(chatId, { text: `⚠️ *Antibot: Warn mode* (${config.maxWarnings || 3} warnings then kick)` }, { quoted: message });
            case 'max': {
                const n = parseInt(args[1]);
                if (isNaN(n) || n < 1) return sock.sendMessage(chatId, { text: `❌ Provide a valid number` }, { quoted: message });
                config.maxWarnings = n;
                await writeConfig(chatId, config);
                return sock.sendMessage(chatId, { text: `✅ Max antibot warnings set to: *${n}*` }, { quoted: message });
            }
            default:
                return sock.sendMessage(chatId, { text: `❌ Unknown action. Use \`.antibot\` for help.` }, { quoted: message });
        }
    },

    handleAntibotCheck,
    readConfig,
};
