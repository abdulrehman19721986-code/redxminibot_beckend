/**
 * BGM Plugin for REDXBOT302
 * Developed by Abdul Rehman Rajpoot & Muzamil Khan
 *
 * Features:
 * - Set media as a response to a trigger word (owner/sudo only)
 * - Enable/disable BGM per chat
 * - List, delete, and manage triggers
 * - Fast in‑memory cache for triggers
 */

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const store = require('../lib/lightweight_store');

const CONFIG_KEY = 'bgm_config';
const MEDIA_DIR = path.join(process.cwd(), 'data', 'bgm_media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// In‑memory cache for triggers (fast)
let triggersCache = new Map();

async function loadTriggers() {
    const config = await getConfig();
    triggersCache.clear();
    for (const [word, data] of Object.entries(config.triggers || {})) {
        triggersCache.set(word.toLowerCase(), data);
    }
    console.log(`[BGM] Loaded ${triggersCache.size} triggers.`);
}

async function getConfig() {
    try {
        const cfg = await store.getSetting('global', CONFIG_KEY);
        return cfg || { enabled: false, triggers: {} };
    } catch (err) {
        console.error('[BGM] Failed to load config:', err);
        return { enabled: false, triggers: {} };
    }
}

async function saveConfig(config) {
    await store.saveSetting('global', CONFIG_KEY, config);
    triggersCache.clear();
    for (const [word, data] of Object.entries(config.triggers || {})) {
        triggersCache.set(word.toLowerCase(), data);
    }
}

async function downloadMediaFromReply(message, sock) {
    const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg) {
        throw new Error('No quoted message found. Please reply to a media file.');
    }

    let mediaMsg, mediaType;
    if (quotedMsg.audioMessage) {
        mediaMsg = quotedMsg.audioMessage;
        mediaType = 'audio';
    } else if (quotedMsg.videoMessage) {
        mediaMsg = quotedMsg.videoMessage;
        mediaType = 'video';
    } else if (quotedMsg.documentMessage) {
        mediaMsg = quotedMsg.documentMessage;
        mediaType = 'document';
    } else if (quotedMsg.imageMessage) {
        mediaMsg = quotedMsg.imageMessage;
        mediaType = 'image';
    } else {
        throw new Error('Unsupported media type. Please reply to audio, video, document, or image.');
    }

    const stream = await downloadContentFromMessage(mediaMsg, mediaType);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const mimetype = mediaMsg.mimetype || (mediaType === 'audio' ? 'audio/mpeg' : mediaType === 'image' ? 'image/jpeg' : 'application/octet-stream');
    return {
        buffer,
        mimetype,
        mediaType,
        originalName: mediaMsg.fileName || 'media'
    };
}

async function convertToVoiceNote(buffer, srcMime) {
    const inputFile = path.join(MEDIA_DIR, `bgm_in_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.tmp`);
    const outputFile = path.join(MEDIA_DIR, `bgm_out_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.opus`);

    fs.writeFileSync(inputFile, buffer);

    try {
        await exec(`ffmpeg -i "${inputFile}" -c:a libopus -ar 24000 -b:a 24k -ac 1 -f ogg "${outputFile}" -y`);
        const outBuffer = fs.readFileSync(outputFile);
        return outBuffer;
    } catch (err) {
        console.error('[BGM] FFmpeg conversion error:', err.message);
        throw new Error('Media conversion failed. Ensure FFmpeg is installed.');
    } finally {
        if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    }
}

async function checkAndPlay(sock, message, text, chatId, channelInfo) {
    const config = await getConfig();
    if (!config.enabled) return false;

    const word = text.trim().toLowerCase();
    const trigger = triggersCache.get(word);
    if (!trigger) return false;

    const filePath = trigger.filePath;
    if (!fs.existsSync(filePath)) {
        console.error(`[BGM] File missing for trigger "${word}" at ${filePath}`);
        return false;
    }

    try {
        const fileBuffer = fs.readFileSync(filePath);
        const { mediaType, mimetype, originalName } = trigger;

        let content = {};
        if (mediaType === 'audio') {
            const voiceBuffer = await convertToVoiceNote(fileBuffer, mimetype);
            content = {
                audio: voiceBuffer,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true
            };
        } else if (mediaType === 'image') {
            content = { image: fileBuffer, caption: `🎵 ${word}` };
        } else if (mediaType === 'video') {
            content = { video: fileBuffer, caption: `🎵 ${word}` };
        } else if (mediaType === 'document') {
            content = {
                document: fileBuffer,
                mimetype: mimetype,
                fileName: originalName || 'document'
            };
        } else {
            return false;
        }

        await sock.sendMessage(chatId, { ...content, ...channelInfo }, { quoted: message });
        return true;
    } catch (err) {
        console.error(`[BGM] Playback error for "${word}":`, err);
        return false;
    }
}

module.exports = {
    command: 'bgm',
    aliases: ['background'],
    category: 'owner',
    description: 'Set media as a response to a trigger word (owner/sudo only)',
    usage: `
        .bgm on|off                     – Enable/disable BGM feature
        .bgm set <word>                 – Reply to media (audio/video/image/document) to set
        .bgm list                        – List all triggers
        .bgm remove <word>               – Remove a trigger
        .bgm guide                       – Show this guide
    `,
    ownerOnly: true,  // <-- only owner/sudo can use the command

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};
        const senderId = (context.senderId || message.key.participant || message.key.remoteJid).split(':')[0];
        // No need to check permissions here because ownerOnly: true ensures only owner/sudo reach this point

        const reply = async (text, mentions = []) =>
            sock.sendMessage(chatId, { text, mentions, ...channelInfo }, { quoted: message });

        if (args.length === 0) {
            return reply(module.exports.usage);
        }

        const config = await getConfig();
        const sub = args[0].toLowerCase();

        // ==================== ON / OFF ====================
        if (sub === 'on') {
            config.enabled = true;
            await saveConfig(config);
            return reply('✅ BGM feature enabled. Triggers will be active.');
        }
        if (sub === 'off') {
            config.enabled = false;
            await saveConfig(config);
            return reply('❌ BGM feature disabled.');
        }

        // ==================== LIST ====================
        if (sub === 'list') {
            const triggers = Object.keys(config.triggers);
            if (!triggers.length) return reply('No triggers set.');
            return reply(`🔊 *Active triggers:*\n${triggers.map(t => `• ${t}`).join('\n')}`);
        }

        // ==================== REMOVE ====================
        if (sub === 'remove') {
            if (args.length < 2) return reply('❌ Usage: `.bgm remove <word>`');
            const word = args.slice(1).join(' ').trim().toLowerCase();
            const trigger = config.triggers[word];
            if (!trigger) return reply(`❌ Trigger "${word}" not found.`);
            if (fs.existsSync(trigger.filePath)) fs.unlinkSync(trigger.filePath);
            delete config.triggers[word];
            await saveConfig(config);
            return reply(`✅ Removed trigger for "${word}".`);
        }

        // ==================== GUIDE ====================
        if (sub === 'guide') {
            return reply(module.exports.usage);
        }

        // ==================== SET ====================
        if (sub === 'set') {
            if (args.length < 2) return reply('❌ Usage: `.bgm set <word>` (reply to media)');
            const word = args.slice(1).join(' ').trim().toLowerCase();

            let media;
            try {
                media = await downloadMediaFromReply(message, sock);
            } catch (err) {
                return reply(`❌ ${err.message}`);
            }

            const safeWord = word.replace(/[^a-z0-9]/gi, '_');
            const ext = path.extname(media.originalName) || (media.mediaType === 'audio' ? '.mp3' : media.mediaType === 'image' ? '.jpg' : '.bin');
            const fileName = `${safeWord}${ext}`;
            const filePath = path.join(MEDIA_DIR, fileName);
            fs.writeFileSync(filePath, media.buffer);

            config.triggers[word] = {
                filePath,
                mediaType: media.mediaType,
                mimetype: media.mimetype,
                originalName: media.originalName,
                setBy: senderId,
                timestamp: new Date().toISOString()
            };
            await saveConfig(config);

            return reply(`✅ Trigger "${word}" set. Now type "${word}" to play the media.`);
        }

        return reply('❌ Unknown subcommand. Use `.bgm guide` for help.');
    },

    checkAndPlay,
    loadTriggers
};
