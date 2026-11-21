#!/usr/bin/env node
/**
 * Đăng ký nhanh lệnh Slash Command (/setup-bell, /key) vào máy chủ Discord chỉ định.
 * Chạy 1 lần khi thiết lập Bot:
 *   DISCORD_APP_ID=... DISCORD_GUILD_ID=... DISCORD_BOT_TOKEN=... npm run discord:register
 */

const appId = (process.env.DISCORD_APP_ID || '').trim();
const guildId = (process.env.DISCORD_GUILD_ID || '').trim();
const botToken = (process.env.DISCORD_BOT_TOKEN || '').trim();

if (!appId || !guildId || !botToken) {
  console.error(
    'Thiếu biến môi trường! Hãy truyền đủ DISCORD_APP_ID, DISCORD_GUILD_ID và DISCORD_BOT_TOKEN.',
  );
  process.exit(1);
}

const commands = [
  {
    name: 'setup-bell',
    description: 'Đăng bảng chuông nhận chìa khoá cố định của Ofu\'s Library vào kênh hiện tại (Admin)',
    default_member_permissions: '8', // ADMINISTRATOR
    dm_permission: false,
  },
  {
    name: 'key',
    description: 'Nhận chìa khoá tạm thời (5 phút) để mở cửa thư viện trong 24 giờ',
    dm_permission: false,
  },
];

const endpoint = `https://discord.com/api/v10/applications/${encodeURIComponent(appId)}/guilds/${encodeURIComponent(guildId)}/commands`;

const response = await fetch(endpoint, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${botToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(commands),
});

const payload = await response.json().catch(() => null);
if (!response.ok) {
  console.error('Đăng ký lệnh Discord thất bại:', response.status, payload);
  process.exit(1);
}

console.log(
  `Đã đăng ký thành công ${Array.isArray(payload) ? payload.length : commands.length} lệnh (/setup-bell, /key) cho Guild ${guildId}!`,
);
