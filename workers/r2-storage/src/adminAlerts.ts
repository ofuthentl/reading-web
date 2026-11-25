import type { Env } from './booksDb';

const ALERT_TIMEOUT_MS = 2500;
const ALERT_DEDUP_COOLDOWN_MS = 5 * 60 * 1000; // Chống spam tối đa 1 cảnh báo / 5 phút mỗi đối tượng trên isolate
const recentAlertSentAt = new Map<string, number>();

export type AdminSecurityAlertEvent =
  | {
      kind: 'guest_strike_lockout';
      discordUserId: string;
      discordUsername?: string;
      strikes: number;
      endpoint: string;
    }
  | {
      kind: 'login_ip_locked';
      ipHashPrefix: string;
      failCount: number;
      lockSeconds: number;
    };

export function isValidDiscordWebhookUrl(rawUrl: string | undefined): boolean {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    const allowedHost =
      host === 'discord.com' ||
      host === 'discordapp.com' ||
      host === 'ptb.discord.com' ||
      host === 'canary.discord.com';
    if (!allowedHost) return false;
    return /^\/api\/(?:v\d+\/)?webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function buildAdminSecurityAlertPayload(event: AdminSecurityAlertEvent) {
  const isoTimestamp = new Date().toISOString();
  if (event.kind === 'guest_strike_lockout') {
    const label = event.discordUsername
      ? `${event.discordUsername} (\`${event.discordUserId}\`)`
      : `\`${event.discordUserId}\``;
    return {
      allowed_mentions: { parse: [] as string[] },
      embeds: [
        {
          title: '🚨 Tự đóng phiên Khách Discord (Strike 10)',
          description: `Tài khoản ${label} vừa chạm ngưỡng **${event.strikes} strikes** tại \`${event.endpoint}\` và đã bị tự động đóng phiên 24 giờ.`,
          color: 0xdc2626,
          timestamp: isoTimestamp,
          footer: { text: "Ofu's Library · Security Alert" },
        },
      ],
    };
  }

  return {
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title: '🛡️ Khoá tạm IP do dò mật mã / chìa khoá',
        description: `Dấu IP ẩn danh \`#${event.ipHashPrefix}\` đã nhập sai liên tiếp (**${event.failCount} lần**) tại \`/api/auth/login\` và bị khoá tạm **${event.lockSeconds} giây**.`,
        color: 0xd97706,
        timestamp: isoTimestamp,
        footer: { text: "Ofu's Library · Security Alert" },
      },
    ],
  };
}

function getAlertDedupKey(event: AdminSecurityAlertEvent): string {
  return event.kind === 'guest_strike_lockout'
    ? `strike:${event.discordUserId}`
    : `login:${event.ipHashPrefix}`;
}

async function sendAdminSecurityAlert(
  webhookUrl: string,
  event: AdminSecurityAlertEvent,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildAdminSecurityAlertPayload(event)),
      signal: controller.signal,
    });
  } catch {
    // Tuyệt đối không làm ảnh hưởng request chính nếu Discord webhook chậm hoặc lỗi
  } finally {
    clearTimeout(timer);
  }
}

export function scheduleAdminSecurityAlert(
  ctx: ExecutionContext | undefined,
  env: Pick<Env, 'DISCORD_ADMIN_ALERT_WEBHOOK_URL'>,
  event: AdminSecurityAlertEvent,
): void {
  const webhookUrl = env.DISCORD_ADMIN_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl || !isValidDiscordWebhookUrl(webhookUrl)) return;

  const now = Date.now();
  const dedupKey = getAlertDedupKey(event);
  const lastSent = recentAlertSentAt.get(dedupKey) ?? 0;
  if (now - lastSent < ALERT_DEDUP_COOLDOWN_MS) return;

  if (recentAlertSentAt.size > 200) {
    for (const [k, ts] of recentAlertSentAt.entries()) {
      if (now - ts >= ALERT_DEDUP_COOLDOWN_MS) recentAlertSentAt.delete(k);
    }
  }
  recentAlertSentAt.set(dedupKey, now);

  const task = sendAdminSecurityAlert(webhookUrl, event);
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(task);
  } else {
    void task;
  }
}
