import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { GitBranch, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import type { ShelfGroup, ShelfRelation, ShelfRelationType } from '@/types';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import type { ToastType } from '@/hooks/useToast';
import { deleteShelfRelationApi, saveShelfRelationApi } from '@/lib/catalogApi';
import { normalizeSearchText } from '@/lib/libraryFiltering';
import { getBidirectionalRelationLabel } from '@/lib/shelfRecommendations';

type RelationChoice =
  | 'sequel_out'
  | 'sequel_in'
  | 'spinoff_out'
  | 'spinoff_in'
  | 'same_universe';

const RELATION_CHOICES: Array<{
  id: RelationChoice;
  label: string;
  hint: string;
}> = [
  {
    id: 'sequel_out',
    label: 'Phần tiếp theo',
    hint: 'Bộ được chọn là Phần tiếp theo (Sequel) của bộ hiện tại',
  },
  {
    id: 'sequel_in',
    label: 'Phần trước',
    hint: 'Bộ được chọn là Phần trước (Prequel) của bộ hiện tại',
  },
  {
    id: 'spinoff_out',
    label: 'Ngoại truyện / Spin-off',
    hint: 'Bộ được chọn là Ngoại truyện của bộ hiện tại',
  },
  {
    id: 'spinoff_in',
    label: 'Tuyến chính',
    hint: 'Bộ được chọn là Tuyến chính (Main Story) của ngoại truyện này',
  },
  {
    id: 'same_universe',
    label: 'Cùng vũ trụ',
    hint: 'Chia sẻ chung thế giới quan hoặc nhân vật',
  },
];

export interface ShelfRelationsModalProps {
  open: boolean;
  shelf: ShelfGroup | null;
  allShelves: readonly ShelfGroup[];
  shelfRelations: readonly ShelfRelation[];
  onClose: () => void;
  onRelationSaved: (relation: ShelfRelation) => void;
  onRelationDeleted: (sourceKey: string, targetKey: string) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function ShelfRelationsModal({
  open,
  shelf,
  allShelves,
  shelfRelations,
  onClose,
  onRelationSaved,
  onRelationDeleted,
  onApiError,
  onNotify,
}: ShelfRelationsModalProps) {
  const [query, setQuery] = useState('');
  const [selectedTargetKey, setSelectedTargetKey] = useState('');
  const [choice, setChoice] = useState<RelationChoice>('sequel_out');
  const [busy, setBusy] = useState(false);

  useBodyScrollLock(open && Boolean(shelf));

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedTargetKey('');
    setChoice('sequel_out');
  }, [open, shelf?.key]);

  useEffect(() => {
    if (!open || !shelf) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose, open, shelf]);

  const shelfByKey = useMemo(
    () => new Map(allShelves.map((s) => [s.key, s])),
    [allShelves],
  );

  const currentLinks = useMemo(() => {
    if (!shelf) return [];
    return shelfRelations
      .filter((r) => r.sourceShelfKey === shelf.key || r.targetShelfKey === shelf.key)
      .map((r) => {
        const otherKey = r.sourceShelfKey === shelf.key ? r.targetShelfKey : r.sourceShelfKey;
        return {
          relation: r,
          otherKey,
          otherName: shelfByKey.get(otherKey)?.name || otherKey,
          label: getBidirectionalRelationLabel(r, shelf.key),
        };
      });
  }, [shelf, shelfByKey, shelfRelations]);

  const candidateShelves = useMemo(() => {
    if (!shelf) return [];
    const normQ = normalizeSearchText(query);
    return allShelves.filter((cand) => {
      if (cand.key === shelf.key || cand.key === 'kho chưa phân loại') return false;
      if (!normQ) return true;
      return normalizeSearchText(cand.name).includes(normQ);
    });
  }, [allShelves, query, shelf]);

  if (!open || !shelf || typeof document === 'undefined') return null;

  const handleAdd = async () => {
    const targetShelf = shelfByKey.get(selectedTargetKey);
    if (!targetShelf || busy) return;

    let sourceName = shelf.name;
    let targetName = targetShelf.name;
    let relationType: ShelfRelationType = 'same_universe';

    if (choice === 'sequel_out') {
      relationType = 'sequel';
    } else if (choice === 'sequel_in') {
      sourceName = targetShelf.name;
      targetName = shelf.name;
      relationType = 'sequel';
    } else if (choice === 'spinoff_out') {
      relationType = 'spinoff';
    } else if (choice === 'spinoff_in') {
      sourceName = targetShelf.name;
      targetName = shelf.name;
      relationType = 'spinoff';
    }

    setBusy(true);
    try {
      const saved = await saveShelfRelationApi(sourceName, targetName, relationType);
      onRelationSaved(saved);
      setSelectedTargetKey('');
      onNotify?.(`Đã liên kết "${shelf.name}" với "${targetShelf.name}".`, 'success');
    } catch (err) {
      onApiError?.(err, 'Không thể lưu liên kết bộ truyện.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (otherKey: string, otherName: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteShelfRelationApi(shelf.name, otherName);
      onRelationDeleted(shelf.key, otherKey);
      onNotify?.(`Đã gỡ liên kết với "${otherName}".`, 'info');
    } catch (err) {
      onApiError?.(err, 'Không thể xoá liên kết bộ truyện.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shelf-relations-modal-title"
      onClick={() => {
        if (!busy) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="moonlit-card fade-in flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-crimson-accent">
              LIÊN KẾT VŨ TRỤ &amp; NGOẠI TRUYỆN
            </p>
            <h2
              id="shelf-relations-modal-title"
              className="mt-0.5 truncate font-display text-lg font-semibold text-ink"
            >
              {shelf.name}
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Liên kết 1 lần sẽ tự động hiển thị 2 chiều ở cả hai bộ truyện
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Đóng cửa sổ liên kết bộ truyện"
            className="rounded-lg p-1.5 text-ink-muted transition hover:bg-subtle hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Đang liên kết ({currentLinks.length})
            </h3>
            {currentLinks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line bg-canvas/60 px-3.5 py-4 text-center text-xs text-ink-muted">
                Bộ truyện này chưa có liên kết nào.
              </p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas">
                {currentLinks.map((item) => (
                  <li
                    key={item.otherKey}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="inline-flex items-center gap-1 rounded border border-crimson-accent/35 bg-crimson-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-crimson-accent">
                        <GitBranch className="h-2.5 w-2.5" />
                        {item.label}
                      </span>
                      <p className="mt-1 truncate font-medium text-ink">{item.otherName}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRemove(item.otherKey, item.otherName)}
                      aria-label={`Gỡ liên kết ${item.otherName}`}
                      className="rounded-lg p-1.5 text-ink-muted transition hover:bg-red-500/10 hover:text-red-500 disabled:opacity-45"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-line bg-canvas/70 p-3.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Thêm hoặc cập nhật liên kết mới
            </h3>

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {RELATION_CHOICES.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setChoice(opt.id)}
                  title={opt.hint}
                  className={`rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition ${
                    choice === opt.id
                      ? 'border-accent bg-accent/12 font-semibold text-accent'
                      : 'border-line bg-surface text-ink-muted hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm bộ truyện cần nối..."
                className="w-full rounded-xl border border-line bg-surface py-1.5 pl-9 pr-3 text-xs text-ink outline-none focus:border-accent"
              />
            </div>

            <div className="max-h-40 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-surface">
              {candidateShelves.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-ink-muted">
                  Không có bộ truyện phù hợp để liên kết.
                </p>
              ) : (
                candidateShelves.map((cand) => {
                  const active = selectedTargetKey === cand.key;
                  return (
                    <button
                      key={cand.key}
                      type="button"
                      onClick={() => setSelectedTargetKey(cand.key)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition ${
                        active ? 'bg-accent/12 font-semibold text-accent' : 'text-ink hover:bg-subtle'
                      }`}
                    >
                      <span className="truncate">{cand.name}</span>
                      <span className="shrink-0 text-[11px] text-ink-faint">
                        {cand.books.length} tập
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <button
              type="button"
              disabled={!selectedTargetKey || busy}
              onClick={() => void handleAdd()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition hover:bg-accent-hover disabled:opacity-45"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              <span>Lưu liên kết bộ truyện</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
