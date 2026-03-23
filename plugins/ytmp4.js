const axios = require('axios');
const yts = require('yt-search');
const CH = {
  contextInfo: {
    forwardingScore: 1, isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: '120363405513439052@newsletter',
      newsletterName: 'REDXBOT302',
      serverMessageId: -1,
    },
  },
};

async function getVideo(url) {
  const apis = [
    `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(url)}&format=720`,
    `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(url)}`,
    `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(url)}`,
    `https://api.ryzendesu.vip/api/downloader/ytmp4?url=${encodeURIComponent(url)}`,
  ];
  for (const api of apis) {
    try {
      const { data } = await axios.get(api, { timeout: 30000 });
      if (data?.result?.download) return data.result.download;
      if (data?.result?.mp4) return data.result.mp4;
      if (data?.data?.url) return data.data.url;
      if (data?.url) return data.url;
    } catch (e) {}
  }
  throw new Error('All download APIs failed');
}

module.exports = {
  command: 'video',
  aliases: ['ytvideo', 'ytv', 'ytmp4'],
  category: 'downloader',
  description: 'Download YouTube video with interactive menu',
  usage: '.video <song name or URL>',
  async handler(sock, message, args, context) {
    const { chatId, channelInfo } = context;
    const query = args.join(' ');
    if (!query) return sock.sendMessage(chatId, { text: '❌ Usage: .video <song name or URL>', ...CH }, { quoted: message });

    await sock.sendMessage(chatId, { react: { text: '🎬', key: message.key } });

    try {
      let videoUrl = query;
      if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
        const search = await yts(query);
        if (!search?.videos?.length) throw new Error('No results');
        videoUrl = search.videos[0].url;
      }

      const info = (await yts(videoUrl)).videos[0] || (await yts(query)).videos[0];
      const caption = `☘️ *Title* ☛ ${info.title}\n` +
        `▫️⏱️ *Duration* ☛ ${info.timestamp}\n` +
        `▫️👁️ *Views* ☛ ${info.views?.toLocaleString()}\n` +
        `▫️👤 *Channel* ☛ ${info.author?.name}\n\n` +
        `🔢 *Reply with the number to download:*\n\n` +
        `1 🎬 Normal Video (Gallery)\n` +
        `2 📁 Document File (File)\n` +
        `3 📹 Video Note (PTV)\n\n` +
        `> *Powered by REDXBOT302*`;

      const sentMsg = await sock.sendMessage(chatId, {
        image: { url: info.thumbnail },
        caption,
        ...CH,
      }, { quoted: message });

      const msgId = sentMsg.key.id;

      const listener = async (update) => {
        const msg = update.messages?.[0];
        if (!msg?.message) return;

        const replyTo = msg.message.extendedTextMessage?.contextInfo?.stanzaId;
        if (replyTo !== msgId) return;

        const choice = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        if (!['1', '2', '3'].includes(choice)) return;

        sock.ev.off('messages.upsert', listener);
        await sock.sendMessage(chatId, { react: { text: '📥', key: msg.key } });

        try {
          const downloadUrl = await getVideo(videoUrl);
          if (!downloadUrl) throw new Error('No download URL');

          if (choice === '1') {
            await sock.sendMessage(chatId, {
              video: { url: downloadUrl },
              caption: info.title,
              ...CH,
            }, { quoted: msg });
          } else if (choice === '2') {
            await sock.sendMessage(chatId, {
              document: { url: downloadUrl },
              mimetype: 'video/mp4',
              fileName: `${info.title}.mp4`,
              caption: info.title,
              ...CH,
            }, { quoted: msg });
          } else if (choice === '3') {
            await sock.sendMessage(chatId, {
              video: { url: downloadUrl },
              mimetype: 'video/mp4',
              ptv: true,
              ...CH,
            }, { quoted: msg });
          }

          await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
        } catch (err) {
          await sock.sendMessage(chatId, {
            text: `❌ Download failed: ${err.message}`,
            ...CH,
          }, { quoted: msg });
        }
      };

      sock.ev.on('messages.upsert', listener);
      setTimeout(() => sock.ev.off('messages.upsert', listener), 10 * 60 * 1000);
    } catch (err) {
      await sock.sendMessage(chatId, {
        text: `❌ ${err.message}`,
        ...CH,
      }, { quoted: message });
    }
  },
};
