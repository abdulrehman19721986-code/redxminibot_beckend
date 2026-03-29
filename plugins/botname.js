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

const store = require('../lib/lightweight_store');

// Default name from .env or fallback
const DEFAULT_NAME = process.env.BOT_NAME || 'REDX BOT';

module.exports = {
    command: 'botname',
    aliases: ['setbotname'],
    category: 'owner',
    description: 'Change bot profile name',
    usage: '.botname <new name>',
    ownerOnly: true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};

        // Get current name from store, fallback to env/default
        const storedName = await store.getSetting('global', 'botName');
        const currentName = storedName || DEFAULT_NAME;

        if (args.length === 0) {
            return await sock.sendMessage(chatId, {
                text: `📛 *Current Bot Name:* ${currentName}\n\nUse \`.botname <new name>\` to change.`,
                ...channelInfo
            }, { quoted: message });
        }

        const newName = args.join(' ').trim();
        if (newName.length < 3 || newName.length > 30) {
            return await sock.sendMessage(chatId, {
                text: '❌ Name must be between 3 and 30 characters.',
                ...channelInfo
            }, { quoted: message });
        }

        try {
            // Update profile name via WhatsApp
            await sock.updateProfileName(newName);
        } catch (error) {
            // Fallback: use raw query
            try {
                await sock.query({
                    tag: 'iq',
                    attrs: {
                        to: 's.whatsapp.net',
                        type: 'set',
                        xmlns: 'w:profile:name'
                    },
                    content: [
                        { tag: 'name', attrs: {}, content: Buffer.from(newName, 'utf-8') }
                    ]
                });
            } catch (err) {
                return await sock.sendMessage(chatId, {
                    text: `❌ Failed to update name: ${error.message}`,
                    ...channelInfo
                }, { quoted: message });
            }
        }

        // Save the new name to store
        await store.saveSetting('global', 'botName', newName);

        await sock.sendMessage(chatId, {
            text: `✅ Bot name updated to:\n${newName}`,
            ...channelInfo
        }, { quoted: message });
    }
};
