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
const isOwnerOrSudo = require('../lib/isOwner');
const isAdmin = require('../lib/isAdmin');
const fs = require('fs');
const path = require('path');

const MONGO_URL = process.env.MONGO_URL;
const POSTGRES_URL = process.env.POSTGRES_URL;
const MYSQL_URL = process.env.MYSQL_URL;
const SQLITE_URL = process.env.DB_URL;
const HAS_DB = !!(MONGO_URL || POSTGRES_URL || MYSQL_URL || SQLITE_URL);

const CONFIG_PATH = path.join(process.cwd(), 'data', 'antilink.json');

// In‑memory warning counters per group per user
const warningCount = new Map(); // key: `${chatId}:${participant}`

async function readConfig(chatId) {
  try {
    if (HAS_DB) {
      const config = await store.getSetting(chatId, 'antilink');
      return config || { enabled: false, maxWarnings: 3 };
    } else {
      if (!fs.existsSync(CONFIG_PATH)) {
        return { enabled: false, maxWarnings: 3 };
      }
      const all = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8') || '{}');
      return all[chatId] || { enabled: false, maxWarnings: 3 };
    }
  } catch {
    return { enabled: false, maxWarnings: 3 };
  }
}

async function writeConfig(chatId, config) {
  try {
    if (HAS_DB) {
      await store.saveSetting(chatId, 'antilink', config);
    } else {
      let all = {};
      if (fs.existsSync(CONFIG_PATH)) {
        all = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8') || '{}');
      }
      all[chatId] = config;
      if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(all, null, 2));
    }
  } catch (err) {
    console.error('Error writing antilink config:', err);
  }
}

async function setAntilink(chatId, enabled, maxWarnings = 3) {
  const config = { enabled, maxWarnings };
  await writeConfig(chatId, config);
  return true;
}

async function getAntilink(chatId) {
  return await readConfig(chatId);
}

async function removeAntilink(chatId) {
  await writeConfig(chatId, { enabled: false, maxWarnings: 3 });
  // Also clear warning counters for this group
  for (const key of warningCount.keys()) {
    if (key.startsWith(chatId + ':')) {
      warningCount.delete(key);
    }
  }
  return true;
}

async function handleLinkDetection(sock, chatId, message, userMessage, senderId) {
  try {
    const config = await getAntilink(chatId);
    if (!config?.enabled) return;

    // Exempt owner, sudo, and admins
    const isOwnerSudo = await isOwnerOrSudo(senderId, sock, chatId);
    if (isOwnerSudo) return;

    try {
      const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
      if (isSenderAdmin) return;
    } catch {}

    // Skip vCards, contact shares, and system messages (they contain URLs but aren't links)
    const isContactOrSystem =
      message.message?.contactMessage ||
      message.message?.contactsArrayMessage ||
      message.message?.locationMessage ||
      message.message?.liveLocationMessage ||
      message.message?.protocolMessage;
    if (isContactOrSystem) return;

    // Skip if message is from a bot linked number (sock.user.id)
    if (senderId.includes(sock.user.id.split(':')[0])) return;

    // Link detection patterns
    const linkPatterns = {
      whatsappGroup: /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i,
      whatsappChannel: /wa\.me\/channel\/[A-Za-z0-9]{10,}/i,
      telegram: /(?:t\.me|telegram\.me)\/[A-Za-z0-9_]+/i,
      allLinks: /https?:\/\/\S+|www\.\S+\.\S+/i,
    };

    // Whitelist: wa.me/phonenumber (contact sharing link) should NOT be blocked
    const contactLinkPattern = /wa\.me\/\+?[0-9]{7,15}(?:\?.*)?$/i;
    if (contactLinkPattern.test(userMessage)) return;

    let linkType = '';
    if (linkPatterns.whatsappGroup.test(userMessage)) {
      linkType = 'WhatsApp Group';
    } else if (linkPatterns.whatsappChannel.test(userMessage)) {
      linkType = 'WhatsApp Channel';
    } else if (linkPatterns.telegram.test(userMessage)) {
      linkType = 'Telegram';
    } else if (linkPatterns.allLinks.test(userMessage)) {
      linkType = 'Link';
    } else {
      return; // no link found
    }

    const messageId = message.key.id;
    const participant = message.key.participant || senderId;
    const warningKey = `${chatId}:${participant}`;

    // Delete the message immediately
    try {
      await sock.sendMessage(chatId, {
        delete: {
          remoteJid: chatId,
          fromMe: false,
          id: messageId,
          participant: participant,
        },
      });
    } catch (err) {
      console.error('Failed to delete message:', err);
    }

    // Get current warning count
    let currentWarnings = warningCount.get(warningKey) || 0;
    currentWarnings += 1;
    warningCount.set(warningKey, currentWarnings);

    const maxWarnings = config.maxWarnings || 3;

    // Send warning message
    const senderShort = senderId.split('@')[0];
    const warnMsg = `⚠️ *Antilink Warning (${currentWarnings}/${maxWarnings})*\n\n@${senderShort}, posting ${linkType} links is not allowed!`;
    await sock.sendMessage(chatId, { text: warnMsg, mentions: [senderId] });

    // If reached max warnings, kick
    if (currentWarnings >= maxWarnings) {
      try {
        await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
        await sock.sendMessage(chatId, {
          text: `🚫 @${senderShort} has been removed for repeatedly posting links.`,
          mentions: [senderId],
        });
        warningCount.delete(warningKey); // reset after kick
      } catch (err) {
        console.error('Failed to kick user:', err);
        await sock.sendMessage(chatId, {
          text: `⚠️ Failed to remove user. Make sure the bot is an admin.`,
        });
      }
    }
  } catch (error) {
    console.error('Error in link detection:', error);
  }
}

module.exports = {
  command: 'antilink',
  aliases: ['alink', 'linkblock'],
  category: 'admin',
  description: 'Prevent links with a 3‑strike warning system',
  usage: '.antilink <on|off|status|max <number>>',
  groupOnly: true,
  adminOnly: true,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const channelInfo = context.channelInfo || {};
    const config = await getAntilink(chatId);
    const action = args[0]?.toLowerCase();

    if (!action) {
      await sock.sendMessage(
        chatId,
        {
          text: `*🔗 ANTILINK SETTINGS*\n\n` +
                `*Status:* ${config.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                `*Max Warnings:* ${config.maxWarnings >= 999 ? 'Delete only (no kick)' : config.maxWarnings === 1 ? '1 (Direct Kick)' : config.maxWarnings || 3}\n\n` +
                `*Commands:*\n` +
                `• \`.antilink on\` – Enable (3-warn mode)\n` +
                `• \`.antilink off\` – Disable\n` +
                `• \`.antilink warn\` – Warn 3x then kick (default)\n` +
                `• \`.antilink kick\` – Direct kick instantly\n` +
                `• \`.antilink delete\` – Delete only, no kick\n` +
                `• \`.antilink max <n>\` – Set warnings before kick\n` +
                `• \`.antilink status\` – Show settings\n\n` +
                `*Exempt:* Admins, Owner, Sudo, Contact links (wa.me/number)`,
          ...channelInfo,
        },
        { quoted: message }
      );
      return;
    }

    switch (action) {
      case 'on':
        if (config.enabled) {
          await sock.sendMessage(chatId, { text: '⚠️ Antilink is already enabled.', ...channelInfo }, { quoted: message });
          return;
        }
        await setAntilink(chatId, true, config.maxWarnings || 3);
        await sock.sendMessage(chatId, { text: '✅ Antilink enabled. (3‑strike system active)', ...channelInfo }, { quoted: message });
        break;

      case 'off':
        if (!config.enabled) {
          await sock.sendMessage(chatId, { text: '⚠️ Antilink is already disabled.', ...channelInfo }, { quoted: message });
          return;
        }
        await removeAntilink(chatId);
        await sock.sendMessage(chatId, { text: '❌ Antilink disabled.', ...channelInfo }, { quoted: message });
        break;

      case 'max':
        if (args.length < 2) {
          await sock.sendMessage(chatId, { text: '❌ Usage: `.antilink max <number>`', ...channelInfo }, { quoted: message });
          return;
        }
        const newMax = parseInt(args[1], 10);
        if (isNaN(newMax) || newMax < 1) {
          await sock.sendMessage(chatId, { text: '❌ Please provide a valid number (minimum 1).', ...channelInfo }, { quoted: message });
          return;
        }
        await setAntilink(chatId, config.enabled, newMax);
        await sock.sendMessage(chatId, { text: `✅ Max warnings set to *${newMax}*.`, ...channelInfo }, { quoted: message });
        break;

      case 'status':
        await sock.sendMessage(
          chatId,
          {
            text: `*🔗 ANTILINK STATUS*\n\n` +
                  `*Enabled:* ${config.enabled ? '✅' : '❌'}\n` +
                  `*Max Warnings:* ${config.maxWarnings || 3}\n` +
                  `*Storage:* ${HAS_DB ? 'Database' : 'File System'}`,
            ...channelInfo,
          },
          { quoted: message }
        );
        break;

      case 'kick':
        // Direct kick mode: kick instantly without warnings
        await setAntilink(chatId, true, 1);
        await sock.sendMessage(chatId, { text: '🚫 *Antilink set to DIRECT KICK mode*\nAnyone posting a link will be kicked immediately.', ...channelInfo }, { quoted: message });
        break;

      case 'delete':
        // Delete only mode: delete message, no warnings, no kick
        await setAntilink(chatId, true, 999);
        await sock.sendMessage(chatId, { text: '🗑️ *Antilink set to DELETE ONLY mode*\nLinks will be deleted silently (no warnings, no kick).', ...channelInfo }, { quoted: message });
        break;

      case 'warn':
        // Reset to default warn mode (3 warnings then kick)
        await setAntilink(chatId, true, 3);
        await sock.sendMessage(chatId, { text: '⚠️ *Antilink set to WARN mode*\n3 warnings → then kick.', ...channelInfo }, { quoted: message });
        break;

      default:
        await sock.sendMessage(chatId, { text: '❌ Unknown command. Use `.antilink` for help.', ...channelInfo }, { quoted: message });
    }
  },

  // Exported for main event handler
  handleLinkDetection,
  setAntilink,
  getAntilink,
  removeAntilink,
};
