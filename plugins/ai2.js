// plugins/ai2.js
const axios = require('axios');

module.exports = {
  command: 'ai2',
  aliases: ['ask2', 'chat2'],
  category: 'ai2',
  description: 'Chat with AI assistant (Deline)',
  usage: '.ai <question>',

  async handler(sock, message, args, context) {
    const { chatId } = context;
    const query = args.join(' ').trim();
    if (!query) {
      return sock.sendMessage(chatId, {
        text: '🤖 *AI Assistant*\n\nAsk me anything!\nExample: .ai What is the capital of France?'
      }, { quoted: message });
    }

    await sock.sendMessage(chatId, { react: { text: '🤔', key: message.key } });

    try {
      const prompt = 'Kamu adalah Deline Clarissa, AI yang ramah, hangat, dan menyenangkan saat diajak berbicara.';
      const url = `https://api.deline.web.id/ai/openai?text=${encodeURIComponent(query)}&prompt=${encodeURIComponent(prompt)}`;
      const { data } = await axios.get(url, { timeout: 30000 });
      if (!data.status) throw new Error(data.error || 'No response');
      const answer = data.result || 'Hmm, I couldn’t think of an answer.';
      await sock.sendMessage(chatId, { text: answer }, { quoted: message });
    } catch (err) {
      console.error('AI error:', err);
      sock.sendMessage(chatId, { text: `❌ Failed: ${err.message}` }, { quoted: message });
    }
  }
};
