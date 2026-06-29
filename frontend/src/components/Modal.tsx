import React, { useEffect, useId, useMemo, useRef, useState, useCallback } from 'react';

interface ModalProps {
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onClose?: () => void;
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
  isDirty?: boolean;
  isLoading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'danger';
  dirtyMessage?: string;
}

export default function Modal({
  title,
  children,
  footer,
  onClose,
  closeOnOverlay = true,
  closeOnEscape,
  isDirty = false,
  isLoading = false,
  size = 'md',
  variant = 'default',
  dirtyMessage = 'Les modifications en cours seront perdues.',
}: ModalProps) {
  const [confirmClose, setConfirmClose] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  const titleIdStr = `modal-title-${useId()}`;
  const canClose = Boolean(onClose) && !isLoading;
  const escapeEnabled = closeOnEscape ?? closeOnOverlay;
  const modalClassName = useMemo(() => {
    return ['modal', `modal-${size}`, variant === 'danger' ? 'modal-danger' : ''].filter(Boolean).join(' ');
  }, [size, variant]);

  function requestClose(): void {
    if (!canClose) return;
    if (isDirty) {
      setConfirmClose(true);
      return;
    }
    onClose?.();
  }

  const focusableSelector = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const inputs = modalRef.current?.querySelectorAll<HTMLElement>(
      '[role="combobox"]:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
    );
    const firstInput = inputs?.[0];
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>(focusableSelector);

    window.setTimeout(() => {
      (firstInput ?? firstFocusable)?.focus();
    }, 0);

    return () => {
      previousActiveElement?.focus();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trapFocus = useCallback((ref: React.RefObject<HTMLDivElement | null>, onEscape?: () => void) => {
    return (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        onEscape();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const focusable = Array.from(ref.current.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (focusable.length === 0) {
        e.preventDefault();
        ref.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus trap for main dialog (disabled when confirm is open)
  useEffect(() => {
    if (confirmClose) return undefined;
    const handler = trapFocus(modalRef, escapeEnabled ? requestClose : undefined);
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canClose, escapeEnabled, isDirty, isLoading, onClose, confirmClose]);

  // Focus trap for confirm dialog
  useEffect(() => {
    if (!confirmClose) return undefined;
    const handler = trapFocus(confirmRef, () => setConfirmClose(false));
    window.setTimeout(() => {
      confirmRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();
    }, 0);
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmClose]);

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (!closeOnOverlay) return;
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className={modalClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleIdStr}
        ref={modalRef}
        tabIndex={-1}
      >
        <div className="modal-header">
          <span className="modal-title" id={titleIdStr}>{title}</span>
          {canClose && (
            <button className="btn btn-ghost btn-sm" onClick={requestClose} aria-label="Fermer">
              <span aria-hidden="true">✕</span>
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>

        {confirmClose && (
          <div className="modal-confirm-backdrop" role="presentation">
            <div
              className="modal-confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Quitter sans enregistrer"
              ref={confirmRef}
              tabIndex={-1}
            >
              <p className="modal-confirm-title">Quitter sans enregistrer ?</p>
              <p className="modal-confirm-body">{dirtyMessage}</p>
              <div className="modal-confirm-actions">
                <button className="btn btn-secondary btn-sm" type="button" onClick={onClose}>
                  Quitter
                </button>
                <button className="btn btn-primary btn-sm" type="button" onClick={() => setConfirmClose(false)}>
                  Continuer l'édition
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
