import { useEffect, useState } from 'react';
import { Check, Highlighter, Trash2, X } from 'lucide-react';
import type { BookHighlight, HighlightColor } from '@/types';
import type { SelectionHighlightDraft } from '@/lib/domHighlights';
import {
  HIGHLIGHT_COLOR_OPTIONS,
  type VisibleGuestParagraphOption,
} from '@/lib/highlightsApi';
import type { ReaderThemePalette } from '@/lib/readerConfig';

export interface ReaderHighlightPopoverProps {
  draft: SelectionHighlightDraft | null;
  editing: { highlight: BookHighlight; anchorX: number; anchorY: number } | null;
  palette: ReaderThemePalette;
  saving?: boolean;
  onSaveDraft: (color: HighlightColor, note: string) => void;
  onUpdateExisting: (id: string, color: HighlightColor, note: string) => void;
  onDeleteExisting: (id: string) => void;
  onClose: () => void;
}

export function ReaderHighlightPopover({
  draft,
  editing,
  palette,
  saving = false,
  onSaveDraft,
  onUpdateExisting,
  onDeleteExisting,
  onClose,
}: ReaderHighlightPopoverProps) {
  const isOpen = Boolean(draft || editing);
  const [color, setColor] = useState<HighlightColor>('amber');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (editing) {
      setColor(editing.highlight.color);
      setNote(editing.highlight.note || '');
    } else if (draft) {
      setColor('amber');
      setNote('');
    }
  }, [draft, editing]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);

  const activeAnchor = draft
    ? { x: draft.anchorX, y: draft.anchorY }
    : editing
      ? { x: editing.anchorX, y: editing.anchorY }
      : null;

  if (!activeAnchor) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const isMobile = vw < 640;
  // Trên Mobile iOS: nếu người dùng bôi chữ ở nửa dưới màn hình, lật popover lên đỉnh để không che chữ & tay nắm chọn
  const mobilePlaceTop = isMobile && activeAnchor.y > vh * 0.45;

  const cardW = Math.min(340, vw - 24);
  const clampedLeft = Math.max(12, Math.min(vw - cardW - 12, activeAnchor.x - cardW / 2));
  const placeBelow = activeAnchor.y < 190;
  const desktopTop = placeBelow
    ? Math.min(vh - 210, activeAnchor.y + 28)
    : Math.max(56, activeAnchor.y - 12);

  return (
    <div className="fixed inset-0 z-[58]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={editing ? 'Chỉnh sửa bôi màu' : 'Bôi màu đoạn chọn'}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={
          isMobile
            ? undefined
            : {
                left: `${clampedLeft}px`,
                top: `${desktopTop}px`,
                width: `${cardW}px`,
                transform: placeBelow ? undefined : 'translateY(-100%)',
              }
        }
        className={`fade-in select-none border shadow-2xl ${palette.panelBg} ${palette.border} ${
          isMobile
            ? mobilePlaceTop
              ? 'fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-2xl p-3.5'
              : 'fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] rounded-2xl p-3.5'
            : 'fixed rounded-2xl p-3'
        }`}
      >
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
            <Highlighter className={`h-3.5 w-3.5 ${palette.accentText}`} />
            <span>{editing ? 'Sửa trích dẫn bôi màu' : 'Bôi màu & Lưu trích dẫn'}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng bôi màu"
            className={`rounded-lg p-1 transition ${palette.hover}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mb-2.5 flex items-center justify-between gap-1.5">
          {HIGHLIGHT_COLOR_OPTIONS.map((opt) => {
            const active = color === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={saving}
                title={opt.label}
                aria-label={opt.label}
                onClick={() => {
                  setColor(opt.id);
                  if (draft && !note.trim()) {
                    onSaveDraft(opt.id, '');
                  }
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-1.5 text-[11px] font-medium transition ${
                  active ? palette.active : `${palette.border} ${palette.hover}`
                }`}
              >
                <span className={`h-3 w-3 rounded-full border ${opt.swatchClass}`} />
                <span>{opt.shortLabel}</span>
              </button>
            );
          })}
        </div>

        <input
          type="text"
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Thêm ghi chú cảm nghĩ (tuỳ chọn)..."
          className={`mb-2.5 w-full select-text rounded-xl border bg-transparent px-2.5 py-1.5 text-xs outline-none ${palette.border} ${palette.focusBorder}`}
        />

        <div className="flex items-center justify-between gap-2">
          {editing ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => onDeleteExisting(editing.highlight.id)}
              className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium transition ${palette.dangerButton}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Xoá</span>
            </button>
          ) : (
            <span className={`text-[10.5px] ${palette.textSecondary}`}>
              Bấm màu để lưu nhanh 1 chạm
            </span>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (editing) onUpdateExisting(editing.highlight.id, color, note);
              else if (draft) onSaveDraft(color, note);
            }}
            className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${palette.accentBg} ${palette.accentFg}`}
          >
            <Check className="h-3.5 w-3.5" />
            <span>{editing ? 'Cập nhật' : 'Lưu trích dẫn'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function GuestParagraphHighlightModal({
  open,
  options,
  palette,
  saving = false,
  onSaveParagraph,
  onDeleteExisting,
  onClose,
}: {
  open: boolean;
  options: readonly VisibleGuestParagraphOption[];
  palette: ReaderThemePalette;
  saving?: boolean;
  onSaveParagraph: (blockIndex: number, quoteText: string, color: HighlightColor, note: string) => void;
  onDeleteExisting: (highlightId: string) => void;
  onClose: () => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [color, setColor] = useState<HighlightColor>('amber');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedIdx(0);
    const firstExisting = options[0]?.existingHighlight;
    setColor(firstExisting?.color ?? 'amber');
    setNote(firstExisting?.note ?? '');
  }, [open, options]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, open]);

  if (!open) return null;

  const picked = options[selectedIdx] ?? options[0] ?? null;
  const allowInputClipboard = (target: EventTarget | null) =>
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      onContextMenu={(e) => {
        if (!allowInputClipboard(e.target)) e.preventDefault();
      }}
      onCopy={(e) => {
        if (!allowInputClipboard(e.target)) e.preventDefault();
      }}
    >
      <div
        role="dialog"
        aria-label="Lưu đoạn đang đọc vào Kho trích dẫn"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md select-none rounded-2xl border p-4 shadow-2xl ${palette.panelBg} ${palette.border}`}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 font-display text-sm font-bold">
              <Highlighter className={`h-4 w-4 ${palette.accentText}`} />
              <span>Lưu đoạn đang đọc</span>
            </h3>
            <p className={`text-[11px] ${palette.textSecondary}`}>
              Chọn 1 đoạn trên khung nhìn để đánh dấu màu & lưu vào Kho trích dẫn
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className={`rounded-lg p-1.5 ${palette.hover}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {options.length === 0 ? (
          <p className={`py-6 text-center text-xs ${palette.textSecondary}`}>
            Trang hiện tại không có đoạn văn bản để lưu trích dẫn.
          </p>
        ) : (
          <>
            <div className="scrollbar-thin mb-3 max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {options.map((opt, idx) => {
                const isSelected = idx === selectedIdx;
                return (
                  <button
                    key={opt.blockIndex}
                    type="button"
                    onClick={() => {
                      setSelectedIdx(idx);
                      if (opt.existingHighlight) {
                        setColor(opt.existingHighlight.color);
                        setNote(opt.existingHighlight.note || '');
                      } else {
                        setColor('amber');
                        setNote('');
                      }
                    }}
                    className={`w-full rounded-xl border p-2.5 text-left text-xs leading-relaxed transition ${
                      isSelected ? palette.active : `${palette.border} ${palette.hover}`
                    }`}
                  >
                    <p className="line-clamp-3">{opt.text}</p>
                    {opt.existingHighlight && (
                      <span className={`mt-1 inline-block text-[10px] font-semibold ${palette.accentText}`}>
                        Đã lưu trong Kho trích dẫn
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mb-2.5 flex items-center gap-1.5">
              {HIGHLIGHT_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.label}
                  aria-label={opt.label}
                  onClick={() => setColor(opt.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-1.5 text-[11px] font-medium transition ${
                    color === opt.id ? palette.active : `${palette.border} ${palette.hover}`
                  }`}
                >
                  <span className={`h-3 w-3 rounded-full border ${opt.swatchClass}`} />
                  <span>{opt.shortLabel}</span>
                </button>
              ))}
            </div>

            <input
              type="text"
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú ngắn cho đoạn này (tuỳ chọn)..."
              className={`mb-3 w-full select-text rounded-xl border bg-transparent px-3 py-1.5 text-xs outline-none ${palette.border} ${palette.focusBorder}`}
            />

            <div className="flex items-center justify-between gap-2">
              {picked?.existingHighlight ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onDeleteExisting(picked.existingHighlight!.id)}
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition ${palette.dangerButton}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Gỡ đánh dấu</span>
                </button>
              ) : (
                <span />
              )}

              <button
                type="button"
                disabled={saving || !picked}
                onClick={() => {
                  if (picked) {
                    onSaveParagraph(picked.blockIndex, picked.text, color, note);
                  }
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${palette.accentBg} ${palette.accentFg}`}
              >
                <Check className="h-3.5 w-3.5" />
                <span>{picked?.existingHighlight ? 'Cập nhật màu/chú' : 'Lưu trích dẫn'}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
