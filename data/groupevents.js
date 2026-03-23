/**
 * REDXBOT302 v6 — Group Events (Welcome / Goodbye / Promote / Demote)
 * Reads custom messages from store, falls back to default
 * Owner: Abdul Rehman Rajpoot & Muzamil Khan
 */
'use strict';
const store = require('../lib/lightweight_store');

module.exports = async function GroupEvents(conn, update, config = {}) {
  try {
    const { botName='🔥 REDXBOT302 🔥', ownerName='Abdul Rehman Rajpoot', menuImage='https://files.catbox.moe/s36b12.jpg', newsletterJid='120363405513439052@newsletter' } = config;
    const { id, participants, action } = update;
    let meta; try { meta = await conn.groupMetadata(id); } catch {}
    const groupName = meta?.subject || id;
    const groupSize = meta?.participants?.length || 0;
    const PREFIX    = process.env.PREFIX || '.';
    const ctxInfo   = { forwardingScore:999, isForwarded:true, forwardedNewsletterMessageInfo:{newsletterJid, newsletterName:`🔥 ${botName}`, serverMessageId:200} };
    const fill = (t,num) => t.replace(/@user/g,`@${num}`).replace(/@group/g,groupName).replace(/@count/g,String(groupSize)).replace(/@bot/g,botName).replace(/@prefix/g,PREFIX);

    for (const jid of participants) {
      const num = jid.split('@')[0];

      if (action === 'add' || action === 'invite') {
        const ws = await store.getSetting(id,'welcome') || {};
        if (ws.enabled === false) continue;
        const caption = ws.msg ? fill(ws.msg, num)
          : `╔══════════════════════════╗\n║  👋 *WELCOME!*             ║\n╚══════════════════════════╝\n\nWelcome @${num}! 🎉\n\n📌 *Group:* ${groupName}\n👥 *Members:* ${groupSize}\n\n📖 *Rules:*\n• Be respectful\n• No spam or flooding\n• No NSFW content\n• Follow admin instructions\n\n💡 Type *${PREFIX}menu* to see commands.\n\n> 🔥 Powered by ${botName}`;
        await conn.sendMessage(id, { image:{url:menuImage}, caption, mentions:[jid], contextInfo:ctxInfo }).catch(()=>{});

      } else if (action === 'remove' || action === 'leave') {
        const gs = await store.getSetting(id,'goodbye') || {};
        if (gs.enabled === false) continue;
        const text = gs.msg ? fill(gs.msg, num)
          : `╔══════════════════════════╗\n║  👋 *GOODBYE!*             ║\n╚══════════════════════════╝\n\n@${num} has left. 😢\n\n📌 *Group:* ${groupName}\n👥 *Members now:* ${Math.max(0,groupSize-1)}\n\nWe'll miss you! Come back anytime. 🙏\n\n> 🔥 Powered by ${botName}`;
        await conn.sendMessage(id, { text, mentions:[jid], contextInfo:ctxInfo }).catch(()=>{});

      } else if (action === 'promote') {
        await conn.sendMessage(id, { text:`🎊 *PROMOTED!*\n\n@${num} is now an *admin*! 👑\n\n> 🔥 ${botName}`, mentions:[jid], contextInfo:ctxInfo }).catch(()=>{});
      } else if (action === 'demote') {
        await conn.sendMessage(id, { text:`📢 *DEMOTED*\n\n@${num} is no longer an admin.\n\n> 🔥 ${botName}`, mentions:[jid], contextInfo:ctxInfo }).catch(()=>{});
      }
    }
  } catch (e) { console.error('GroupEvents error:', e.message); }
};
