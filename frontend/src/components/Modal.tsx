import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CloseIcon from './icons/CloseIcon';

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
  className?: string;
  overlayClassName?: string;
  dirtyMessage?: string;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const modalStack: symbol[] = [];
let pageLockCount = 0;
let lockedScrollY = 0;
let previousBodyStyles: Partial<CSSStyleDeclaration> | null = null;
let previousRootAriaHidden: string | null = null;
let previousRootInert = false;

function lockPage(): void {
  pageLockCount += 1;
  if (pageLockCount !== 1) return;

  const body = document.body;
  const root = document.getElementById('root');
  lockedScrollY = window.scrollY;
  previousBodyStyles = {
    overflow: body.style.overflow,
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
    paddingRight: body.style.paddingRight,
  };

  const documentWidth = document.documentElement.clientWidth;
  const scrollbarWidth = documentWidth > 0 ? Math.max(0, window.innerWidth - documentWidth) : 0;
  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${lockedScrollY}px`;
  body.style.width = '100%';
  if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

  if (root) {
    previousRootAriaHidden = root.getAttribute('aria-hidden');
    previousRootInert = Boolean(root.inert);
    root.inert = true;
    root.setAttribute('aria-hidden', 'true');
  }
}

function unlockPage(): void {
  pageLockCount = Math.max(0, pageLockCount - 1);
  if (pageLockCount !== 0 || !previousBodyStyles) return;

  const body = document.body;
  const root = document.getElementById('root');
  body.style.overflow = previousBodyStyles.overflow ?? '';
  body.style.position = previousBodyStyles.position ?? '';
  body.style.top = previousBodyStyles.top ?? '';
  body.style.width = previousBodyStyles.width ?? '';
  body.style.paddingRight = previousBodyStyles.paddingRight ?? '';

  if (root) {
    root.inert = previousRootInert;
    if (previousRootAriaHidden === null) root.removeAttribute('aria-hidden');
    else root.setAttribute('aria-hidden', previousRootAriaHidden);
  }

  previousBodyStyles = null;
  window.scrollTo({ top: lockedScrollY, left: 0, behavior: 'auto' });
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
  );
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
  className = '',
  overlayClassName = '',
  dirtyMessage = 'Les modifications en cours seront perdues.',
}: ModalProps) {
  const [confirmClose, setConfirmClose] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  const modalIdRef = useRef(Symbol('modal'));
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const canClose = Boolean(onClose) && !isLoading;
  const escapeEnabled = closeOnEscape ?? closeOnOverlay;
  const modalClassName = useMemo(
    () =>
      ['modal', `modal-${size}`, variant === 'danger' ? 'modal-danger' : '', className]
        .filter(Boolean)
        .join(' '),
    [className, size, variant]
  );
  const overlayClassNames = useMemo(
    () => ['modal-overlay', overlayClassName].filter(Boolean).join(' '),
    [overlayClassName]
  );

  const requestClose = useCallback((): void => {
    if (!canClose) return;
    if (isDirty) {
      setConfirmClose(true);
      return;
    }
    onClose?.();
  }, [canClose, isDirty, onClose]);

  useEffect(() => {
    const modalId = modalIdRef.current;
    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalStack.push(modalId);
    lockPage();

    const focusTimer = window.setTimeout(() => {
      const firstInput = modalRef.current?.querySelector<HTMLElement>(
        '[role="combobox"]:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
      );
      const firstFocusable = modalRef.current
        ? getFocusableElements(modalRef.current)[0]
        : undefined;
      (firstInput ?? firstFocusable ?? modalRef.current)?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      const stackIndex = modalStack.lastIndexOf(modalId);
      if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
      unlockPage();
      previousActiveElementRef.current?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (modalStack[modalStack.length - 1] !== modalIdRef.current) return;

      if (event.key === 'Escape') {
        if (confirmClose) {
          event.preventDefault();
          setConfirmClose(false);
        } else if (escapeEnabled) {
          event.preventDefault();
          requestClose();
        }
        return;
      }

      if (event.key !== 'Tab') return;
      const activeContainer = confirmClose ? confirmRef.current : modalRef.current;
      if (!activeContainer) return;
      const focusable = getFocusableElements(activeContainer);
      if (focusable.length === 0) {
        event.preventDefault();
        activeContainer.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || !activeContainer.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !activeContainer.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [confirmClose, escapeEnabled, requestClose]);

  useEffect(() => {
    if (!confirmClose) return undefined;
    const focusTimer = window.setTimeout(() => {
      const firstFocusable = confirmRef.current
        ? getFocusableElements(confirmRef.current)[0]
        : undefined;
      (firstFocusable ?? confirmRef.current)?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [confirmClose]);

  return createPortal(
    <div
      className={overlayClassNames}
      role="presentation"
      onClick={(event) => {
        if (closeOnOverlay && event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        className={modalClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={isLoading || undefined}
        ref={modalRef}
        tabIndex={-1}
      >
        <div className="modal-header">
          <span className="modal-title" id={titleId}>
            {title}
          </span>
          {canClose && (
            <button
              className="btn btn-ghost btn-sm btn-icon"
              type="button"
              onClick={requestClose}
              aria-label="Fermer"
            >
              <CloseIcon />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer !== null && footer !== undefined && <div className="modal-footer">{footer}</div>}

        {confirmClose && (
          <div className="modal-confirm-overlay" role="presentation">
            <div
              className="modal-confirm-dialog"
              role="alertdialog"
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
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  onClick={() => setConfirmClose(false)}
                >
                  Continuer l'édition
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
