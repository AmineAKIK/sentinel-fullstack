import { useState } from 'react';
import Modal from './Modal';
import ErrorBanner from './ui/ErrorBanner';

type TextConfirmModalProps = {
  title: string;
  notice: React.ReactNode;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  loadingLabel: string;
  requiredMessage: string;
  failureMessage: string;
  onClose: () => void;
  onConfirm: (value: string) => Promise<void>;
  variant?: 'default' | 'danger';
  textareaId?: string;
};

export default function TextConfirmModal({
  title,
  notice,
  label,
  placeholder,
  confirmLabel,
  loadingLabel,
  requiredMessage,
  failureMessage,
  onClose,
  onConfirm,
  variant = 'default',
  textareaId = 'confirmText',
}: TextConfirmModalProps) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const buttonClassName = variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary';

  async function handleConfirm() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError(requiredMessage);
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onConfirm(trimmed);
    } catch {
      setError(failureMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={loading ? undefined : onClose}
      closeOnOverlay={false}
      isDirty={value.trim().length > 0}
      isLoading={loading}
      variant={variant}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button className={buttonClassName} onClick={handleConfirm} disabled={loading}>
            {loading ? loadingLabel : confirmLabel}
          </button>
        </>
      }
    >
      <div className="notice">{notice}</div>
      <div className="form-group">
        <label className="form-label" htmlFor={textareaId}>{label}</label>
        <textarea
          id={textareaId}
          className="form-input"
          rows={4}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={loading}
          placeholder={placeholder}
        />
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}
    </Modal>
  );
}
