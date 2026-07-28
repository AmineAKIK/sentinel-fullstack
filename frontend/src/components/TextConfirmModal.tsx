import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import ErrorBanner from './ui/ErrorBanner';
import CharCounter from './ui/CharCounter';
import { useMutationRunner } from './ui/MutationFeedback';
import { FIELD_LIMITS } from '../utils/fieldLimits';

type TextConfirmModalProps = {
  title: string;
  notice: React.ReactNode;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  loadingLabel: string;
  mutationKey: string;
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
  mutationKey,
  requiredMessage,
  onClose,
  onConfirm,
  variant = 'default',
  textareaId = 'confirmText',
  maxLength = FIELD_LIMITS.COMMENT,
}: TextConfirmModalProps) {
  const [value, setValue] = useState('');
  const [requiredError, setRequiredError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { errorKey, isPending } = useMutationRunner();
  const pending = isPending(mutationKey);
  const buttonClassName = variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary';

  useEffect(() => {
    if (errorKey === mutationKey) {
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [errorKey, mutationKey]);

  function handleConfirm() {
    if (pending) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setRequiredError(requiredMessage);
      textareaRef.current?.focus({ preventScroll: true });
      return;
    }

    setRequiredError('');
    void onConfirm(trimmed);
  }

  return (
    <Modal
      title={title}
      onClose={pending ? undefined : onClose}
      closeOnOverlay={false}
      isDirty={value.trim().length > 0}
      isLoading={pending}
      variant={variant}
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose} disabled={pending}>
            Annuler
          </button>
          <button
            className={buttonClassName}
            type="button"
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? loadingLabel : confirmLabel}
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
          ref={textareaRef}
          id={textareaId}
          className="form-input"
          rows={4}
          value={value}
          onChange={(event) => setValue(event.target.value.slice(0, maxLength))}
          maxLength={maxLength}
          disabled={pending}
          placeholder={placeholder}
        />
        <CharCounter current={value.length} max={maxLength} />
      </div>
      {requiredError && <ErrorBanner>{requiredError}</ErrorBanner>}
    </Modal>
  );
}
