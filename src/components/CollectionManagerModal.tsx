import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  FolderKanban,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { CustomCollection, ShelfGroup } from '@/types';
import { ModalShell } from '@/components/ModalShell';
import { isAuthError } from '@/lib/authSession';
import {
  createCustomCollection,
  deleteCustomCollection,
  updateCustomCollection,
} from '@/lib/catalogApi';
import { toShelfPrefKey } from '@/lib/shelfPrefs';
import { normalizeSearchText } from '@/hooks/useLibraryViewState';
import type { ToastType } from '@/hooks/useToast';

export interface CollectionManagerModalProps {
  open: boolean;
  collections: readonly CustomCollection[];
  allShelves: readonly ShelfGroup[];
  onClose: () => void;
  onCollectionSaved: (collection: CustomCollection) => void;
  onCollectionDeleted: (collectionId: string) => void;
  onApiError?: (err: unknown, fallbackMessage: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function CollectionManagerModal({
  open,
  collections,
  allShelves,
  onClose,
  onCollectionSaved,
  onCollectionDeleted,
  onApiError,
  onNotify,
}: CollectionManagerModalProps) {
  const [editingId, setEditingId] = useState<string | 'new'>('new');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [selectedShelfKeys, setSelectedShelfKeys] = useState<Set<string>>(() => new Set());
  const [shelfSearch, setShelfSearch] = useState('');
  const [onlySelectedShelves, setOnlySelectedShelves] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const collectionsRef = useRef(collections);
  collectionsRef.current = collections;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadCollectionIntoEditor = useCallback((target: CustomCollection | null) => {
    if (!target) {
      setEditingId('new');
      setName('');
      setDescription('');
      setSortOrder(collectionsRef.current.length * 10);
      setSelectedShelfKeys(new Set());
      setOnlySelectedShelves(false);
      return;
    }
    setEditingId(target.id);
    setName(target.name);
    setDescription(target.description ?? '');
    setSortOrder(target.sortOrder);
    setSelectedShelfKeys(new Set(target.shelfKeys.map(toShelfPrefKey)));
    setOnlySelectedShelves(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (collectionsRef.current.length > 0) {
      loadCollectionIntoEditor(collectionsRef.current[0]);
    } else {
      loadCollectionIntoEditor(null);
    }
    setShelfSearch('');
    setSaving(false);
    setDeletingId(null);
  }, [loadCollectionIntoEditor, open]);

  const normalizedQuery = useMemo(() => normalizeSearchText(shelfSearch), [shelfSearch]);
  const visibleShelves = useMemo(() => {
    return allShelves.filter((shelf) => {
      if (onlySelectedShelves && !selectedShelfKeys.has(shelf.key)) return false;
      if (!normalizedQuery) return true;
      return normalizeSearchText(shelf.name).includes(normalizedQuery);
    });
  }, [allShelves, normalizedQuery, onlySelectedShelves, selectedShelfKeys]);

  if (!open) return null;

  const toggleShelfInCollection = (shelfKey: string) => {
    setSelectedShelfKeys((prev) => {
      const next = new Set(prev);
      if (next.has(shelfKey)) next.delete(shelfKey);
      else next.add(shelfKey);
      return next;
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || deletingId) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      onNotify?.('Vui lòng nhập tên tuyển tập.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        description: description.trim() || null,
        sortOrder,
        shelfKeys: Array.from(selectedShelfKeys),
      };
      const saved =
        editingId === 'new'
          ? await createCustomCollection(payload)
          : await updateCustomCollection(editingId, payload);
      if (!mountedRef.current) return;
      onCollectionSaved(saved);
      setEditingId(saved.id);
      onNotify?.(
        editingId === 'new'
          ? `Đã tạo tuyển tập "${saved.name}" (${saved.shelfKeys.length} kệ).`
          : `Đã cập nhật tuyển tập "${saved.name}".`,
        'success',
      );
    } catch (err) {
      if (mountedRef.current || isAuthError(err)) {
        onApiError?.(err, 'Không thể lưu tuyển tập.');
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const handleDelete = async (col: CustomCollection) => {
    if (saving || deletingId) return;
    setDeletingId(col.id);
    try {
      await deleteCustomCollection(col.id);
      if (!mountedRef.current) return;
      onCollectionDeleted(col.id);
      onNotify?.(`Đã xoá tuyển tập "${col.name}".`, 'info');
      if (editingId === col.id) {
        const remaining = collectionsRef.current.filter((item) => item.id !== col.id);
        loadCollectionIntoEditor(remaining[0] ?? null);
      }
    } catch (err) {
      if (mountedRef.current || isAuthError(err)) {
        onApiError?.(err, 'Không thể xoá tuyển tập.');
      }
    } finally {
      if (mountedRef.current) setDeletingId(null);
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      closeDisabled={saving || Boolean(deletingId)}
      ariaLabelledBy="collection-manager-title"
      zIndexClass="z-50"
      backdropClassName="items-center justify-center p-3 sm:p-4"
      panelClassName="moonlit-card fade-in flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
    >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
              <FolderKanban className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="collection-manager-title"
                className="font-display text-lg font-semibold text-ink"
              >
                Quản lý Bộ sưu tập (Tuyển tập)
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Tạo danh mục chủ đề riêng và gán các bộ truyện vào tuyển tập (tự ẩn kệ giới hạn với
                khách không có quyền).
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={saving || Boolean(deletingId)}
            onClick={onClose}
            aria-label="Đóng cửa sổ quản lý tuyển tập"
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 divide-y divide-line md:grid-cols-[250px_1fr] md:divide-x md:divide-y-0">
          {/* Cột trái: Danh sách tuyển tập */}
          <div className="flex max-h-48 flex-col bg-canvas/50 p-3.5 md:max-h-none">
            <button
              type="button"
              disabled={saving || Boolean(deletingId)}
              onClick={() => loadCollectionIntoEditor(null)}
              className={`mb-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                editingId === 'new'
                  ? 'border-accent bg-accent text-accent-foreground shadow-sm'
                  : 'border-line-strong bg-surface text-ink hover:bg-subtle'
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Tạo tuyển tập mới</span>
            </button>

            <div className="flex-1 space-y-1.5 overflow-y-auto pr-0.5 scrollbar-thin">
              {collections.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-faint">
                  Chưa có tuyển tập nào. Điền thông tin bên phải để tạo mới.
                </p>
              ) : (
                collections.map((col) => {
                  const selected = editingId === col.id;
                  const isDeleting = deletingId === col.id;
                  return (
                    <div
                      key={col.id}
                      className={`flex items-center justify-between gap-1.5 rounded-xl border px-2.5 py-2 text-xs transition-colors ${
                        selected
                          ? 'border-crimson-accent/55 bg-crimson-accent/10 text-ink'
                          : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={saving || Boolean(deletingId)}
                        onClick={() => loadCollectionIntoEditor(col)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <Pencil className="h-3 w-3 shrink-0 opacity-70" />
                        <span className="truncate font-medium">{col.name}</span>
                        <span className="ml-auto shrink-0 rounded-full bg-subtle px-1.5 py-0.5 text-[10px] tabular-nums text-ink-muted">
                          {col.shelfKeys.length}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={saving || Boolean(deletingId)}
                        onClick={() => void handleDelete(col)}
                        aria-label={`Xoá tuyển tập ${col.name}`}
                        title="Xoá tuyển tập này"
                        className="shrink-0 rounded-md p-1 text-ink-faint transition-colors hover:bg-rose-500/15 hover:text-rose-600 disabled:opacity-40"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Cột phải: Biểu mẫu sửa & gán kệ */}
          <form onSubmit={(e) => void handleSave(e)} className="flex min-h-0 flex-col">
            <div className="flex-1 space-y-3.5 overflow-y-auto p-4 scrollbar-thin sm:p-5">
              <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
                <div className="space-y-1">
                  <label htmlFor="col-name-input" className="block text-xs font-semibold text-ink">
                    Tên tuyển tập *
                  </label>
                  <input
                    id="col-name-input"
                    type="text"
                    maxLength={80}
                    required
                    value={name}
                    disabled={saving}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ví dụ: Kinh điển Isekai, Trinh thám Học đường..."
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="col-order-input" className="block text-xs font-semibold text-ink">
                    Thứ tự
                  </label>
                  <input
                    id="col-order-input"
                    type="number"
                    value={sortOrder}
                    disabled={saving}
                    onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm tabular-nums text-ink outline-none transition-colors focus:border-accent"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="col-desc-input" className="block text-xs font-semibold text-ink">
                  Mô tả ngắn (tuỳ chọn)
                </label>
                <input
                  id="col-desc-input"
                  type="text"
                  maxLength={300}
                  value={description}
                  disabled={saving}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Gợi ý ngắn hiện dưới thanh lọc khi bạn đọc chọn tuyển tập này..."
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent"
                />
              </div>

              <div className="space-y-2.5 border-t border-line pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink">
                    Chọn các bộ truyện ({selectedShelfKeys.size} kệ đã gắn)
                  </span>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      checked={onlySelectedShelves}
                      onChange={(e) => setOnlySelectedShelves(e.target.checked)}
                      className="h-3.5 w-3.5 rounded accent-current"
                    />
                    <span>Chỉ hiện kệ đã chọn</span>
                  </label>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
                  <input
                    type="text"
                    value={shelfSearch}
                    onChange={(e) => setShelfSearch(e.target.value)}
                    placeholder="Tìm nhanh tên bộ truyện để tick vào tuyển tập..."
                    className="w-full rounded-xl border border-line bg-canvas py-2 pl-9 pr-8 text-xs text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-accent"
                  />
                  {shelfSearch && (
                    <button
                      type="button"
                      onClick={() => setShelfSearch('')}
                      aria-label="Xoá tìm kiếm kệ"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-faint hover:bg-subtle hover:text-ink"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto pr-1 scrollbar-thin sm:grid-cols-2">
                  {visibleShelves.length === 0 ? (
                    <p className="col-span-full py-6 text-center text-xs text-ink-muted">
                      Không có bộ truyện nào khớp điều kiện lọc.
                    </p>
                  ) : (
                    visibleShelves.map((shelf) => {
                      const checked = selectedShelfKeys.has(shelf.key);
                      return (
                        <button
                          key={shelf.key}
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          disabled={saving}
                          onClick={() => toggleShelfInCollection(shelf.key)}
                          className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition-colors ${
                            checked
                              ? 'border-crimson-accent/55 bg-crimson-accent/10 font-medium text-ink'
                              : 'border-line bg-canvas/70 text-ink-muted hover:border-line-strong hover:text-ink'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              checked
                                ? 'border-crimson-accent bg-crimson-accent text-white'
                                : 'border-line-strong bg-surface'
                            }`}
                          >
                            {checked && <Check className="h-3 w-3 stroke-[2.75]" />}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{shelf.name}</span>
                          <span className="shrink-0 text-[10.5px] tabular-nums text-ink-faint">
                            {shelf.books.length} tập
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3.5">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink disabled:opacity-45"
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim()}
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
                    <span>{editingId === 'new' ? 'Tạo tuyển tập' : 'Lưu thay đổi'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
    </ModalShell>
  );
}
