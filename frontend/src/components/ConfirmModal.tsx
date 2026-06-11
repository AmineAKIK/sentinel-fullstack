import Modal from './Modal';
import ErrorBanner from './ui/ErrorBanner';
import Spinner from './ui/Spinner';

type ConfirmModalProps = {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  confirmLabel?: string;
  loadingLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  error?: string;
  disabled?: boolean;
  variant?: 'default' | 'danger';
  closeOnOverlay?: boolean;
};

export default function ConfirmModal({
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel = 'Confirmer',
  loadingLabel = 'Confirmation…',
  cancelLabel = 'Annuler',
  loading = false,
  error = '',
  disabled = false,
  variant = 'default',
  closeOnOverlay = false,
}: ConfirmModalProps) {
  const buttonClassName = variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary';

  return (
    <Modal
      title={title}
      onClose={loading ? undefined : onClose}
      closeOnOverlay={closeOnOverlay}
      isLoading={loading}
      variant={variant}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </button>
          {onConfirm && (
            <button className={buttonClassName} onClick={onConfirm} disabled={loading || disabled}>
              {loading ? <><Spinner /> {loadingLabel}</> : confirmLabel}
            </button>
          )}
        </>
      }
    >
      {children}
      {error && <ErrorBanner>{error}</ErrorBanner>}
    </Modal>
  );
}
