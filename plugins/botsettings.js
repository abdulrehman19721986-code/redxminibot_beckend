/*****************************************************************************
 *                                                                           *
 *                     Developed By Abdul Rehman Rajpoot                     *
 *                     & Muzamil Khan                                        *
 *                                                                           *
 *****************************************************************************/

const store = require('../lib/lightweight_store');
const settings = require('../settings');

module.exports = {
    command: 'botsettings',
    aliases: ['bset'],
    category: 'owner',
    description: 'View and modify bot settings',
    usage: '.botsettings [setting] [value]',
    ownerOnly: true,

    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};

        // If no args, show all settings
        if (args.length === 0) {
            // Get dynamic settings from store
            const prefix = await store.getSetting('global', 'prefix') || settings.prefixes[0];
            const botDp = await store.getSetting('global', 'botDp') || settings.botDp;
            const botName = await store.getSetting('global', 'botName') || settings.botName;
            const commandMode = await store.getSetting('global', 'commandMode') || settings.commandMode;

            const platform = settings.platform.toUpperCase();

            const text = `⚙️ *BOT SETTINGS* ⚙️

*Platform:* ${platform}
*Version:* ${settings.version}
*Prefix:* \`${prefix}\`
*Bot Name:* ${botName}
*Command Mode:* ${commandMode}
*Owner:* ${settings.botOwner} & ${settings.secondOwner}

*To change a setting:* 
\`.botsettings <setting> <value>\`

*Available settings:*
• prefix (new prefix)
• botname (new name)
• mode (public/private/self/groups/inbox)
• dp (image URL)`;

            return await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        const setting = args[0].toLowerCase();
        const value = args.slice(1).join(' ');

        if (!value) {
            return await sock.sendMessage(chatId, {
                text: `❌ Please provide a value for \`${setting}\`.`,
                ...channelInfo
            }, { quoted: message });
        }

        // Handle different settings
        switch (setting) {
            case 'prefix':
                if (value.length > 2) return await sock.sendMessage(chatId, { text: '❌ Prefix must be 1-2 characters.' }, { quoted: message });
                await store.saveSetting('global', 'prefix', value);
                settings.prefixes = [value, ...settings.prefixes.filter(p => p !== value)];
                break;

            case 'botname':
                await store.saveSetting('global', 'botName', value);
                settings.botName = value;
                break;

            case 'mode':
                const modes = ['public', 'private', 'self', 'groups', 'inbox'];
                if (!modes.includes(value)) {
                    return await sock.sendMessage(chatId, {
                        text: `❌ Invalid mode. Choose: ${modes.join(', ')}`,
                        ...channelInfo
                    }, { quoted: message });
                }
                await store.saveSetting('global', 'commandMode', value);
                settings.commandMode = value;
                break;

            case 'dp':
                if (!/^https?:\/\//i.test(value)) {
                    return await sock.sendMessage(chatId, { text: '❌ Invalid URL.' }, { quoted: message });
                }
                await store.saveSetting('global', 'botDp', value);
                settings.botDp = value;
                // Optionally update profile picture immediately
                try {
                    const axios = require('axios');
                    const response = await axios.get(value, { responseType: 'arraybuffer' });
                    const buffer = Buffer.from(response.data, 'binary');
                    await sock.updateProfilePicture(sock.user.id, buffer);
                } catch (e) {
                    // fail silently
                }
                break;

            default:
                return await sock.sendMessage(chatId, {
                    text: `❌ Unknown setting: \`${setting}\`.\nUse \`.botsettings\` to see available settings.`,
                    ...channelInfo
                }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text: `✅ *${setting}* updated to:\n\`${value}\``,
            ...channelInfo
        }, { quoted: message });
    }
};
