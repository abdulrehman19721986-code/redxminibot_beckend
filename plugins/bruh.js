// plugins/bruh.js
const { playSound } = require('./sound2');

module.exports = {
  command: 'bruh',
  category: 'fun',
  description: '😐 Play the classic Bruh sound',
  usage: '.bruh',

  async handler(sock, message, args, context) {
    await playSound(sock, context.chatId, message, 'bruh', context);
  }
};
