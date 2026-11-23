import type { ShelfGroup } from '@/types';
import { MAX_SHELF_NAME_LENGTH, apiFetch, assertApiConfigured, isCloudMode } from '@/lib/api';
import {
  normalizeClientShelfTags,
  patchShelfTags,
  readLocalShelfPrefs,
  writeLocalShelfPrefs,
} from '@/lib/shelfPrefs';

export const MAX_SHELF_TAGS = 20;
export const MAX_SHELF_TAG_LENGTH = 40;

/**
 * 64 thể loại chuẩn Light Novel (theo bộ phân loại phổ biến).
 * Module này chỉ được import trong các chunk nạp lười (`AdvancedSearchPanel`, `ShelfTagsModal`)
 * để không làm phình gói entry `index-*.js` (D-013).
 */
export const PRESET_SHELF_TAGS = [
  'Action',
  'Adapted to Anime',
  'Adapted to Drama CD',
  'Adapted to Manga',
  'Adapted to Manhua',
  'Adapted to Manhwa',
  'Adventure',
  'Age Gap',
  'Boys Love',
  'Character Growth',
  'Chinese Novel',
  'Comedy',
  'Cooking',
  'Different Social Status',
  'Drama',
  'Ecchi',
  'English Novel',
  'Fanfiction',
  'Fantasy',
  'Female Protagonist',
  'Game',
  'Gender Bender',
  'Harem',
  'Historical',
  'Horror',
  'Isekai',
  'Josei',
  'Korean Novel',
  'Magic',
  'Martial Arts',
  'Mecha',
  'Military',
  'Misunderstanding',
  'Mystery',
  'Netorare',
  'Obsession',
  'One shot',
  'Otome Game',
  'Parody',
  'Psychological',
  'Reverse Harem',
  'Romance',
  'Satire',
  'School Life',
  'Science Fiction',
  'Seinen',
  'Shoujo',
  'Shoujo ai',
  'Shounen',
  'Shounen ai',
  'Slice of Life',
  'Slow Life',
  'Sports',
  'Super Power',
  'Supernatural',
  'Suspense',
  'Tragedy',
  'Wars',
  'Web Novel',
  'Workplace',
  'Wuxia',
  'Xianxia',
  'Yandere',
  'Yuri',
] as const;

export function toTagLookupKey(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

const PRESET_BY_KEY = new Map<string, string>(
  PRESET_SHELF_TAGS.map((label) => [toTagLookupKey(label), label]),
);

/**
 * Chuẩn hoá nhãn tag: nếu khớp 1 trong 64 thể loại chuẩn thì trả về đúng chữ hoa/thường chuẩn.
 */
export function canonicalizeTagLabel(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_SHELF_TAG_LENGTH).trim();
  if (!cleaned) return '';
  return PRESET_BY_KEY.get(toTagLookupKey(cleaned)) ?? cleaned;
}

export interface TagCatalogItem {
  key: string;
  label: string;
  count: number;
  isCustom: boolean;
}

/**
 * Tổng hợp danh mục đầy đủ 64 thể loại chuẩn + mọi tag tuỳ chỉnh đang gắn trên các kệ,
 * kèm số lượng bộ truyện đang mang từng thể loại.
 */
export function buildTagCatalogWithCounts(
  allShelves: readonly ShelfGroup[],
  shelfTags?: Readonly<Record<string, string[]>>,
): TagCatalogItem[] {
  const map = new Map<string, TagCatalogItem>();
  for (const label of PRESET_SHELF_TAGS) {
    const key = toTagLookupKey(label);
    map.set(key, { key, label, count: 0, isCustom: false });
  }

  if (shelfTags) {
    for (const shelf of allShelves) {
      const tags = shelfTags[shelf.key];
      if (!tags || tags.length === 0) continue;
      const seenInShelf = new Set<string>();
      for (const rawTag of tags) {
        const label = canonicalizeTagLabel(rawTag);
        if (!label) continue;
        const key = toTagLookupKey(label);
        if (seenInShelf.has(key)) continue;
        seenInShelf.add(key);
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(key, { key, label, count: 1, isCustom: true });
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }),
  );
}

export async function setShelfTags(shelfName: string, tags: readonly string[]): Promise<string[]> {
  assertApiConfigured();
  const trimmed = shelfName.trim();
  if (!trimmed || trimmed.length > MAX_SHELF_NAME_LENGTH) {
    throw new Error(`Tên kệ sách không hợp lệ (tối đa ${MAX_SHELF_NAME_LENGTH} ký tự).`);
  }
  const normalized = normalizeClientShelfTags(tags);
  writeLocalShelfPrefs(patchShelfTags(readLocalShelfPrefs(), trimmed, normalized));
  if (!isCloudMode) return normalized;

  const res = await apiFetch('/api/shelves/tags', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shelfName: trimmed, tags: normalized }),
  });
  const data = (await res.json().catch(() => ({}))) as { tags?: string[]; error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Không thể lưu thể loại cho bộ truyện.');
  }
  return Array.isArray(data.tags) ? data.tags : normalized;
}
