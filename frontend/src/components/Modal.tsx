import React, { useEffect } from 'react';

interface ModalProps {
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onClose?: () => void;
  closeOnOverlay?: boolean;
}

export default function Modal({
  title,
  children,
  footer,
  onClose,
  closeOnOverlay = true,
}: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (!closeOnOverlay) return;
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          {onClose && (
            <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fermer">
              ✕
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  );
}
