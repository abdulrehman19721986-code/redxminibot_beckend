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

const axios = require('axios');
const store = require('../lib/lightweight_store');

module.exports = {
    command: 'setdp',
    aliases: ['setbotdp', 'fulldp'],
    category: 'owner',
    description: 'Change bot profile picture using an image URL (Catbox, etc.)',
    usage: '.setdp <image url>',
    ownerOnly: true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};

        if (args.length === 0) {
            const currentUrl = await store.getSetting('global', 'botDp') || 'not set';
            return await sock.sendMessage(chatId, {
                text: `📸 *Current bot DP URL:* ${currentUrl}\n\nUsage: \`.setdp https://catbox.moe/your-image.jpg\``,
                ...channelInfo
            }, { quoted: message });
        }

        const url = args[0].trim();
        if (!/^https?:\/\//i.test(url)) {
            return await sock.sendMessage(chatId, {
                text: '❌ Invalid URL. Please provide a direct image link (e.g., from Catbox).',
                ...channelInfo
            }, { quoted: message });
        }

        try {
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
            const buffer = Buffer.from(response.data, 'binary');

            // Update the bot's own profile picture
            await sock.updateProfilePicture(sock.user.id, buffer);

            // Save the URL in the database/file for reference
            await store.saveSetting('global', 'botDp', url);

            await sock.sendMessage(chatId, {
                text: '✅ Bot profile picture updated successfully!',
                ...channelInfo
            }, { quoted: message });
        } catch (error) {
            await sock.sendMessage(chatId, {
                text: `❌ Failed to update DP: ${error.message}`,
                ...channelInfo
            }, { quoted: message });
        }
    }
};
