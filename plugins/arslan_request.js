const fakevCard = require('../lib/fakevCard');
const moment = require('moment-timezone');

// Global Map to track reported messages
const reportedMessages = new Map();

module.exports = {
    pattern: "report",
    desc: "Report a bug or request a feature to the bot owner",
    category: "utility",
    filename: __filename,
    use: ".report <message>",

    execute: async (conn, mek, m, { from, reply, args, isOwner }) => {
        try {
            // REMOVED the isOwner check - allow all users to report

            if (!args.length) {
                return reply(
`
╭─[ *ᴀʀꜱʟᴀɴ-ᴍᴅ* ]─>>
┃  📋 ʀᴇᴘᴏʀᴛ ᴍᴇɴᴜ  📋
╰━━━━━⊷

📝 *ᴜsᴀɢᴇ:*
   ⇝ .report <message>

💡 *ᴇxᴀᴍᴘʟᴇs:*
   ⇝ .report ᴘʟᴀʏ ᴄᴏᴍᴍᴀɴᴅ ɴᴏᴛ ᴡᴏʀᴋɪɴɢ
   ⇝ .report ᴀᴅᴅ ɴᴇᴡ ғᴇᴀᴛᴜʀᴇ ᴘʟᴇᴀsᴇ
   ⇝ .report ʙᴏᴛ ɪs sʟᴏᴡ

🎯 *ᴛɪᴘs:*
   • ʙᴇ ᴅᴇsᴄʀɪᴘᴛɪᴠᴇ
   • ɪɴᴄʟᴜᴅᴇ sᴄʀᴇᴇɴsʜᴏᴛs ɪғ ᴘᴏssɪʙʟᴇ
   • ᴍᴇɴᴛɪᴏɴ ᴛʜᴇ ᴄᴏᴍᴍᴀɴᴅ ɴᴀᴍᴇ

⚡ ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴀʀꜱʟᴀɴ-ᴍᴅ`
                );
            }

            const messageId = m.key.id;
            if (reportedMessages.has(messageId)) {
                return reply("🔄 ᴛʜɪs ʀᴇᴘᴏʀᴛ ʜᴀs ᴀʟʀᴇᴀᴅʏ ʙᴇᴇɴ sᴜʙᴍɪᴛᴛᴇᴅ. ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ ғᴏʀ ᴀ ʀᴇsᴘᴏɴsᴇ.");
            }

            // Validate input length
            const reportMessage = args.join(' ');
            if (reportMessage.length > 1000) {
                return reply("❌ ʀᴇᴘᴏʀᴛ ᴍᴇssᴀɢᴇ ɪs ᴛᴏᴏ ʟᴏɴɢ (ᴍᴀx 1000 ᴄʜᴀʀᴀᴄᴛᴇʀs).");
            }

            // Format report with timestamp
            const timestamp = moment().tz('Pakistan/Karachi').format('DD/MM/YYYY HH:mm:ss');
            const reportText = `
╭━━━━━━━━━━━━━━╮
┃         📮 ɴᴇᴡ ʀᴇᴘᴏʀᴛ      
╰━━━━━━━━━━━━━━╯

👤 *ᴜsᴇʀ:* @${m.sender.split('@')[0]}
📛 *ɴᴀᴍᴇ:* ${m.pushName || 'Unknown'}
⏰ *ᴛɪᴍᴇ:* ${timestamp}
🌐 *ɢʀᴏᴜᴘ:* ${m.isGroup ? m.chat : 'Private Chat'}
📝 *ᴛʏᴘᴇ:* ${reportMessage.toLowerCase().includes('bug') ? '🐛 ʙᴜɢ ʀᴇᴘᴏʀᴛ' : '💡 ғᴇᴀᴛᴜʀᴇ ʀᴇǫᴜᴇsᴛ'}

📄 *ᴍᴇssᴀɢᴇ:*
${reportMessage}

╭───────────────╮
┃🚀 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴀʀꜱʟᴀɴ-ᴍᴅ   
╰───────────────╯`;

            const confirmationText = `
╭━━━━━━━━━━━━━━━╮
┃  ✅ ʀᴇᴘᴏʀᴛ sᴜʙᴍɪᴛᴛᴇᴅ      
╰━━━━━━━━━━━━━━━╯

ʜᴇʏ ${m.pushName}! 👋

ʏᴏᴜʀ ʀᴇᴘᴏʀᴛ ʜᴀs ʙᴇᴇɴ sᴜᴄᴄᴇssғᴜʟʟʏ ғᴏʀᴡᴀʀᴅᴇᴅ ᴛᴏ ᴛʜᴇ ᴀʀꜱʟᴀɴ-ᴍᴅ.

📊 *sᴛᴀᴛᴜs:* ʀᴇᴄᴇɪᴠᴇᴅ
⏳ *ɴᴇxᴛ sᴛᴇᴘ:* ᴜɴᴅᴇʀ ʀᴇᴠɪᴇᴡ

ᴛʜᴀɴᴋ ʏᴏᴜ ғᴏʀ ʏᴏᴜʀ ғᴇᴇᴅʙᴀᴄᴋ! 💫`;

            // Reusable context info
            const contextInfo = {
                mentionedJid: [m.sender],
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363348739987203@newsletter',
                    newsletterName: 'ᴀʀꜱʟᴀɴ-ᴍᴅ ʀᴇᴘᴏʀᴛs',
                    serverMessageId: 143
                }
            };

            // Send report to owner (replace with actual owner number)
            const ownerJid = '923237045919@s.whatsapp.net'; // Replace with actual owner number
            
            try {
                await conn.sendMessage(ownerJid, {
                    text: reportText,
                    contextInfo
                }, { quoted: fakevCard });
            } catch (ownerError) {
                console.error('Failed to send to owner:', ownerError);
                // Continue anyway to give user feedback
            }

            // Mark as reported
            reportedMessages.set(messageId, true);
            // Clean up old reports (after 1 hour)
            setTimeout(() => reportedMessages.delete(messageId), 3600 * 1000);

            // Send confirmation with better styling
            await conn.sendMessage(from, {
                text: confirmationText,
                contextInfo: {
                    mentionedJid: [m.sender],
                    externalAdReply: {
                        title: "ʀᴇᴘᴏʀᴛ sᴜʙᴍɪᴛᴛᴇᴅ ✅",
                        body: "ᴛʜᴀɴᴋ ʏᴏᴜ ғᴏʀ ʏᴏᴜʀ ғᴇᴇᴅʙᴀᴄᴋ!",
                        thumbnailUrl: "https://files.catbox.moe/16i1l7.jpg",
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: fakevCard });

        } catch (error) {
            console.error('❌ Report command error:', error.message);
            let errorMsg = `
╭━━━━━━━━━━━━━━━╮
┃        ❌ ᴇʀʀᴏʀ ғᴏᴜɴᴅ        
╰━━━━━━━━━━━━━━━╯

ғᴀɪʟᴇᴅ ᴛᴏ ᴘʀᴏᴄᴇss ʏᴏᴜʀ ʀᴇᴘᴏʀᴛ.

${error.message.includes('Invalid JID') ? 
'• ɪɴᴠᴀʟɪᴅ ᴏᴡɴᴇʀ ᴄᴏɴᴛᴀᴄᴛ' : 
'• ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ'}

🛠️ ɪғ ᴛʜᴇ ᴘʀᴏʙʟᴇᴍ ᴘᴇʀsɪsᴛs, ᴄᴏɴᴛᴀᴄᴛ ᴛʜᴇ ᴅᴇᴠᴇʟᴏᴘᴇʀ ᴀʀꜱʟᴀɴ-ᴍᴅ ᴅɪʀᴇᴄᴛʟʏ.`;
            
            await reply(errorMsg);
        }
    }
};