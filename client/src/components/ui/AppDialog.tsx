import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

type AppDialogVariant = 'modal' | 'drawer';

interface AppDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  variant?: AppDialogVariant;
  className?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  busy?: boolean;
  panelStyle?: React.CSSProperties;
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let lockedDialogCount = 0;
let previousBodyOverflow = '';
const dialogStack: string[] = [];

/**
 * Shared accessible overlay for modal dialogs and detail drawers.
 *
 * It keeps keyboard focus inside the overlay, restores the invoking control
 * after close, and blocks background scrolling while any dialog is open.
 */
export const AppDialog: React.FC<AppDialogProps> = ({
  isOpen,
  onClose,
  title,
  children,
  variant = 'modal',
  className = '',
  closeOnBackdrop = true,
  closeOnEscape = true,
  busy = false,
  panelStyle,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const optionsRef = useRef({ busy, closeOnEscape });
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    optionsRef.current = { busy, closeOnEscape };
  }, [busy, closeOnEscape]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    if (lockedDialogCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockedDialogCount += 1;
    dialogStack.push(titleId);

    const focusFirstElement = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const firstFocusable = panel.querySelector<HTMLElement>(focusableSelector);
      (firstFocusable || panel).focus();
    };
    const frameId = window.requestAnimationFrame(focusFirstElement);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== titleId) return;

      if (event.key === 'Escape' && optionsRef.current.closeOnEscape && !optionsRef.current.busy) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusableElements = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('keydown', handleKeyDown);
      lockedDialogCount = Math.max(0, lockedDialogCount - 1);
      const stackIndex = dialogStack.lastIndexOf(titleId);
      if (stackIndex >= 0) dialogStack.splice(stackIndex, 1);
      if (lockedDialogCount === 0) document.body.style.overflow = previousBodyOverflow;
      previousFocusRef.current?.focus();
    };
  }, [isOpen, titleId]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`app-dialog app-dialog--${variant}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeOnBackdrop && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`app-dialog__panel ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={panelStyle}
      >
        <h2 id={titleId} className="sr-only">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
};

export default AppDialog;
