import {
  DISCORD_KEY_TTL_MS,
  ensureDiscordAccessTable,
  generateDiscordAccessKey,
  sha256Hex,
} from './auth';
import type { Env } from './booksDb';

const DISCORD_INTERACTION_PING = 1;
const DISCORD_INTERACTION_APPLICATION_COMMAND = 2;
const DISCORD_INTERACTION_MESSAGE_COMPONENT = 3;

const DISCORD_RESPONSE_PONG = 1;
const DISCORD_RESPONSE_CHANNEL_MESSAGE = 4;
const DISCORD_FLAG_EPHEMERAL = 64;

const DISCORD_BUTTON_RING_BELL_ID = 'ring_library_bell';
const KEY_ISSUE_COOLDOWN_MS = 15 * 1000; // 15s anti-spam per Discord user

const PERMISSION_ADMINISTRATOR = 0x8n;
const PERMISSION_MANAGE_GUILD = 0x20n;

interface DiscordUserPayload {
  id?: string;
  username?: string;
  global_name?: string | null;
}

interface DiscordInteractionPayload {
  type?: number;
  guild_id?: string;
  channel_id?: string;
  member?: {
    nick?: string | null;
    permissions?: string;
    user?: DiscordUserPayload;
  };
  user?: DiscordUserPayload;
  data?: {
    name?: string;
    custom_id?: string;
  };
}

function discordJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function ephemeralMessage(content: string): Response {
  return discordJson({
    type: DISCORD_RESPONSE_CHANNEL_MESSAGE,
    data: {
      flags: DISCORD_FLAG_EPHEMERAL,
      content,
    },
  });
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function cleanSecret(value: string | undefined): string {
  return (value || '').trim().replace(/^['"]+|['"]+$/g, '').trim();
}

export function isValidDiscordPublicKeyFormat(publicKeyHex: string | undefined): boolean {
  const clean = cleanSecret(publicKeyHex);
  return clean.length === 64 && /^[0-9a-fA-F]{64}$/.test(clean);
}

export async function verifyDiscordSignature(
  rawBody: string,
  signatureHex: string | null,
  timestamp: string | null,
  publicKeyHex: string | undefined,
): Promise<boolean> {
  const cleanPubKey = cleanSecret(publicKeyHex);
  if (!cleanPubKey || !signatureHex || timestamp === null) return false;

  const pubKeyBytes = hexToBytes(cleanPubKey);
  const sigBytes = hexToBytes(signatureHex.trim());
  if (!pubKeyBytes || pubKeyBytes.length !== 32 || !sigBytes || sigBytes.length !== 64) {
    return false;
  }

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      pubKeyBytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    const messageBytes = new TextEncoder().encode(timestamp + rawBody);
    return await crypto.subtle.verify({ name: 'Ed25519' }, cryptoKey, sigBytes, messageBytes);
  } catch {
    return false;
  }
}

function hasAdminGuildPermission(permissionsRaw: string | undefined): boolean {
  if (!permissionsRaw || !/^\d+$/.test(permissionsRaw)) return false;
  const bits = BigInt(permissionsRaw);
  return (
    (bits & PERMISSION_ADMINISTRATOR) === PERMISSION_ADMINISTRATOR ||
    (bits & PERMISSION_MANAGE_GUILD) === PERMISSION_MANAGE_GUILD
  );
}

function resolvePublicAppUrl(env: Env): string {
  const configured = env.PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const firstOrigin = (env.APP_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .find((item) => item.startsWith('https://'));
  return firstOrigin || 'https://ofu.lol';
}

function buildBellPanelPayload(appUrl: string) {
  return {
    embeds: [
      {
        title: "📚 Ofu's Library — Cổng Thư Viện",
        description: [
          `Kho sách đọc trực tuyến tại **[${appUrl.replace(/^https?:\/\//, '')}](${appUrl})**.`,
          '',
          'Cánh cửa luôn khép với người lạ. Bấm nút **Nhận chìa khoá** bên dưới để Thủ thư trao riêng cho bạn một mã khoá mật (chỉ mình bạn nhìn thấy):',
          `• Nhập mã tại **[cổng thư viện](${appUrl})** trong vòng **5 phút** trước khi hiệu lực tan biến.`,
          '• Mỗi mã chỉ dùng **1 lần** và giữ quyền đọc thư viện trong **24 giờ**.',
        ].join('\n'),
        color: 0xc89b62,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 2,
            custom_id: DISCORD_BUTTON_RING_BELL_ID,
            label: 'Nhận chìa khoá',
            emoji: { name: '🔔' },
          },
        ],
      },
    ],
  };
}

async function issueKeyForDiscordMember(
  env: Env,
  discordUserId: string,
  discordUsername: string,
): Promise<Response> {
  await ensureDiscordAccessTable(env.DB);
  const now = Date.now();

  const existing = await env.DB.prepare(
    'SELECT key_issued_at, key_expires_at FROM discord_access WHERE discord_user_id = ?',
  )
    .bind(discordUserId)
    .first<{ key_issued_at: number | null; key_expires_at: number | null }>();

  if (
    existing?.key_issued_at &&
    existing.key_expires_at &&
    existing.key_expires_at > now &&
    now - existing.key_issued_at < KEY_ISSUE_COOLDOWN_MS
  ) {
    const waitSeconds = Math.max(
      1,
      Math.ceil((KEY_ISSUE_COOLDOWN_MS - (now - existing.key_issued_at)) / 1000),
    );
    return ephemeralMessage(
      `⏳ Bạn vừa nhận chìa khoá cách đây vài giây. Hãy dùng mã ở tin nhắn ẩn phía trên hoặc chờ **${waitSeconds} giây** để lấy mã mới nhé.`,
    );
  }

  const rawKey = generateDiscordAccessKey();
  const keyHash = await sha256Hex(rawKey);
  const expiresAt = now + DISCORD_KEY_TTL_MS;
  const expiresUnixSec = Math.floor(expiresAt / 1000);
  const appUrl = resolvePublicAppUrl(env);

  await env.DB.prepare(
    `INSERT INTO discord_access (discord_user_id, discord_username, key_hash, key_issued_at, key_expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(discord_user_id) DO UPDATE SET
       discord_username = excluded.discord_username,
       key_hash = excluded.key_hash,
       key_issued_at = excluded.key_issued_at,
       key_expires_at = excluded.key_expires_at,
       updated_at = excluded.updated_at`,
  )
    .bind(discordUserId, discordUsername.slice(0, 80), keyHash, now, expiresAt, now)
    .run();

  return ephemeralMessage(
    [
      `🔑 **\`${rawKey}\`**`,
      '',
      `Chìa khoá của bạn đây! Hãy nhập mã này tại **[cổng thư viện](${appUrl})** trong vòng **5 phút** (hết hạn <t:${expiresUnixSec}:R>) trước khi hiệu lực tan biến.`,
      '-# Mã chỉ xoay được 1 lần và giữ cửa mở trong 24 giờ (chế độ đọc 2D). Mọi cánh cửa cũ bạn đang mở ở nơi khác sẽ tự động khép lại.',
    ].join('\n'),
  );
}

export async function handleDiscordInteraction(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');

  const isValid = await verifyDiscordSignature(
    rawBody,
    signature,
    timestamp,
    env.DISCORD_PUBLIC_KEY,
  );
  if (!isValid) {
    return new Response('Invalid request signature', { status: 401 });
  }

  let interaction: DiscordInteractionPayload;
  try {
    interaction = JSON.parse(rawBody) as DiscordInteractionPayload;
  } catch {
    return new Response('Invalid interaction payload', { status: 400 });
  }

  if (interaction.type === DISCORD_INTERACTION_PING) {
    return discordJson({ type: DISCORD_RESPONSE_PONG });
  }

  const allowedGuildId = cleanSecret(env.DISCORD_GUILD_ID);
  if (!allowedGuildId) {
    return ephemeralMessage('⚠️ Máy chủ chưa cấu hình `DISCORD_GUILD_ID`.');
  }
  if (!interaction.guild_id || interaction.guild_id !== allowedGuildId) {
    return ephemeralMessage('🚫 Chìa khoá chỉ được cấp bên trong máy chủ Discord được phép.');
  }

  const memberUser = interaction.member?.user;
  const userId = memberUser?.id?.trim();
  if (!userId || !/^\d{5,32}$/.test(userId)) {
    return ephemeralMessage('🚫 Không xác định được tài khoản thành viên Discord.');
  }
  const displayName =
    interaction.member?.nick?.trim() ||
    memberUser?.global_name?.trim() ||
    memberUser?.username?.trim() ||
    'Discord Reader';

  // Slash commands: /setup-bell (Admin only) or /key (member shortcut)
  if (interaction.type === DISCORD_INTERACTION_APPLICATION_COMMAND) {
    const commandName = interaction.data?.name;

    if (commandName === 'setup-bell') {
      if (!hasAdminGuildPermission(interaction.member?.permissions)) {
        return ephemeralMessage(
          '🚫 Chỉ Quản trị viên máy chủ Discord mới có quyền đặt bảng chuông thư viện.',
        );
      }

      const appUrl = resolvePublicAppUrl(env);
      const panelPayload = buildBellPanelPayload(appUrl);
      const botToken = cleanSecret(env.DISCORD_BOT_TOKEN);

      if (botToken && interaction.channel_id && /^\d{5,32}$/.test(interaction.channel_id)) {
        const postRes = await fetch(
          `https://discord.com/api/v10/channels/${interaction.channel_id}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bot ${botToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(panelPayload),
          },
        ).catch(() => null);

        if (postRes?.ok) {
          return ephemeralMessage('✅ Đã đặt bảng chuông nhận chìa khoá cố định tại kênh này!');
        }
      }

      return discordJson({
        type: DISCORD_RESPONSE_CHANNEL_MESSAGE,
        data: panelPayload,
      });
    }

    if (commandName === 'key') {
      return issueKeyForDiscordMember(env, userId, displayName);
    }

    return ephemeralMessage('⚠️ Lệnh không được hỗ trợ.');
  }

  // Button click: 🔔 Nhận chìa khoá
  if (
    interaction.type === DISCORD_INTERACTION_MESSAGE_COMPONENT &&
    interaction.data?.custom_id === DISCORD_BUTTON_RING_BELL_ID
  ) {
    return issueKeyForDiscordMember(env, userId, displayName);
  }

  return ephemeralMessage('⚠️ Tương tác không được hỗ trợ.');
}
