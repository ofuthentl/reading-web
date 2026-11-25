import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Search, Sparkles, Wand2, X } from 'lucide-react';
import type { AniListNovelCandidate } from '@/types';
import { isAuthError } from '@/lib/authSession';
import { searchAniListLightNovelsApi } from '@/lib/catalogApi';
import type { ToastType } from '@/hooks/useToast';

export interface AniListSuggestPanelProps {
  initialQuery: string;
  mode: 'full' | 'tags-only';
  disabled?: boolean;
  defaultIncludeAltTitlesInTagsMode?: boolean;
  onApplyCandidate: (
    candidate: AniListNovelCandidate,
    options?: { includeAltTitles?: boolean },
  ) => void;
  onQuickSaveAll?: (candidate: AniListNovelCandidate) => void;
  onClose: () => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function AniListSuggestPanel({
  initialQuery,
  mode,
  disabled = false,
  defaultIncludeAltTitlesInTagsMode = true,
  onApplyCandidate,
  onQuickSaveAll,
  onClose,
  onApiError,
  onNotify,
}: AniListSuggestPanelProps) {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<AniListNovelCandidate[]>([]);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [includeAltInTags, setIncludeAltInTags] = useState(defaultIncludeAltTitlesInTagsMode);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const initialSearchDoneRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const runSearch = useCallback(
    async (rawTerm: string) => {
      const term = rawTerm.trim();
      if (term.length < 2) {
        setErrorText('Nhập ít nhất 2 ký tự (tên Romaji, tiếng Anh hoặc Nhật) để tìm trên AniList.');
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setErrorText(null);
      setSearchedOnce(true);
      try {
        const list = await searchAniListLightNovelsApi(term, controller.signal);
        if (controller.signal.aborted || !mountedRef.current) return;
        setCandidates(list);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (isAuthError(err)) {
          onApiError?.(err, 'Phiên đăng nhập đã hết hạn.');
          return;
        }
        if (!mountedRef.current) return;
        const msg =
          err instanceof Error
            ? err.message
            : 'AniList tạm thời không phản hồi. Bạn vẫn có thể nhập thủ công.';
        setErrorText(msg);
        onNotify?.(msg, 'warning');
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (!controller.signal.aborted && mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [onApiError, onNotify],
  );

  useEffect(() => {
    if (initialSearchDoneRef.current) return;
    initialSearchDoneRef.current = true;
    const trimmed = initialQuery.trim();
    if (trimmed.length >= 2) {
      void runSearch(trimmed);
    }
  }, [initialQuery, runSearch]);

  return (
    <div className="space-y-3 rounded-2xl border border-crimson-accent/35 bg-canvas/90 p-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-crimson-accent">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span>Gợi ý Light Novel từ AniList (0 CDN ảnh ngoài)</span>
        </div>
        <button
          type="button"
          disabled={disabled || loading}
          onClick={onClose}
          aria-label="Đóng bảng gợi ý AniList"
          className="rounded-lg p-1 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            value={query}
            disabled={disabled || loading}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runSearch(query);
              }
            }}
            placeholder="Nhập tên Romaji, tiếng Anh hoặc tiếng Nhật (vd: Mushoku Tensei, Oregairu, 86)..."
            aria-label="Từ khoá tìm kiếm Light Novel trên AniList"
            className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent"
          />
        </div>
        <button
          type="button"
          disabled={disabled || loading || query.trim().length < 2}
          onClick={() => void runSearch(query)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-45"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          <span>Tìm</span>
        </button>
      </div>

      {mode === 'tags-only' && (
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={includeAltInTags}
            disabled={disabled}
            onChange={(e) => setIncludeAltInTags(e.target.checked)}
            className="h-3.5 w-3.5 rounded accent-current"
          />
          <span>Lưu kèm danh sách Tên gọi khác (Romaji / Anh / Nhật) khi bấm Lưu thể loại</span>
        </label>
      )}

      {errorText && (
        <p className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          {errorText}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          <span>Đang tìm Light Novel trên AniList (timeout an toàn 6 giây)...</span>
        </div>
      ) : candidates.length === 0 && searchedOnce && !errorText ? (
        <p className="rounded-xl border border-line bg-surface px-3.5 py-4 text-center text-xs text-ink-muted">
          Chưa thấy Light Novel khớp từ khoá này. Nếu tên kệ là tiếng Việt, hãy thử gõ tên tiếng Anh
          hoặc Romaji (ví dụ: <strong>Otonari no Tenshi</strong>, <strong>Eighty Six</strong>).
        </p>
      ) : (
        candidates.length > 0 && (
          <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1 scrollbar-thin">
            {candidates.map((item) => (
              <div
                key={item.anilistId}
                className="space-y-2 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-line-strong"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-display text-sm font-semibold leading-snug text-ink">
                      {item.primaryTitle}
                    </p>
                    {item.titles.english && item.titles.english !== item.primaryTitle && (
                      <p className="truncate text-xs text-ink-muted">{item.titles.english}</p>
                    )}
                    {item.titles.native && (
                      <p className="truncate text-[11px] text-ink-faint">{item.titles.native}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1 text-[10.5px] text-ink-muted">
                    {item.year && (
                      <span className="rounded-md border border-line bg-canvas px-1.5 py-0.5 tabular-nums">
                        {item.year}
                      </span>
                    )}
                    {item.volumes && (
                      <span className="rounded-md border border-line bg-canvas px-1.5 py-0.5 tabular-nums">
                        {item.volumes} vol
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
                  {item.author && (
                    <span>
                      Tác giả: <strong className="text-ink">{item.author}</strong>
                    </span>
                  )}
                  {item.altTitles.length > 0 && (
                    <span>
                      Tên khác: <strong className="text-ink">{item.altTitles.length}</strong> tên
                    </span>
                  )}
                </div>

                {item.mappedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.mappedTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md border border-crimson-accent/30 bg-crimson-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-crimson-accent"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {item.description && (
                  <p className="line-clamp-2 text-[11.5px] leading-relaxed text-ink-muted">
                    {item.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onApplyCandidate(item, { includeAltTitles: includeAltInTags })
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-subtle disabled:opacity-45"
                  >
                    <Check className="h-3.5 w-3.5 text-accent" />
                    <span>
                      {mode === 'tags-only'
                        ? `Gắn ${item.mappedTags.length} thể loại`
                        : 'Điền vào biểu mẫu'}
                    </span>
                  </button>

                  {mode === 'full' && onQuickSaveAll && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onQuickSaveAll(item)}
                      className="inline-flex items-center gap-1 rounded-lg bg-crimson-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-45"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      <span>Áp dụng &amp; Lưu trọn bộ</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
