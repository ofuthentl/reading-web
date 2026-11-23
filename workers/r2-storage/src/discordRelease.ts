import { HttpError } from './auth';
import { type BookRow, type Env, MAX_COVER_BYTES, isValidId } from './booksDb';
import { toShelfAccessKey } from './shelfAccessDb';
import { ensureShelfTagsSchema, parseShelfTagsJson } from './shelfTagsDb';

const RELEASE_EMBED_COLOR = 0xc89b62;
const MAX_BOOK_IDS_PER_ANNOUNCE = 50;
const MAX_VOLUME_LINES_PER_EMBED = 15;
const MAX_TAGS_PER_EMBED = 8;
const DISCORD_REQUEST_TIMEOUT_MS = 8000;
const DISCORD_SNOWFLAKE_RE = /^\d{5,32}$/;
const DISCORD_WEBHOOK_RE =
  /^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d{5,32}\/[A-Za-z0-9._-]+(?:\?.*)?$/;

export interface DiscordReleaseGroupInput {
  shelfKey: string;
  shelfName: string;
  books: Array<Pick<BookRow, 'id' | 'title' | 'author' | 'shelf' | 'cover_key'>>;
  tags: string[];
  hasCoverAttachment: boolean;
}

export interface DiscordReleaseDeliveryTarget {
  mode: 'bot_channel' | 'webhook';
  url: string;
  headers: Record<string, string>;
}

export interface DiscordReleaseAnnounceResult {
  ok: boolean;
  configured: boolean;
  mode: 'bot_channel' | 'webhook' | null;
  announcedGroups: number;
  announcedBooks: number;
  failedGroups: number;
  message: string;
  errors?: string[];
}

function cleanConfig(value: string | undefined): string {
  return (value || '').trim().replace(/^['"]+|['"]+$/g, '').trim();
}

export function resolvePublicAppUrl(env: Pick<Env, 'PUBLIC_APP_URL' | 'APP_ORIGINS'>): string {
  const configured = cleanConfig(env.PUBLIC_APP_URL).replace(/\/+$/, '');
  if (configured) return configured;
  const firstHttps = (env.APP_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .find((item) => item.startsWith('https://'));
  return (firstHttps || 'https://ofu.lol').replace(/\/+$/, '');
}

export function resolveKeyChannelUrl(
  env: Pick<Env, 'DISCORD_GUILD_ID' | 'DISCORD_KEY_CHANNEL_ID' | 'PUBLIC_APP_URL' | 'APP_ORIGINS'>,
): string {
  const guildId = cleanConfig(env.DISCORD_GUILD_ID);
  const keyChannelId = cleanConfig(env.DISCORD_KEY_CHANNEL_ID);
  if (DISCORD_SNOWFLAKE_RE.test(guildId) && DISCORD_SNOWFLAKE_RE.test(keyChannelId)) {
    return `https://discord.com/channels/${guildId}/${keyChannelId}`;
  }
  return `${resolvePublicAppUrl(env)}/entrance`;
}

export function resolveReleaseDeliveryTarget(
  env: Pick<Env, 'DISCORD_BOT_TOKEN' | 'DISCORD_RELEASE_CHANNEL_ID' | 'DISCORD_RELEASE_WEBHOOK_URL'>,
): DiscordReleaseDeliveryTarget | null {
  const botToken = cleanConfig(env.DISCORD_BOT_TOKEN);
  const channelId = cleanConfig(env.DISCORD_RELEASE_CHANNEL_ID);
  if (botToken && DISCORD_SNOWFLAKE_RE.test(channelId)) {
    return {
      mode: 'bot_channel',
      url: `https://discord.com/api/v10/channels/${channelId}/messages`,
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    };
  }

  const webhookUrl = cleanConfig(env.DISCORD_RELEASE_WEBHOOK_URL);
  if (webhookUrl && DISCORD_WEBHOOK_RE.test(webhookUrl)) {
    const separator = webhookUrl.includes('?') ? '&' : '?';
    return {
      mode: 'webhook',
      url: `${webhookUrl}${separator}wait=true`,
      headers: {},
    };
  }

  return null;
}

function summarizeGroupAuthors(books: Array<{ author: string }>): string {
  const known: string[] = [];
  const seen = new Set<string>();
  for (const book of books) {
    const clean = (book.author || '').trim();
    if (!clean || clean.toLocaleLowerCase('vi') === 'không rõ tác giả') continue;
    const key = clean.toLocaleLowerCase('vi');
    if (seen.has(key)) continue;
    seen.add(key);
    known.push(clean);
  }
  if (known.length === 0) return 'Không rõ tác giả';
  return known.slice(0, 4).join(', ').slice(0, 240);
}

function sortBooksNaturally<T extends { title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.title.localeCompare(b.title, 'vi', { numeric: true, sensitivity: 'base' }),
  );
}

export function buildDiscordReleaseMessagePayload(
  group: DiscordReleaseGroupInput,
  options: { appUrl: string; keyChannelUrl: string; includeComponents?: boolean },
) {
  const sortedBooks = sortBooksNaturally(group.books);
  const shownLines = sortedBooks
    .slice(0, MAX_VOLUME_LINES_PER_EMBED)
    .map((book) => `• **${book.title.trim().slice(0, 180)}**`);
  const remaining = sortedBooks.length - shownLines.length;
  if (remaining > 0) {
    shownLines.push(`• *… và còn ${remaining} tập khác*`);
  }

  const inviteLine = `Tập mới vừa lên kệ tại **Ofu's Library** (${options.appUrl}) — ghé thư viện đọc ngay nhé!`;
  const description = [...shownLines, '', inviteLine].join('\n').slice(0, 3900);

  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    {
      name: 'Tác giả',
      value: summarizeGroupAuthors(sortedBooks),
      inline: true,
    },
  ];

  const cleanTags = group.tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS_PER_EMBED);
  if (cleanTags.length > 0) {
    fields.push({
      name: 'Thể loại',
      value: cleanTags.join(' · ').slice(0, 240),
      inline: true,
    });
  }

  const embed: Record<string, unknown> = {
    title: `📚 ${group.shelfName.trim().slice(0, 240)}`,
    description,
    color: RELEASE_EMBED_COLOR,
    fields,
    footer: {
      text:
        sortedBooks.length > 1
          ? `Ofu's Library · ${sortedBooks.length} tập mới lên kệ`
          : "Ofu's Library · Tập mới lên kệ",
    },
    timestamp: new Date().toISOString(),
  };

  if (group.hasCoverAttachment) {
    embed.thumbnail = { url: 'attachment://cover.jpg' };
  }

  const payload: Record<string, unknown> = {
    embeds: [embed],
    allowed_mentions: { parse: [] },
  };

  if (options.includeComponents !== false) {
    payload.components = [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: 'Mở thư viện',
            emoji: { name: '🌐' },
            url: options.appUrl,
          },
          {
            type: 2,
            style: 5,
            label: 'Nhận chìa khoá',
            emoji: { name: '🔔' },
            url: options.keyChannelUrl,
          },
        ],
      },
    ];
  }

  return payload;
}

async function readCoverBytesFromR2(
  bucket: R2Bucket,
  coverKey: string | null | undefined,
): Promise<Uint8Array | null> {
  if (!coverKey) return null;
  try {
    const obj = await bucket.get(coverKey);
    if (!obj || obj.size <= 0 || obj.size > MAX_COVER_BYTES) return null;
    const buffer = await obj.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) return null;
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

async function postSingleDiscordRelease(
  target: DiscordReleaseDeliveryTarget,
  payload: Record<string, unknown>,
  coverBytes: Uint8Array | null,
): Promise<{ ok: boolean; status: number; errorText?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCORD_REQUEST_TIMEOUT_MS);

  try {
    let response: Response;
    if (coverBytes) {
      const form = new FormData();
      form.append('payload_json', JSON.stringify(payload));
      form.append('files[0]', new Blob([coverBytes], { type: 'image/jpeg' }), 'cover.jpg');
      response = await fetch(target.url, {
        method: 'POST',
        headers: target.headers,
        body: form,
        signal: controller.signal,
      });
    } else {
      response = await fetch(target.url, {
        method: 'POST',
        headers: {
          ...target.headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    }

    if (response.ok) {
      return { ok: true, status: response.status };
    }
    const text = await response.text().catch(() => '');
    return {
      ok: false,
      status: response.status,
      errorText: text.slice(0, 200) || `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      errorText: err instanceof Error ? err.message : 'Lỗi kết nối Discord API.',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function announceDiscordReleases(
  env: Env,
  rawBody: unknown,
): Promise<DiscordReleaseAnnounceResult> {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    bookIds?: unknown;
  } | null;

  const bookIds = Array.isArray(body?.bookIds)
    ? Array.from(
        new Set(body.bookIds.filter((id): id is string => typeof id === 'string' && isValidId(id))),
      ).slice(0, MAX_BOOK_IDS_PER_ANNOUNCE)
    : [];

  if (bookIds.length === 0) {
    throw new HttpError('Danh sách sách cần thông báo trống hoặc không hợp lệ.', 400);
  }

  const target = resolveReleaseDeliveryTarget(env);
  if (!target) {
    return {
      ok: false,
      configured: false,
      mode: null,
      announcedGroups: 0,
      announcedBooks: 0,
      failedGroups: 0,
      message:
        'Chưa cấu hình kênh thông báo Discord (DISCORD_RELEASE_CHANNEL_ID + DISCORD_BOT_TOKEN hoặc DISCORD_RELEASE_WEBHOOK_URL).',
    };
  }

  await ensureShelfTagsSchema(env.DB).catch(() => undefined);

  const placeholders = bookIds.map(() => '?').join(', ');
  const booksRes = await env.DB.prepare(
    `SELECT id, title, author, shelf, cover_key FROM books WHERE id IN (${placeholders})`,
  )
    .bind(...bookIds)
    .all<Pick<BookRow, 'id' | 'title' | 'author' | 'shelf' | 'cover_key'>>();

  const foundBooks = booksRes.results || [];
  if (foundBooks.length === 0) {
    return {
      ok: false,
      configured: true,
      mode: target.mode,
      announcedGroups: 0,
      announcedBooks: 0,
      failedGroups: 0,
      message: 'Không tìm thấy tập sách hợp lệ để đăng thông báo Discord.',
    };
  }

  // Gom nhóm theo bộ truyện (shelf_key) — thống nhất 1 mẫu duy nhất cho cả public & restricted (D-037)
  const grouped = new Map<
    string,
    {
      shelfName: string;
      books: Array<Pick<BookRow, 'id' | 'title' | 'author' | 'shelf' | 'cover_key'>>;
    }
  >();
  for (const book of foundBooks) {
    const shelfName = (book.shelf || 'Kho chưa phân loại').trim() || 'Kho chưa phân loại';
    const shelfKey = toShelfAccessKey(shelfName);
    const existing = grouped.get(shelfKey);
    if (existing) {
      existing.books.push(book);
    } else {
      grouped.set(shelfKey, { shelfName, books: [book] });
    }
  }

  const shelfKeys = Array.from(grouped.keys());
  const shelfPlaceholders = shelfKeys.map(() => '?').join(', ');
  const prefsRes = await env.DB.prepare(
    `SELECT shelf_key, cover_book_id, tags_json FROM shelf_prefs WHERE shelf_key IN (${shelfPlaceholders})`,
  )
    .bind(...shelfKeys)
    .all<{ shelf_key: string; cover_book_id: string | null; tags_json: string | null }>()
    .catch(() => ({
      results: [] as Array<{
        shelf_key: string;
        cover_book_id: string | null;
        tags_json: string | null;
      }>,
    }));

  const prefsMap = new Map<string, { coverBookId: string | null; tags: string[] }>();
  const extraCoverBookIds: string[] = [];
  for (const row of prefsRes.results || []) {
    prefsMap.set(row.shelf_key, {
      coverBookId: row.cover_book_id || null,
      tags: parseShelfTagsJson(row.tags_json),
    });
    if (row.cover_book_id && !bookIds.includes(row.cover_book_id)) {
      extraCoverBookIds.push(row.cover_book_id);
    }
  }

  const extraCoverMap = new Map<string, string>();
  if (extraCoverBookIds.length > 0) {
    const extraPlaceholders = extraCoverBookIds.map(() => '?').join(', ');
    const extraRes = await env.DB.prepare(
      `SELECT id, cover_key FROM books WHERE id IN (${extraPlaceholders}) AND cover_key IS NOT NULL`,
    )
      .bind(...extraCoverBookIds)
      .all<{ id: string; cover_key: string }>()
      .catch(() => ({ results: [] as Array<{ id: string; cover_key: string }> }));
    for (const row of extraRes.results || []) {
      if (row.cover_key) extraCoverMap.set(row.id, row.cover_key);
    }
  }

  const appUrl = resolvePublicAppUrl(env);
  const keyChannelUrl = resolveKeyChannelUrl(env);

  let announcedGroups = 0;
  let announcedBooks = 0;
  let failedGroups = 0;
  const errors: string[] = [];

  for (const [shelfKey, entry] of grouped.entries()) {
    const sortedBooks = sortBooksNaturally(entry.books);
    const pref = prefsMap.get(shelfKey);
    const uploadedCoverKey = sortedBooks.find((b) => Boolean(b.cover_key))?.cover_key ?? null;
    const fallbackCoverKey = pref?.coverBookId ? extraCoverMap.get(pref.coverBookId) ?? null : null;
    const coverBytes = await readCoverBytesFromR2(
      env.BOOKS_BUCKET,
      uploadedCoverKey || fallbackCoverKey,
    );

    const groupInput: DiscordReleaseGroupInput = {
      shelfKey,
      shelfName: entry.shelfName,
      books: sortedBooks,
      tags: pref?.tags ?? [],
      hasCoverAttachment: Boolean(coverBytes),
    };

    const payload = buildDiscordReleaseMessagePayload(groupInput, {
      appUrl,
      keyChannelUrl,
      includeComponents: true,
    });

    let sendRes = await postSingleDiscordRelease(target, payload, coverBytes);

    // Nếu dùng Webhook cá nhân (không phải app-owned) bị Discord từ chối trường components → tự gửi lại không kèm components
    if (!sendRes.ok && target.mode === 'webhook' && sendRes.status === 400) {
      const fallbackPayload = buildDiscordReleaseMessagePayload(groupInput, {
        appUrl,
        keyChannelUrl,
        includeComponents: false,
      });
      sendRes = await postSingleDiscordRelease(target, fallbackPayload, coverBytes);
    }

    if (sendRes.ok) {
      announcedGroups += 1;
      announcedBooks += sortedBooks.length;
    } else {
      failedGroups += 1;
      errors.push(`${entry.shelfName}: ${sendRes.errorText || `HTTP ${sendRes.status}`}`);
    }
  }

  const ok = announcedGroups > 0 && failedGroups === 0;
  const message = ok
    ? `Đã đăng ${announcedGroups} thông báo (${announcedBooks} tập mới) lên kênh Discord.`
    : announcedGroups > 0
      ? `Đã đăng ${announcedGroups} thông báo lên Discord, ${failedGroups} bộ gặp lỗi.`
      : `Không thể gửi thông báo lên Discord (${errors[0] || 'lỗi không xác định'}).`;

  return {
    ok,
    configured: true,
    mode: target.mode,
    announcedGroups,
    announcedBooks,
    failedGroups,
    message,
    ...(errors.length > 0 ? { errors } : {}),
  };
}
