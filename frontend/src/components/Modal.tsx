import React, { useEffect, useMemo, useState } from 'react';

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
  dirtyMessage = 'Des modifications ne sont pas enregistrées. Quitter quand même ?',
}: ModalProps) {
  const [confirmClose, setConfirmClose] = useState(false);
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && escapeEnabled) requestClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [canClose, escapeEnabled, isDirty, isLoading, onClose]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (!closeOnOverlay) return;
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className={modalClassName} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          {canClose && (
            <button className="btn btn-ghost btn-sm" onClick={requestClose} aria-label="Fermer">
              ✕
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
      {confirmClose && (
        <div className="modal-confirm-overlay" role="presentation">
          <div className="modal modal-sm modal-confirm" role="dialog" aria-modal="true" aria-label="Quitter sans enregistrer">
            <div className="modal-header">
              <span className="modal-title">Quitter sans enregistrer ?</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClose(false)} aria-label="Fermer">
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>{dirtyMessage}</p>
              <div className="modal-confirm-actions">
                <button className="btn btn-secondary" type="button" onClick={() => setConfirmClose(false)}>
                  Continuer l’édition
                </button>
                <button className="btn btn-danger" type="button" onClick={onClose}>
                  Quitter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
