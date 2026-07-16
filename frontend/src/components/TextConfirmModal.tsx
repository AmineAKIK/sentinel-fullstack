import { useRef, useState } from 'react';
import Modal from './Modal';
import ErrorBanner from './ui/ErrorBanner';
import CharCounter from './ui/CharCounter';
import { FIELD_LIMITS } from '../utils/fieldLimits';
import { apiErrorMessage } from '../api/client';

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
  maxLength?: number;
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
  maxLength = FIELD_LIMITS.COMMENT,
}: TextConfirmModalProps) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);
  const buttonClassName = variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary';

  async function handleConfirm() {
    if (submittingRef.current) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setError(requiredMessage);
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError('');
    try {
      await onConfirm(trimmed);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, failureMessage));
    } finally {
      submittingRef.current = false;
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
          <button className="btn btn-secondary" type="button" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button
            className={buttonClassName}
            type="button"
            onClick={() => void handleConfirm()}
            disabled={loading}
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </>
      }
    >
      <div className="notice">{notice}</div>
      <div className="form-group">
        <label className="form-label" htmlFor={textareaId}>
          {label}
        </label>
        <textarea
          id={textareaId}
          className="form-input"
          rows={4}
          value={value}
          onChange={(event) => setValue(event.target.value.slice(0, maxLength))}
          maxLength={maxLength}
          disabled={loading}
          placeholder={placeholder}
        />
        <CharCounter current={value.length} max={maxLength} />
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}
    </Modal>
  );
}
