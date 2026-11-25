import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Plus, Save, Search, Tag, Wand2, X } from 'lucide-react';
import type { AniListNovelCandidate, ShelfGroup } from '@/types';
import { AniListSuggestPanel } from '@/components/AniListSuggestPanel';
import { ModalShell } from '@/components/ModalShell';
import { setShelfAltTitles } from '@/lib/catalogApi';
import { normalizeClientAltTitles } from '@/lib/shelfPrefs';
import {
  MAX_SHELF_TAGS,
  MAX_SHELF_TAG_LENGTH,
  PRESET_SHELF_TAGS,
  canonicalizeTagLabel,
  setShelfTags,
  toTagLookupKey,
} from '@/lib/shelfTagPresets';
import { normalizeSearchText } from '@/hooks/useLibraryViewState';
import type { ToastType } from '@/hooks/useToast';

export interface ShelfTagsModalProps {
  shelf: ShelfGroup | null;
  currentTags: readonly string[];
  currentAltTitles?: readonly string[];
  allShelfTags?: Readonly<Record<string, string[]>>;
  onClose: () => void;
  onTagsSaved: (shelfName: string, tags: string[]) => void;
  onAltTitlesSaved?: (shelfName: string, altTitles: string[]) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function ShelfTagsModal({
  shelf,
  currentTags,
  currentAltTitles = [],
  allShelfTags,
  onClose,
  onTagsSaved,
  onAltTitlesSaved,
  onApiError,
  onNotify,
}: ShelfTagsModalProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [stagedAltTitles, setStagedAltTitles] = useState<string[] | null>(null);
  const [anilistOpen, setAnilistOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [saving, setSaving] = useState(false);
  const currentTagsRef = useRef(currentTags);
  currentTagsRef.current = currentTags;
  const shelfKey = shelf?.key ?? null;

  useEffect(() => {
    if (!shelfKey) return;
    setSelectedTags(currentTagsRef.current.map(canonicalizeTagLabel).filter(Boolean));
    setStagedAltTitles(null);
    setAnilistOpen(false);
    setFilterQuery('');
    setCustomInput('');
    setSaving(false);
  }, [shelfKey]);

  const selectedKeys = useMemo(
    () => new Set(selectedTags.map(toTagLookupKey)),
    [selectedTags],
  );

  const allChoices = useMemo(() => {
    const map = new Map<string, string>();
    for (const preset of PRESET_SHELF_TAGS) {
      map.set(toTagLookupKey(preset), preset);
    }
    if (allShelfTags) {
      for (const tags of Object.values(allShelfTags)) {
        for (const raw of tags) {
          const clean = canonicalizeTagLabel(raw);
          if (clean && !map.has(toTagLookupKey(clean))) {
            map.set(toTagLookupKey(clean), clean);
          }
        }
      }
    }
    for (const tag of selectedTags) {
      const clean = canonicalizeTagLabel(tag);
      if (clean && !map.has(toTagLookupKey(clean))) {
        map.set(toTagLookupKey(clean), clean);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base' }),
    );
  }, [allShelfTags, selectedTags]);

  const normalizedFilter = useMemo(() => normalizeSearchText(filterQuery), [filterQuery]);
  const visibleChoices = useMemo(() => {
    if (!normalizedFilter) return allChoices;
    return allChoices.filter((label) => normalizeSearchText(label).includes(normalizedFilter));
  }, [allChoices, normalizedFilter]);

  if (!shelf) return null;

  const toggleTag = (label: string) => {
    const key = toTagLookupKey(label);
    if (selectedKeys.has(key)) {
      setSelectedTags((prev) => prev.filter((item) => toTagLookupKey(item) !== key));
      return;
    }
    if (selectedTags.length >= MAX_SHELF_TAGS) {
      onNotify?.(`Mỗi bộ truyện tối đa ${MAX_SHELF_TAGS} thể loại.`, 'warning');
      return;
    }
    setSelectedTags((prev) => [...prev, label]);
  };

  const handleAddCustomTag = () => {
    const clean = canonicalizeTagLabel(customInput);
    if (!clean) return;
    const key = toTagLookupKey(clean);
    if (selectedKeys.has(key)) {
      setCustomInput('');
      return;
    }
    if (selectedTags.length >= MAX_SHELF_TAGS) {
      onNotify?.(`Mỗi bộ truyện tối đa ${MAX_SHELF_TAGS} thể loại.`, 'warning');
      return;
    }
    setSelectedTags((prev) => [...prev, clean]);
    setCustomInput('');
  };

  const handleApplyAniListTags = (
    candidate: AniListNovelCandidate,
    options?: { includeAltTitles?: boolean },
  ) => {
    setSelectedTags((prev) => {
      const seen = new Set(prev.map(toTagLookupKey));
      const merged = [...prev];
      for (const raw of candidate.mappedTags) {
        const clean = canonicalizeTagLabel(raw);
        const key = toTagLookupKey(clean);
        if (clean && !seen.has(key) && merged.length < MAX_SHELF_TAGS) {
          seen.add(key);
          merged.push(clean);
        }
      }
      return merged;
    });
    if (options?.includeAltTitles && candidate.altTitles.length > 0) {
      setStagedAltTitles(normalizeClientAltTitles([...currentAltTitles, ...candidate.altTitles]));
    }
    setAnilistOpen(false);
    onNotify?.(`Đã gắn gợi ý thể loại từ "${candidate.primaryTitle}" — bấm Lưu thể loại để xác nhận.`, 'info');
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await setShelfTags(shelf.name, selectedTags);
      onTagsSaved(shelf.name, saved);
      if (stagedAltTitles && onAltTitlesSaved) {
        const savedAlt = await setShelfAltTitles(shelf.name, stagedAltTitles);
        onAltTitlesSaved(shelf.name, savedAlt);
      }
      onNotify?.(
        saved.length > 0
          ? `Đã lưu ${saved.length} thể loại cho "${shelf.name}".`
          : `Đã xoá toàn bộ thể loại của "${shelf.name}".`,
        'success',
      );
      onClose();
    } catch (err) {
      onApiError?.(err, 'Không thể lưu thể loại cho bộ truyện.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      closeDisabled={saving}
      ariaLabelledBy="shelf-tags-modal-title"
      zIndexClass="z-50"
      backdropClassName="items-center justify-center p-3 sm:p-4"
      panelClassName="moonlit-card fade-in flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
    >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
              <Tag className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="shelf-tags-modal-title"
                className="truncate font-display text-lg font-semibold text-ink"
              >
                Gắn thể loại bộ truyện
              </h2>
              <p title={shelf.name} className="mt-0.5 truncate text-xs text-ink-muted">
                {shelf.name} ·{' '}
                <strong className="text-ink">
                  {selectedTags.length}/{MAX_SHELF_TAGS}
                </strong>{' '}
                thể loại
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setAnilistOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                anilistOpen
                  ? 'border-crimson-accent bg-crimson-accent/12 text-crimson-accent'
                  : 'border-crimson-accent/40 bg-canvas text-crimson-accent hover:bg-crimson-accent/10'
              }`}
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span>Gợi ý từ AniList</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label="Đóng cửa sổ thể loại"
              className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-b border-line bg-canvas/50 px-5 py-3">
          {selectedTags.length === 0 ? (
            <p className="text-xs text-ink-faint">
              Chưa chọn thể loại nào — tích chọn bên dưới, bấm Gợi ý từ AniList hoặc tự nhập thêm.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {selectedTags.map((tag) => (
                <button
                  key={toTagLookupKey(tag)}
                  type="button"
                  disabled={saving}
                  onClick={() => toggleTag(tag)}
                  className="inline-flex items-center gap-1 rounded-lg border border-crimson-accent/40 bg-crimson-accent/10 px-2.5 py-1 text-xs font-medium text-crimson-accent transition-colors hover:bg-crimson-accent/20"
                >
                  <span>{tag}</span>
                  <X className="h-3 w-3" />
                </button>
              ))}
              <button
                type="button"
                disabled={saving}
                onClick={() => setSelectedTags([])}
                className="ml-auto rounded-lg px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
              >
                Xoá hết
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-2.5 border-b border-line px-5 py-3 sm:grid-cols-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Tìm nhanh trong danh sách thể loại..."
              aria-label="Tìm nhanh thể loại"
              className="w-full rounded-xl border border-line bg-canvas py-2 pl-9 pr-8 text-xs text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent"
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                aria-label="Xoá từ khoá lọc thể loại"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-faint hover:bg-subtle hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              maxLength={MAX_SHELF_TAG_LENGTH}
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomTag();
                }
              }}
              placeholder="Thêm thể loại tự tạo..."
              aria-label="Thêm thể loại tự tạo"
              className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent"
            />
            <button
              type="button"
              disabled={saving || !customInput.trim()}
              onClick={handleAddCustomTag}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-line bg-canvas px-3 py-2 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle disabled:opacity-45"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Thêm</span>
            </button>
          </div>
        </div>

        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {anilistOpen && (
            <AniListSuggestPanel
              initialQuery={currentAltTitles[0] || shelf.name}
              mode="tags-only"
              disabled={saving}
              defaultIncludeAltTitlesInTagsMode={currentAltTitles.length === 0}
              onApplyCandidate={handleApplyAniListTags}
              onClose={() => setAnilistOpen(false)}
              onApiError={onApiError}
              onNotify={onNotify}
            />
          )}

          {visibleChoices.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-muted">
              Không có thể loại sẵn nào khớp &ldquo;{filterQuery}&rdquo;. Bạn có thể nhập ở ô
              &ldquo;Thêm thể loại tự tạo&rdquo;.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {visibleChoices.map((label) => {
                const checked = selectedKeys.has(toTagLookupKey(label));
                return (
                  <button
                    key={toTagLookupKey(label)}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    disabled={saving}
                    onClick={() => toggleTag(label)}
                    className={`flex items-start gap-2 rounded-xl border px-2.5 py-2 text-left text-xs leading-snug transition-colors ${
                      checked
                        ? 'border-crimson-accent/55 bg-crimson-accent/10 font-medium text-ink'
                        : 'border-line bg-canvas/60 text-ink-muted hover:border-line-strong hover:bg-subtle hover:text-ink'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        checked
                          ? 'border-crimson-accent bg-crimson-accent text-white'
                          : 'border-line-strong bg-surface'
                      }`}
                    >
                      {checked && <Check className="h-3 w-3 stroke-[2.75]" />}
                    </span>
                    <span className="min-w-0 break-words">{label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink disabled:opacity-45"
          >
            Huỷ
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all hover:bg-accent-hover disabled:opacity-45"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Đang lưu...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Lưu thể loại</span>
              </>
            )}
          </button>
        </div>
    </ModalShell>
  );
}
