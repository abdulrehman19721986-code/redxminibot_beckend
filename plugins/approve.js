// Aliases for .approve and .reject — delegate to requests plugin
const reqPlugin = require('./deline-requests');
module.exports = [
  {
    command: 'approve',
    aliases: ['acceptreq'],
    category: 'group',
    description: 'Approve group join request(s)',
    usage: '.approve all / .approve <number>',
    groupOnly: true,
    adminOnly: true,
    async handler(sock, message, args, context = {}) {
      context.rawText = '.approve ' + args.join(' ');
      return reqPlugin.handler(sock, message, args, context);
    }
  },
  {
    command: 'reject',
    aliases: ['denyreq'],
    category: 'group',
    description: 'Reject group join request(s)',
    usage: '.reject all / .reject <number>',
    groupOnly: true,
    adminOnly: true,
    async handler(sock, message, args, context = {}) {
      context.rawText = '.reject ' + args.join(' ');
      return reqPlugin.handler(sock, message, args, context);
    }
  }
];
