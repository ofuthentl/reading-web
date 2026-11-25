import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

const modalStack: symbol[] = [];

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  closeDisabled?: boolean;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  zIndexClass?: string;
  backdropClassName?: string;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  dataShortcutsModal?: boolean;
  children: ReactNode;
}

/**
 * Khung hộp thoại chuẩn hoá toàn ứng dụng (Wave 3 Phase 3.2):
 * - Render qua `createPortal(..., document.body)` tránh lỗi stacking/fixed trên mobile.
 * - Tự khoá cuộn nền qua `useBodyScrollLock` (có đếm reference hỗ trợ modal lồng nhau).
 * - Focus-trap (`Tab` / `Shift+Tab`), khôi phục focus khi đóng và đóng đúng modal trên cùng bằng `Esc`.
 */
export function ModalShell({
  open,
  onClose,
  closeDisabled = false,
  ariaLabelledBy,
  ariaLabel,
  zIndexClass = 'z-50',
  backdropClassName = 'items-center justify-center p-4',
  panelClassName = 'moonlit-card fade-in w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl dark:border-line-strong/70',
  panelStyle,
  initialFocusRef,
  dataShortcutsModal = false,
  children,
}: ModalShellProps) {
  useBodyScrollLock(open);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeDisabledRef = useRef(closeDisabled);
  closeDisabledRef.current = closeDisabled;
  const mouseDownOnBackdropRef = useRef(false);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;

    const modalId = Symbol('modal-shell');
    modalStack.push(modalId);
    const previousFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusFrame = window.requestAnimationFrame(() => {
      if (modalStack[modalStack.length - 1] !== modalId) return;
      const panel = panelRef.current;
      if (!panel) return;
      const active = document.activeElement;
      if (active && panel.contains(active)) return;
      if (initialFocusRef?.current && panel.contains(initialFocusRef.current)) {
        initialFocusRef.current.focus();
        return;
      }
      const focusables = getFocusableElements(panel);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        panel.focus();
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== modalId) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!closeDisabledRef.current) {
          onCloseRef.current();
        }
        return;
      }

      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = getFocusableElements(panel);
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!active || !panel.contains(active) || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!active || !panel.contains(active) || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown, true);
      const idx = modalStack.lastIndexOf(modalId);
      if (idx >= 0) modalStack.splice(idx, 1);
      if (previousFocused && previousFocused.isConnected) {
        window.requestAnimationFrame(() => {
          if (previousFocused.isConnected && modalStack.length === 0) {
            previousFocused.focus();
          }
        });
      }
    };
  }, [initialFocusRef, open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClass} !m-0 flex bg-black/60 backdrop-blur-sm ${backdropClassName}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
      aria-label={!ariaLabelledBy ? ariaLabel : undefined}
      {...(dataShortcutsModal ? { 'data-shortcuts-modal': 'true' } : {})}
      onMouseDown={(event) => {
        mouseDownOnBackdropRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (
          mouseDownOnBackdropRef.current &&
          event.target === event.currentTarget &&
          !closeDisabled
        ) {
          onClose();
        }
        mouseDownOnBackdropRef.current = false;
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        style={panelStyle}
        className={`outline-none ${panelClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
