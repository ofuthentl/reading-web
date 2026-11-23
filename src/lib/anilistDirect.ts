import type { AniListNovelCandidate } from '@/types';
import { PRESET_SHELF_TAGS } from '@/lib/shelfTagPresets';

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
const ANILIST_TIMEOUT_MS = 6000;
const MIN_TAG_RANK = 45;
const PRESET_SET = new Set<string>(PRESET_SHELF_TAGS);

const TERM_TO_PRESET: Record<string, string> = {
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
  isekai: 'Isekai',
  magic: 'Magic',
  'martial arts': 'Martial Arts',
  mecha: 'Mecha',
  military: 'Military',
  mystery: 'Mystery',
  'post-apocalyptic': 'Post-Apocalyptic',
  psychological: 'Psychological',
  romance: 'Romance',
  school: 'School Life',
  'school life': 'School Life',
  'sci-fi': 'Sci-Fi',
  seinen: 'Seinen',
  shoujo: 'Shoujo',
  shounen: 'Shounen',
  'slice of life': 'Slice of Life',
  'slow life': 'Slow Life',
  sports: 'Sports',
  'super power': 'Super Power',
  supernatural: 'Supernatural',
  tragedy: 'Tragedy',
  tsundere: 'Tsundere',
  yandere: 'Yandere',
  yuri: 'Yuri',
  "girls' love": 'Yuri',
};

const QUERY = `
query SearchLightNovels($search: String!, $perPage: Int!) {
  Page(page: 1, perPage: $perPage) {
    media(search: $search, type: MANGA, format: NOVEL, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
      id
      title { romaji english native }
      synonyms
      description(asHtml: false)
      genres
      isAdult
      volumes
      status
      startDate { year }
      tags { name rank isMediaSpoiler isGeneralSpoiler }
      staff(perPage: 8, sort: [RELEVANCE, ID]) {
        edges { role node { name { full native } } }
      }
    }
  }
}`;

interface RawMedia {
  id?: number;
  title?: { romaji?: string | null; english?: string | null; native?: string | null } | null;
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
      node?: { name?: { full?: string | null; native?: string | null } | null } | null;
    } | null> | null;
  } | null;
}

function cleanDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const stripped = raw
    .replace(/~![\s\S]*?!~/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  const doc = new DOMParser().parseFromString(stripped, 'text/html');
  const text = (doc.body.textContent || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n*\s*(?:\(Source:[^)\n]+\)|\[Written by[^\]]+\])\s*$/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .normalize('NFC');
  if (!text) return null;
  return text.length > 2500 ? `${text.slice(0, 2499).trim()}…` : text;
}

function pickAuthor(media: RawMedia): string | null {
  let fallback: string | null = null;
  for (const edge of media.staff?.edges || []) {
    const name = edge?.node?.name?.full?.trim() || edge?.node?.name?.native?.trim() || '';
    if (!name) continue;
    const role = (edge?.role || '').toLowerCase();
    if (/story|author|original|writer|creator/.test(role)) return name.normalize('NFC');
    if (!/art|illustrat|design/.test(role) && !fallback) fallback = name.normalize('NFC');
  }
  return fallback;
}

function mapTags(media: RawMedia): string[] {
  const out = new Set<string>(['Light Novel']);
  if (media.isAdult) out.add('18+');
  for (const g of media.genres || []) {
    const mapped = g ? TERM_TO_PRESET[g.trim().toLowerCase()] : undefined;
    if (mapped && PRESET_SET.has(mapped)) out.add(mapped);
  }
  for (const t of media.tags || []) {
    if (!t?.name || t.isMediaSpoiler || t.isGeneralSpoiler || Number(t.rank ?? 0) < MIN_TAG_RANK) {
      continue;
    }
    const mapped = TERM_TO_PRESET[t.name.trim().toLowerCase()];
    if (mapped && PRESET_SET.has(mapped)) out.add(mapped);
  }
  return Array.from(out).slice(0, 16);
}

/**
 * Fallback trực tiếp từ trình duyệt Admin tới AniList GraphQL (CORS `ACAO: *`, 0 CDN ảnh ngoài)
 * khi Cloudflare WAF của AniList chặn IP trung tâm dữ liệu của Cloudflare Worker (HTTP 403/502).
 */
export async function searchAniListDirectBrowser(
  query: string,
): Promise<AniListNovelCandidate[]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ANILIST_TIMEOUT_MS);
  try {
    const res = await fetch(ANILIST_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { search: query, perPage: 6 } }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`AniList tạm thời bận (HTTP ${res.status}). Bạn vẫn có thể nhập thủ công.`);
    }
    const json = (await res.json().catch(() => null)) as {
      data?: { Page?: { media?: RawMedia[] | null } | null } | null;
    } | null;
    const items = json?.data?.Page?.media || [];
    const results: AniListNovelCandidate[] = [];
    for (const m of items) {
      if (!m || typeof m.id !== 'number') continue;
      const romaji = m.title?.romaji?.trim().normalize('NFC') || null;
      const english = m.title?.english?.trim().normalize('NFC') || null;
      const native = m.title?.native?.trim().normalize('NFC') || null;
      const seen = new Set<string>();
      const altTitles: string[] = [];
      for (const raw of [romaji, english, native, ...(m.synonyms || [])]) {
        if (typeof raw !== 'string') continue;
        const clean = raw.normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, 180);
        const key = clean.toLocaleLowerCase('vi');
        if (!clean || seen.has(key)) continue;
        seen.add(key);
        altTitles.push(clean);
        if (altTitles.length >= 12) break;
      }
      results.push({
        anilistId: m.id,
        primaryTitle: romaji || english || native || 'Light Novel',
        titles: { romaji, english, native },
        altTitles,
        author: pickAuthor(m),
        description: cleanDescription(m.description),
        mappedTags: mapTags(m),
        volumes: typeof m.volumes === 'number' && m.volumes > 0 ? m.volumes : null,
        year: typeof m.startDate?.year === 'number' && m.startDate.year > 0 ? m.startDate.year : null,
        status: typeof m.status === 'string' ? m.status : null,
      });
    }
    return results;
  } finally {
    window.clearTimeout(timer);
  }
}
