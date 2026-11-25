import { Keyboard, X } from 'lucide-react';
import { ModalShell } from '@/components/ModalShell';

export interface KeyboardShortcutsModalProps {
  open: boolean;
  context: 'library' | 'reader';
  onClose: () => void;
}

interface ShortcutRow {
  keys: readonly string[];
  description: string;
}

const LIBRARY_SHORTCUTS: readonly ShortcutRow[] = [
  { keys: ['Ctrl', 'K'], description: 'Mở bảng tìm kiếm nhanh toàn cục (⌘K trên macOS)' },
  { keys: ['/'], description: 'Đưa con trỏ vào ô tìm kiếm thư viện' },
  { keys: ['?'], description: 'Mở hoặc đóng bảng tra cứu phím tắt này' },
  { keys: ['Esc'], description: 'Đóng hộp thoại hoặc bảng lọc đang mở' },
];

const READER_SHORTCUTS: readonly ShortcutRow[] = [
  { keys: ['←', '→'], description: 'Chuyển trang hoặc chương trước / kế tiếp' },
  { keys: ['M'], description: 'Bật / tắt ngăn kéo Mục lục' },
  { keys: ['B'], description: 'Mở nhanh tab Ghi dấu (Dấu trang & Trích dẫn)' },
  { keys: ['F'], description: 'Bật / tắt chế độ đọc tập trung (ẩn thanh công cụ)' },
  { keys: ['↑', '↓'], description: 'Di chuyển Thanh dẫn mắt (khi bật Lật trang + Dẫn mắt)' },
  { keys: ['?'], description: 'Mở hoặc đóng bảng tra cứu phím tắt này' },
  { keys: ['Esc'], description: 'Đóng ngăn kéo / Lightbox / hiện lại thanh công cụ' },
];

function ShortcutGroupSection({
  title,
  badge,
  rows,
}: {
  title: string;
  badge?: string;
  rows: readonly ShortcutRow[];
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          {title}
        </h3>
        {badge && (
          <span className="rounded-full border border-crimson-accent/40 bg-crimson-accent/10 px-2 py-0.5 text-[10px] font-semibold text-crimson-accent">
            {badge}
          </span>
        )}
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-canvas/70">
        {rows.map((row) => (
          <li
            key={`${title}-${row.keys.join('+')}`}
            className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
          >
            <span className="text-ink">{row.description}</span>
            <span className="flex shrink-0 items-center gap-1">
              {row.keys.map((keyLabel) => (
                <kbd
                  key={keyLabel}
                  className="inline-flex min-w-[1.65rem] items-center justify-center rounded-md border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink shadow-sm"
                >
                  {keyLabel}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function KeyboardShortcutsModal({
  open,
  context,
  onClose,
}: KeyboardShortcutsModalProps) {
  const sections =
    context === 'reader'
      ? [
          { title: 'Trong Trình đọc', badge: 'Đang mở', rows: READER_SHORTCUTS },
          { title: 'Trong Thư viện', rows: LIBRARY_SHORTCUTS },
        ]
      : [
          { title: 'Trong Thư viện', badge: 'Đang mở', rows: LIBRARY_SHORTCUTS },
          { title: 'Trong Trình đọc', rows: READER_SHORTCUTS },
        ];

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      ariaLabelledBy="keyboard-shortcuts-modal-title"
      zIndexClass="z-[75]"
      dataShortcutsModal
      panelClassName="moonlit-card fade-in flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-subtle text-accent">
            <Keyboard className="h-5 w-5" />
          </div>
          <div>
            <h2
              id="keyboard-shortcuts-modal-title"
              className="font-display text-lg font-semibold text-ink"
            >
              Phím tắt nhanh
            </h2>
            <p className="text-xs text-ink-muted">
              Bấm <kbd className="rounded border border-line bg-canvas px-1 font-mono text-[10px]">?</kbd>{' '}
              bất cứ lúc nào để mở hoặc đóng bảng này
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bảng phím tắt"
          className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {sections.map((section) => (
          <ShortcutGroupSection
            key={section.title}
            title={section.title}
            badge={section.badge}
            rows={section.rows}
          />
        ))}
      </div>

      <div className="flex items-center justify-end border-t border-line bg-canvas/60 px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-line bg-surface px-4 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
        >
          Đóng (Esc)
        </button>
      </div>
    </ModalShell>
  );
}
