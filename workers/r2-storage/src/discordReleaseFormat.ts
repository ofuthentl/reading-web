import type { BookRow } from './booksDb';

const RELEASE_EMBED_COLOR = 0xc89b62;
const MAX_INLINE_LABELS_PER_EMBED = 6;
const MAX_TAGS_PER_EMBED = 8;
const DISCORD_ROLE_SNOWFLAKE_RE = /^\d{5,32}$/;

const VOL_CORE_WORD =
  '(?:vol(?:ume)?|tập|tap|quyển|quyen|chương|chuong|phần|phan|màn|man|hồi|hoi|book|part|act|arc|ep(?:isode)?)';
const SPECIAL_VOL_PREFIX =
  '(?:ss|ex|sp|ova|oad|extra|special|bonus|ngoại\\s+truyện|ngoai\\s+truyen|hậu\\s+truyện|hau\\s+truyen|tiền\\s+truyện|tien\\s+truyen|phiên\\s+ngoại|phien\\s+ngoai|side\\s+stor(?:y|ies)|short\\s+stor(?:y|ies)|after\\s+the\\s+end)';
const VOL_NUMBER_OR_PART =
  '(?:\\d+(?:[.,]\\d+)?(?:\\s*[-–—~]\\s*\\d+(?:[.,]\\d+)?)?|[ivxlcdm]{1,6}|thượng|thuong|trung|hạ|ha|đầu|dau|cuối|cuoi)';

const LEGACY_VOL_SEGMENT_RE = new RegExp(
  `^(?:${SPECIAL_VOL_PREFIX}\\.?\\s+${VOL_CORE_WORD}\\.?\\s*${VOL_NUMBER_OR_PART}|${VOL_CORE_WORD}\\.?\\s*(?:${VOL_NUMBER_OR_PART}|[a-z]|ex|ss|sp|ova|oad|bonus|extra|special)(?:\\s+${SPECIAL_VOL_PREFIX}(?:\\s*\\d+(?:[.,]\\d+)?)?)?|${SPECIAL_VOL_PREFIX}(?:\\.?\\s*\\d+(?:[.,]\\d+)?)?|(?:[chv]|#)\\.?\\s*\\d+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?|[IVX]{1,5})(?:$|[\\s\\-–—―−_:|：;/.,([（［【])`,
  'i',
);

export const SIMPLE_VOLUME_LABEL_RE =
  /^(?:(ss|ex|sp|ova|oad|extra|special|bonus|ngoại\s+truyện|ngoai\s+truyen|side\s+stor(?:y|ies)|short\s+stor(?:y|ies))\.?\s+)?(tập|tap|quyển|quyen|vol\.?|volume|phần|phan|book|part)?\s*0*(\d+)(?:\s+(ss|ex|sp|ova|oad|extra|special|bonus))?$/i;

export interface DiscordReleaseGroupInput {
  shelfKey: string;
  shelfName: string;
  books: Array<Pick<BookRow, 'id' | 'title' | 'author' | 'shelf' | 'cover_key'>>;
  tags: string[];
  hasCoverAttachment: boolean;
}

export function escapeDiscordMarkdown(text: string): string {
  return text.replace(/([\\*_~`|])/g, '\\$1');
}

function truncateAndEscapeDiscordText(
  raw: string,
  maxRawChars: number,
  maxEscapedChars: number,
): string {
  const escaped = escapeDiscordMarkdown(raw.trim().slice(0, maxRawChars));
  if (escaped.length <= maxEscapedChars) return escaped;
  let cut = escaped.slice(0, maxEscapedChars);
  // Không bao giờ cắt đứt chuỗi thoát `\` ở biên cuối
  let trailingSlashes = 0;
  for (let i = cut.length - 1; i >= 0 && cut[i] === '\\'; i -= 1) {
    trailingSlashes += 1;
  }
  if (trailingSlashes % 2 === 1) {
    cut = cut.slice(0, -1);
  }
  return cut;
}

export function splitLegacyReleaseBookFields(
  rawTitle: string,
  rawAuthor: string,
): { effectiveTitle: string; misplacedVolume: string | null; realAuthor: string } {
  const cleanTitle = (rawTitle || '').normalize('NFC').trim();
  const cleanAuthor = (rawAuthor || '').normalize('NFC').trim();
  if (!cleanAuthor || cleanAuthor.toLocaleLowerCase('vi') === 'không rõ tác giả') {
    return { effectiveTitle: cleanTitle, misplacedVolume: null, realAuthor: 'Không rõ tác giả' };
  }

  const parts = cleanAuthor
    .split(/\s+[-–—―−]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const moved: string[] = [];
  while (parts.length > 0 && LEGACY_VOL_SEGMENT_RE.test(parts[0])) {
    moved.push(parts.shift()!);
  }

  const misplacedVolume = moved.length > 0 ? moved.join(' - ') : null;
  const remaining = parts.join(' - ').trim();
  const realAuthor =
    remaining && !LEGACY_VOL_SEGMENT_RE.test(remaining) ? remaining : 'Không rõ tác giả';
  const effectiveTitle =
    misplacedVolume &&
    !cleanTitle.toLocaleLowerCase('vi').includes(misplacedVolume.toLocaleLowerCase('vi'))
      ? `${cleanTitle} - ${misplacedVolume}`
      : cleanTitle;

  return { effectiveTitle, misplacedVolume, realAuthor };
}

export function summarizeGroupAuthors(books: Array<{ title?: string; author: string }>): string {
  const known: string[] = [];
  const seen = new Set<string>();
  for (const book of books) {
    const { realAuthor } = splitLegacyReleaseBookFields(book.title || '', book.author || '');
    if (!realAuthor || realAuthor.toLocaleLowerCase('vi') === 'không rõ tác giả') continue;
    const key = realAuthor.toLocaleLowerCase('vi');
    if (seen.has(key)) continue;
    seen.add(key);
    known.push(realAuthor);
  }
  if (known.length === 0) return 'Không rõ tác giả';
  return known.slice(0, 4).join(', ').slice(0, 240);
}

export function sortBooksNaturally<T extends { title: string; author?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const effA = splitLegacyReleaseBookFields(a.title, a.author || '').effectiveTitle;
    const effB = splitLegacyReleaseBookFields(b.title, b.author || '').effectiveTitle;
    return effA.localeCompare(effB, 'vi', { numeric: true, sensitivity: 'base' });
  });
}

export function stripSeriesPrefix(bookTitle: string, shelfName: string): string {
  const title = bookTitle.normalize('NFC').trim();
  const shelf = shelfName.normalize('NFC').trim();
  if (!shelf) return title;

  const lowerTitle = title.toLocaleLowerCase('vi');
  const lowerShelf = shelf.toLocaleLowerCase('vi');
  if (lowerTitle === lowerShelf) return '';

  if (lowerTitle.startsWith(lowerShelf)) {
    const after = title.slice(shelf.length);
    if (/^[\s\-–—―−:|/]/.test(after)) {
      const rest = after.replace(/^[\s\-–—―−:|/]+/, '').trim();
      if (rest) return rest;
    }
  }
  return title;
}

function normalizeSpecialToken(raw?: string): string {
  const p = (raw || '').replace(/\.$/, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
  if (!p) return '';
  if (p === 'ss' || p === 'ex' || p === 'sp' || p === 'ova' || p === 'oad') {
    return p.toUpperCase();
  }
  if (p === 'ngoại truyện' || p === 'ngoai truyen') return 'Ngoại truyện';
  if (p.startsWith('side stor')) return p.endsWith('ies') ? 'Side Stories' : 'Side Story';
  if (p.startsWith('short stor')) return p.endsWith('ies') ? 'Short Stories' : 'Short Story';
  return p.charAt(0).toLocaleUpperCase('vi') + p.slice(1);
}

interface ParsedSimpleVol {
  groupKey: string;
  num: number;
  formatOne: (n: number) => string;
  sortPriority: number;
}

function parseSimpleVolumeItem(rawLabel: string): ParsedSimpleVol | null {
  const match = rawLabel.trim().match(SIMPLE_VOLUME_LABEL_RE);
  if (!match) return null;
  const prefixPart = normalizeSpecialToken(match[1]);
  const rawU = (match[2] || '').replace(/\.$/, '').trim().toLocaleLowerCase('vi');
  const suffixPart = normalizeSpecialToken(match[4]);
  if (!prefixPart && !rawU && !suffixPart) return null;
  if (prefixPart && suffixPart) return null;

  let unitPart = '';
  if (rawU === 'vol' || rawU === 'volume') unitPart = 'Vol.';
  else if (rawU === 'tập' || rawU === 'tap') unitPart = 'Tập';
  else if (rawU === 'quyển' || rawU === 'quyen') unitPart = 'Quyển';
  else if (rawU === 'phần' || rawU === 'phan') unitPart = 'Phần';
  else if (rawU) unitPart = rawU.charAt(0).toLocaleUpperCase('vi') + rawU.slice(1);

  const num = Number.parseInt(match[3], 10);
  if (!Number.isFinite(num)) return null;

  const head = [prefixPart, unitPart].filter(Boolean).join(' ');
  const tail = suffixPart ? ` ${suffixPart}` : '';
  const groupKey = `${head}#${suffixPart}`;
  const isSide = Boolean(prefixPart || suffixPart);
  return {
    groupKey,
    num,
    formatOne: (n: number) => `${head ? `${head} ` : ''}${n}${tail}`,
    sortPriority: isSide ? 1 : 0,
  };
}

export function formatReleaseVolumeSummary(
  sortedBooks: Array<{ title: string; author?: string }>,
  shelfName: string,
): string {
  const sameRawTitleAcrossBatch =
    sortedBooks.length > 1 &&
    new Set(sortedBooks.map((b) => (b.title || '').normalize('NFC').trim().toLocaleLowerCase('vi')))
      .size === 1;

  const shortLabels = sortedBooks.map((book) => {
    const { effectiveTitle, misplacedVolume } = splitLegacyReleaseBookFields(
      book.title,
      book.author || '',
    );
    if (misplacedVolume && sameRawTitleAcrossBatch) {
      return misplacedVolume;
    }
    const stripped = stripSeriesPrefix(effectiveTitle, shelfName);
    if (
      misplacedVolume &&
      stripSeriesPrefix(book.title, shelfName) === book.title.normalize('NFC').trim()
    ) {
      return misplacedVolume;
    }
    return stripped;
  });

  if (sortedBooks.length === 1) {
    const single = shortLabels[0]?.trim();
    return single ? `**${escapeDiscordMarkdown(single.slice(0, 180))}** vừa` : 'Vừa';
  }

  // Gom dải liên tiếp cho 1 hoặc 2 nhóm ("Tập 1 – Tập 10", "SS Tập 1 – SS Tập N", "Tập 2 SS – Tập 10 SS")
  const parsedSeq: ParsedSimpleVol[] = [];
  for (const label of shortLabels) {
    const item = parseSimpleVolumeItem(label);
    if (!item) break;
    parsedSeq.push(item);
  }

  if (parsedSeq.length === sortedBooks.length) {
    const byGroup = new Map<string, ParsedSimpleVol[]>();
    for (const item of parsedSeq) {
      const list = byGroup.get(item.groupKey);
      if (list) list.push(item);
      else byGroup.set(item.groupKey, [item]);
    }
    if (byGroup.size >= 1 && byGroup.size <= 3) {
      const groupSummaries: Array<{ priority: number; text: string }> = [];
      let allConsecutive = true;
      for (const items of byGroup.values()) {
        const ordered = [...items].sort((a, b) => a.num - b.num);
        const consecutive = ordered.every(
          (it, idx) => idx === 0 || it.num === ordered[idx - 1].num + 1,
        );
        if (!consecutive) {
          allConsecutive = false;
          break;
        }
        const first = ordered[0];
        const last = ordered[ordered.length - 1];
        const text =
          ordered.length === 1
            ? first.formatOne(first.num)
            : `${first.formatOne(first.num)} – ${last.formatOne(last.num)}`;
        groupSummaries.push({ priority: first.sortPriority, text });
      }
      if (allConsecutive) {
        groupSummaries.sort((a, b) => a.priority - b.priority);
        const rangeText = groupSummaries.map((g) => g.text).join(' · ');
        return `**${rangeText}** (${sortedBooks.length} tập) vừa`;
      }
    }
  }

  const rawDisplay = shortLabels.map((s, idx) => (s || sortedBooks[idx].title).trim());
  const uniqueNormalized = new Set(
    rawDisplay.map((s) => s.toLocaleLowerCase('vi')).filter(Boolean),
  );
  // Chặn lặp 6 lần chuỗi giống hệt nhau khi dữ liệu cũ bị đặt trùng tên hoặc cắt cụt kệ
  if (uniqueNormalized.size <= 1) {
    return `**${sortedBooks.length} tập mới** vừa`;
  }

  const dedupedEntries: Array<{ escaped: string; count: number }> = [];
  const entryByKey = new Map<string, { escaped: string; count: number }>();
  let totalLabeledBooks = 0;
  for (const label of rawDisplay) {
    const key = label.toLocaleLowerCase('vi');
    if (!key) continue;
    totalLabeledBooks += 1;
    const existing = entryByKey.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      const entry = { escaped: escapeDiscordMarkdown(label.slice(0, 80)), count: 1 };
      entryByKey.set(key, entry);
      dedupedEntries.push(entry);
    }
  }

  const shownEntries = dedupedEntries.slice(0, MAX_INLINE_LABELS_PER_EMBED);
  const shown = shownEntries.map((e) => e.escaped);
  const shownBooksCount = shownEntries.reduce((sum, e) => sum + e.count, 0);
  const remaining = Math.max(0, totalLabeledBooks - shownBooksCount);
  const joined =
    remaining > 0 ? `${shown.join(' · ')} … +${remaining} tập khác` : shown.join(' · ');
  return `**${joined}** vừa`;
}

export function buildDiscordReleaseMessagePayload(
  group: DiscordReleaseGroupInput,
  options: {
    appUrl: string;
    keyChannelUrl: string;
    includeComponents?: boolean;
    mentionRoleIds?: readonly string[];
  },
) {
  const sortedBooks = sortBooksNaturally(group.books);
  const volumePrefix = formatReleaseVolumeSummary(sortedBooks, group.shelfName);
  const inviteLine = `${volumePrefix} lên kệ tại **Ofu's Library** (${options.appUrl}) — ghé thư viện đọc ngay nhé!`;

  const authorLabel = truncateAndEscapeDiscordText(summarizeGroupAuthors(sortedBooks), 200, 240);
  // Cắt ngắn chuỗi tag TRƯỚC khi escape để tuyệt đối không cắt đứt dấu `\` ở biên 240 ký tự
  const rawTags = group.tags
    .map((tag) => tag.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, MAX_TAGS_PER_EMBED);
  const rawTagText = rawTags.join(', ').slice(0, 180);
  const escapedTagText = rawTagText ? truncateAndEscapeDiscordText(rawTagText, 180, 240) : '';

  const metaLine = escapedTagText
    ? `**Tác giả:** ${authorLabel} · **Thể loại:** ${escapedTagText}`
    : `**Tác giả:** ${authorLabel}`;

  const description = `${inviteLine}\n\n${metaLine}`.slice(0, 3900);

  const safeEmbedTitle = truncateAndEscapeDiscordText(group.shelfName, 200, 240);
  const embed: Record<string, unknown> = {
    title: `📚 ${safeEmbedTitle}`,
    description,
    color: RELEASE_EMBED_COLOR,
    footer: {
      text:
        sortedBooks.length > 1
          ? `Ofu's Library · ${sortedBooks.length} tập mới lên kệ`
          : "Ofu's Library · Tập mới lên kệ",
    },
    timestamp: new Date().toISOString(),
  };

  if (group.hasCoverAttachment) {
    embed.image = { url: 'attachment://cover.jpg' };
  }

  const validRoleIds = Array.from(
    new Set(
      (options.mentionRoleIds || [])
        .map((id) => id.trim())
        .filter((id) => DISCORD_ROLE_SNOWFLAKE_RE.test(id)),
    ),
  ).slice(0, 5);

  const payload: Record<string, unknown> = {
    ...(validRoleIds.length > 0 ? { content: validRoleIds.map((id) => `<@&${id}>`).join(' ') } : {}),
    embeds: [embed],
    allowed_mentions: validRoleIds.length > 0 ? { parse: [], roles: validRoleIds } : { parse: [] },
  };

  if (options.includeComponents !== false) {
    const cleanAppUrl = options.appUrl.replace(/\/+$/, '');
    const candidateDeepLink = `${cleanAppUrl}/?shelf=${encodeURIComponent(group.shelfName.trim())}`;
    const openLibraryUrl = candidateDeepLink.length <= 512 ? candidateDeepLink : cleanAppUrl;
    payload.components = [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: 'Mở thư viện',
            emoji: { name: '🌐' },
            url: openLibraryUrl,
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
