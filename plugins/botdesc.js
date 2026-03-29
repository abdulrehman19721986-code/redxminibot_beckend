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

// Default description from .env or fallback
const DEFAULT_DESC = process.env.BOT_DESC || '🤖 Powered by REDX';

module.exports = {
    command: 'botdesc',
    aliases: ['setabout', 'setbio'],
    category: 'owner',
    description: 'Change bot about/bio',
    usage: '.botdesc <new description>',
    ownerOnly: true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};

        // Get current description from store, fallback to env/default
        const storedDesc = await store.getSetting('global', 'botDesc');
        const currentDesc = storedDesc || DEFAULT_DESC;

        if (args.length === 0) {
            return await sock.sendMessage(chatId, {
                text: `📝 *Current Bot Description:*\n"${currentDesc}"\n\nUse \`.botdesc Your new text\` to change.`,
                ...channelInfo
            }, { quoted: message });
        }

        const newDesc = args.join(' ').trim();
        if (newDesc.length > 139) {
            return await sock.sendMessage(chatId, {
                text: '❌ Description too long (max 139 characters).',
                ...channelInfo
            }, { quoted: message });
        }

        try {
            // Update profile status (about/bio)
            await sock.updateProfileStatus(newDesc);

            // Save the new description to store
            await store.saveSetting('global', 'botDesc', newDesc);

            await sock.sendMessage(chatId, {
                text: `✅ Bot description updated to:\n"${newDesc}"`,
                ...channelInfo
            }, { quoted: message });
        } catch (error) {
            await sock.sendMessage(chatId, {
                text: `❌ Failed to update description: ${error.message}`,
                ...channelInfo
            }, { quoted: message });
        }
    }
};
