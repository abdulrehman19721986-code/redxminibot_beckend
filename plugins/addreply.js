/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *  🌐  GitHub   : https://github.com/AbdulRehman19721986/redxbot302          *
 *  ▶️  YouTube  : https://youtube.com/@rootmindtech                         *
 *  💬  WhatsApp : https://whatsapp.com/channel/0029VbCPnYf96H4SNehkev10     *
 *  🔗  Telegram : https://t.me/TeamRedxhacker2                              *
 *                                                                           *
 *    © 2026 Abdul Rehman Rajpoot. All rights reserved.                      *
 *                                                                           *
 *****************************************************************************/

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../data/autoreply.json');

// Helper to load config
async function initConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
    return { replies: [] };
}

// Helper to save config
async function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = {
    command: 'addreply',
    aliases: ['newtrigger', 'setreply'],
    category: 'owner',
    description: 'Add an auto-reply trigger',
    usage: '.addreply <trigger> | <response>\nFor exact match: .addreply exact:<trigger> | <response>\nUse {name} in response to mention sender name',
    ownerOnly: true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const senderId = context.senderId || message.key.remoteJid;

        const fullText = args.join(' ');
        const pipeIndex = fullText.indexOf('|');

        if (!fullText || pipeIndex === -1) {
            return await sock.sendMessage(chatId, {
                text: `*➕ ADD AUTO-REPLY*\n\n` +
                      `*Usage:*\n` +
                      `\`.addreply <trigger> | <response>\`\n\n` +
                      `*Examples:*\n` +
                      `• \`.addreply hello | Hi there! 👋\`\n` +
                      `• \`.addreply exact:good morning | Good morning! ☀️\`\n` +
                      `• \`.addreply hi | Hello {name}! How are you?\`\n\n` +
                      `*Tips:*\n` +
                      `• Use \`exact:\` prefix for full message match\n` +
                      `• Without \`exact:\` it matches if message *contains* trigger\n` +
                      `• Use \`{name}\` in response to mention the sender's name`
            }, { quoted: message });
        }

        let trigger = fullText.substring(0, pipeIndex).trim();
        const response = fullText.substring(pipeIndex + 1).trim();

        if (!trigger || !response) {
            return await sock.sendMessage(chatId, {
                text: '❌ Both trigger and response are required.\n\nExample: `.addreply hello | Hi there!`'
            }, { quoted: message });
        }

        let exactMatch = false;
        if (trigger.toLowerCase().startsWith('exact:')) {
            exactMatch = true;
            trigger = trigger.substring(6).trim();
        }

        if (!trigger) {
            return await sock.sendMessage(chatId, {
                text: '❌ Trigger cannot be empty after `exact:` prefix.'
            }, { quoted: message });
        }

        const config = await initConfig();
        const exists = config.replies.find(r => r.trigger === trigger.toLowerCase());

        if (exists) {
            return await sock.sendMessage(chatId, {
                text: `⚠️ A reply for *"${trigger}"* already exists!\n\nUse \`.delreply ${trigger}\` to remove it first.`
            }, { quoted: message });
        }

        config.replies.push({
            trigger: trigger.toLowerCase(),
            response,
            exactMatch,
            addedBy: senderId,
            createdAt: Date.now()
        });

        await saveConfig(config);

        await sock.sendMessage(chatId, {
            text: `✅ *Auto-Reply Added!*\n\n` +
                  `🔑 *Trigger:* ${trigger}\n` +
                  `🎯 *Match type:* ${exactMatch ? 'Exact' : 'Contains'}\n` +
                  `💬 *Response:* ${response}`
        }, { quoted: message });
    }
};
