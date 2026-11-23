import { HttpError } from './auth';

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
const ANILIST_TIMEOUT_MS = 6000;
const MAX_QUERY_LENGTH = 120;
const MAX_ALT_TITLES_SUGGESTED = 12;
const MAX_ALT_TITLE_LEN = 180;
const MAX_CLEAN_DESC_LEN = 2500;
const MIN_ANILIST_TAG_RANK = 45;

/**
 * Bản sao đồng bộ 40 thể loại chuẩn Light Novel từ `src/lib/shelfTagPresets.ts` (D-032)
 * để map trực tiếp trên Worker.
 */
const PRESET_SHELF_TAG_SET = new Set<string>([
  '18+',
  'Action',
  'Adventure',
  'Comedy',
  'Dark Fantasy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Female Protagonist',
  'Game',
  'Harem',
  'Healing',
  'Historical',
  'Horror',
  'Isekai',
  'Light Novel',
  'Magic',
  'Martial Arts',
  'Mecha',
  'Military',
  'Mystery',
  'One-shot',
  'Post-Apocalyptic',
  'Psychological',
  'Romance',
  'School Life',
  'Sci-Fi',
  'Seinen',
  'Shoujo',
  'Shounen',
  'Slice of Life',
  'Slow Life',
  'Sports',
  'Super Power',
  'Supernatural',
  'Tragedy',
  'Tsundere',
  'Web Novel',
  'Yandere',
  'Yuri',
]);

const ANILIST_TERM_TO_PRESET_MAP: Record<string, string> = {
  action: 'Action',
  adventure: 'Adventure',
  comedy: 'Comedy',
  'dark fantasy': 'Dark Fantasy',
  drama: 'Drama',
  ecchi: 'Ecchi',
  fantasy: 'Fantasy',
  'female protagonist': 'Female Protagonist',
  'video games': 'Game',
  'virtual world': 'Game',
  'full dive': 'Game',
  game: 'Game',
  harem: 'Harem',
  'female harem': 'Harem',
  'male harem': 'Harem',
  'mixed gender harem': 'Harem',
  iyashikei: 'Healing',
  healing: 'Healing',
  historical: 'Historical',
  horror: 'Horror',
  'cosmic horror': 'Horror',
  'body horror': 'Horror',
  isekai: 'Isekai',
  magic: 'Magic',
  'martial arts': 'Martial Arts',
  wuxia: 'Martial Arts',
  cultivation: 'Martial Arts',
  mecha: 'Mecha',
  'real robot': 'Mecha',
  'super robot': 'Mecha',
  military: 'Military',
  war: 'Military',
  mystery: 'Mystery',
  detective: 'Mystery',
  'post-apocalyptic': 'Post-Apocalyptic',
  dystopian: 'Post-Apocalyptic',
  psychological: 'Psychological',
  romance: 'Romance',
  school: 'School Life',
  'school life': 'School Life',
  'school club': 'School Life',
  'sci-fi': 'Sci-Fi',
  cyberpunk: 'Sci-Fi',
  space: 'Sci-Fi',
  seinen: 'Seinen',
  shoujo: 'Shoujo',
  shounen: 'Shounen',
  'slice of life': 'Slice of Life',
  'slow life': 'Slow Life',
  rural: 'Slow Life',
  agriculture: 'Slow Life',
  sports: 'Sports',
  'super power': 'Super Power',
  espers: 'Super Power',
  supernatural: 'Supernatural',
  'urban fantasy': 'Supernatural',
  youkai: 'Supernatural',
  vampire: 'Supernatural',
  ghost: 'Supernatural',
  tragedy: 'Tragedy',
  tsundere: 'Tsundere',
  yandere: 'Yandere',
  yuri: 'Yuri',
  "girls' love": 'Yuri',
};

const ANILIST_LN_SEARCH_QUERY = `
query SearchLightNovels($search: String!, $perPage: Int!) {
  Page(page: 1, perPage: $perPage) {
    media(search: $search, type: MANGA, format: NOVEL, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
      id
      title {
        romaji
        english
        native
      }
      synonyms
      description(asHtml: false)
      genres
      isAdult
      volumes
      status
      startDate {
        year
      }
      tags {
        name
        rank
        isMediaSpoiler
        isGeneralSpoiler
      }
      staff(perPage: 8, sort: [RELEVANCE, ID]) {
        edges {
          role
          node {
            name {
              full
              native
            }
          }
        }
      }
    }
  }
}
`;

interface AniListMediaRaw {
  id?: number;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  } | null;
  synonyms?: Array<string | null> | null;
  description?: string | null;
  genres?: Array<string | null> | null;
  isAdult?: boolean | null;
  volumes?: number | null;
  status?: string | null;
  startDate?: { year?: number | null } | null;
  tags?: Array<{
    name?: string | null;
    rank?: number | null;
    isMediaSpoiler?: boolean | null;
    isGeneralSpoiler?: boolean | null;
  } | null> | null;
  staff?: {
    edges?: Array<{
      role?: string | null;
      node?: {
        name?: {
          full?: string | null;
          native?: string | null;
        } | null;
      } | null;
    } | null> | null;
  } | null;
}

export interface AniListNovelCandidate {
  anilistId: number;
  primaryTitle: string;
  titles: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  };
  altTitles: string[];
  author: string | null;
  description: string | null;
  mappedTags: string[];
  volumes: number | null;
  year: number | null;
  status: string | null;
}

const NAMED_HTML_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : full;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : full;
    }
    return NAMED_HTML_ENTITIES[entity.toLowerCase()] ?? full;
  });
}

export function cleanAniListDescription(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;

  let text = raw
    // Bóc bỏ spoiler markdown ~! ... !~ của AniList để tránh lộ tình tiết
    .replace(/~![\s\S]*?!~/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  text = decodeHtmlEntities(text)
    .replace(/\r\n?/g, '\n')
    // Bỏ dòng nguồn ghi chú cuối bài kiểu (Source: Yen Press) hoặc [Written by ...]
    .replace(/\n*\s*(?:\(Source:[^)\n]+\)|\[Written by[^\]]+\])\s*$/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .normalize('NFC');

  if (!text) return null;
  return text.length > MAX_CLEAN_DESC_LEN ? `${text.slice(0, MAX_CLEAN_DESC_LEN - 1).trim()}…` : text;
}

function extractPreferredAuthor(media: AniListMediaRaw): string | null {
  const edges = media.staff?.edges || [];
  let fallbackNonArt: string | null = null;

  for (const edge of edges) {
    const fullName = edge?.node?.name?.full?.trim() || edge?.node?.name?.native?.trim() || '';
    if (!fullName) continue;
    const role = (edge?.role || '').trim().toLowerCase();

    const isStoryRole =
      role.includes('story') ||
      role.includes('author') ||
      role.includes('original') ||
      role.includes('writer') ||
      role.includes('creator');
    if (isStoryRole) {
      return fullName.normalize('NFC');
    }

    const isPureArt =
      role.includes('art') || role.includes('illustrat') || role.includes('design');
    if (!isPureArt && !fallbackNonArt) {
      fallbackNonArt = fullName.normalize('NFC');
    }
  }

  return fallbackNonArt;
}

function collectAltTitles(media: AniListMediaRaw): {
  primaryTitle: string;
  titles: { romaji: string | null; english: string | null; native: string | null };
  altTitles: string[];
} {
  const romaji = media.title?.romaji?.trim().normalize('NFC') || null;
  const english = media.title?.english?.trim().normalize('NFC') || null;
  const native = media.title?.native?.trim().normalize('NFC') || null;
  const primaryTitle = romaji || english || native || 'Light Novel';

  const seen = new Set<string>();
  const altTitles: string[] = [];

  const candidates = [romaji, english, native, ...(media.synonyms || [])];
  for (const item of candidates) {
    if (typeof item !== 'string') continue;
    const cleaned = item.normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, MAX_ALT_TITLE_LEN);
    if (!cleaned) continue;
    const key = cleaned.toLocaleLowerCase('vi');
    if (seen.has(key)) continue;
    seen.add(key);
    altTitles.push(cleaned);
    if (altTitles.length >= MAX_ALT_TITLES_SUGGESTED) break;
  }

  return {
    primaryTitle,
    titles: { romaji, english, native },
    altTitles,
  };
}

function mapAniListToPresetTags(media: AniListMediaRaw): string[] {
  const selected = new Set<string>(['Light Novel']);

  if (media.isAdult) {
    selected.add('18+');
  }

  for (const genre of media.genres || []) {
    if (!genre) continue;
    const mapped = ANILIST_TERM_TO_PRESET_MAP[genre.trim().toLowerCase()];
    if (mapped && PRESET_SHELF_TAG_SET.has(mapped)) {
      selected.add(mapped);
    }
  }

  const validTags = (media.tags || [])
    .filter(
      (t): t is NonNullable<typeof t> =>
        Boolean(t?.name) &&
        !t?.isMediaSpoiler &&
        !t?.isGeneralSpoiler &&
        Number(t?.rank ?? 0) >= MIN_ANILIST_TAG_RANK,
    )
    .sort((a, b) => Number(b.rank ?? 0) - Number(a.rank ?? 0));

  for (const tag of validTags) {
    const key = (tag.name || '').trim().toLowerCase();
    const mapped = ANILIST_TERM_TO_PRESET_MAP[key];
    if (mapped && PRESET_SHELF_TAG_SET.has(mapped)) {
      selected.add(mapped);
    }
  }

  return Array.from(selected).slice(0, 16);
}

export async function searchAniListLightNovels(
  rawBody: unknown,
): Promise<{ candidates: AniListNovelCandidate[] }> {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as {
    query?: unknown;
  } | null;
  const query =
    typeof body?.query === 'string'
      ? body.query.normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH)
      : '';
  if (query.length < 2) {
    throw new HttpError('Từ khoá tìm kiếm AniList cần ít nhất 2 ký tự.', 400);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ANILIST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ANILIST_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'OfusLibrary/1.0 (+https://ofu.lol)',
      },
      body: JSON.stringify({
        query: ANILIST_LN_SEARCH_QUERY,
        variables: { search: query, perPage: 6 },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    throw new HttpError(
      isAbort
        ? 'AniList phản hồi quá 6 giây. Bạn vẫn có thể nhập thông tin thủ công.'
        : 'Không thể kết nối tới AniList lúc này. Bạn vẫn có thể nhập thủ công.',
      504,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new HttpError(
      `AniList tạm thời bận (HTTP ${response.status}). Bạn vẫn có thể nhập thủ công.`,
      502,
    );
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: { Page?: { media?: AniListMediaRaw[] | null } | null } | null;
  } | null;

  const mediaList = payload?.data?.Page?.media || [];
  const candidates: AniListNovelCandidate[] = [];

  for (const media of mediaList) {
    if (!media || typeof media.id !== 'number') continue;
    const { primaryTitle, titles, altTitles } = collectAltTitles(media);
    candidates.push({
      anilistId: media.id,
      primaryTitle,
      titles,
      altTitles,
      author: extractPreferredAuthor(media),
      description: cleanAniListDescription(media.description),
      mappedTags: mapAniListToPresetTags(media),
      volumes: typeof media.volumes === 'number' && media.volumes > 0 ? media.volumes : null,
      year:
        typeof media.startDate?.year === 'number' && media.startDate.year > 0
          ? media.startDate.year
          : null,
      status: typeof media.status === 'string' ? media.status : null,
    });
  }

  return { candidates };
}
