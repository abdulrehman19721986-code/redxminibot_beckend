// === stalk-commands.js ===
const { fetchJson } = require('../lib/functions2');
const { fakevCard } = require('../lib/fakevcard');

module.exports = [
  {
    pattern: "wastalk",
    desc: "Get WhatsApp channel information",
    category: "stalk",
    react: "🙂‍↔️",
    filename: __filename,
    use: ".wastalk <channel_url>",
    execute: async (conn, mek, m, { from, args, reply }) => {
      try {
        if (!args.length) {
          return reply(
            "❌ Please provide a WhatsApp channel URL\n\nExample:\n.wastalk https://whatsapp.com/channel/0029VbB3YxTDJ6H15SKoBv3S"
          );
        }

        const urlText = args.join(" ").trim();
        if (!/whatsapp\.com\/channel\//i.test(urlText)) {
          return reply(
            "❌ Invalid WhatsApp channel URL.\n\nExample:\nhttps://whatsapp.com/channel/0029VbB3YxTDJ6H15SKoBv3S"
          );
        }

        await conn.sendMessage(from, {
          react: { text: "🔍", key: mek.key }
        });

        await reply("🔍 Fetching channel information...");

        const apiUrl = `https://api-toxxic.zone.id/api/stalker/wachannel?url=${encodeURIComponent(urlText)}`;
        const response = await fetchJson(apiUrl);

        const data = response.data;
        if (!data) {
          return reply("❌ Could not fetch channel information right now. Please try again later.");
        }

        const channelTitle = data.channelName || "Unknown";
        const channelFollowers = data.followers || "Unknown";
        const channelDesc = data.status
          ? (typeof data.status === "string"
              ? data.status.substring(0, 200) + (data.status.length > 200 ? "..." : "")
              : "No description")
          : "No description";

        const channelInfo = `
📢 *WhatsApp Channel Info*

🔖 *Title:* ${channelTitle}
👥 *Followers:* ${channelFollowers}
📄 *Description:* ${channelDesc || 'No description'}

> © Powered by Arslan-MD Lite
        `.trim();

        await conn.sendMessage(from, { text: channelInfo }, { quoted: fakevCard });

      } catch (e) {
        console.error("Error in wastalk command:", e);
        return reply(`❌ Error: ${e.message || "Unknown error occurred"}`);
      }
    }
  },
  {
    pattern: "xstalk",
    desc: "Get details about a Twitter/X user",
    category: "stalk",
    react: "🔍",
    filename: __filename,
    use: ".xstalk <username>",
    execute: async (conn, mek, m, { from, args, reply }) => {
      try {
        const username = args.join(" ");
        if (!username) {
          return reply("❌ Please provide a valid Twitter/X username. Example: .xstalk elonmusk");
        }

        await conn.sendMessage(from, {
          react: { text: "⏳", key: mek.key }
        });

        const apiUrl = `https://delirius-apiofc.vercel.app/tools/xstalk?username=${encodeURIComponent(username)}`;
        const response = await fetchJson(apiUrl);

        if (!response?.status || !response?.data) {
          return reply("⚠️ Failed to fetch Twitter/X user details. Ensure the username is correct.");
        }

        const user = response.data;
        const verifiedBadge = user.verified ? "✅" : "❌";

        const caption = `
╭━━━〔 *TWITTER/X STALKER* 〕━━━⊷
┃👤 *Name:* ${user.name}
┃🔹 *Username:* @${user.username}
┃✔️ *Verified:* ${verifiedBadge}
┃👥 *Followers:* ${user.followers_count}
┃👤 *Following:* ${user.following_count}
┃📝 *Tweets:* ${user.tweets_count}
┃📅 *Joined:* ${user.created}
┃🔗 *Profile:* [Click Here](${user.url})
╰━━━⪼

🔹 *Powered by Arslan-MD*
        `.trim();

        await conn.sendMessage(from, {
          image: { url: user.avatar },
          caption: caption
        }, { quoted: fakevCard });

      } catch (e) {
        console.error("Error in xstalk command:", e);
        return reply("❌ An error occurred while processing your request. Please try again.");
      }
    }
  },
  {
    pattern: "tiktokstalk",
    desc: "Fetch TikTok user profile details",
    category: "stalk",
    react: "📱",
    filename: __filename,
    use: ".tiktokstalk <username>",
    execute: async (conn, mek, m, { from, args, reply }) => {
      try {
        const username = args.join(" ");
        if (!username) {
          return reply("❎ Please provide a TikTok username. Example: .tiktokstalk mrbeast");
        }

        const apiUrl = `https://api.siputzx.my.id/api/stalk/tiktok?username=${encodeURIComponent(username)}`;
        const response = await fetchJson(apiUrl);

        if (!response?.status) {
          return reply("❌ User not found. Please check the username and try again.");
        }

        const user = response.data.user;
        const stats = response.data.stats;

        const profileInfo = `
🎭 *TikTok Profile Stalker* 🎭

👤 *Username:* @${user.uniqueId}
📛 *Nickname:* ${user.nickname}
✅ *Verified:* ${user.verified ? "Yes ✅" : "No ❌"}
📍 *Region:* ${user.region}
📝 *Bio:* ${user.signature || "No bio available."}
🔗 *Bio Link:* ${user.bioLink?.link || "No link available."}

📊 *Statistics:*
👥 *Followers:* ${stats.followerCount.toLocaleString()}
👤 *Following:* ${stats.followingCount.toLocaleString()}
❤️ *Likes:* ${stats.heartCount.toLocaleString()}
🎥 *Videos:* ${stats.videoCount.toLocaleString()}

📅 *Account Created:* ${new Date(user.createTime * 1000).toLocaleDateString()}
🔒 *Private Account:* ${user.privateAccount ? "Yes 🔒" : "No 🌍"}

🔗 *Profile URL:* https://www.tiktok.com/@${user.uniqueId}
        `.trim();

        await conn.sendMessage(from, {
          image: { url: user.avatarLarger },
          caption: profileInfo
        }, { quoted: fakevCard });

      } catch (e) {
        console.error("Error in tiktokstalk command:", e);
        return reply("⚠️ An error occurred while fetching TikTok profile data.");
      }
    }
  }
];