import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import ErrorBanner from './ui/ErrorBanner';
import Spinner from './ui/Spinner';
import { apiErrorMessage } from '../api/client';

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
  failureMessage?: string;
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
  failureMessage = 'Impossible de confirmer cette action.',
}: ConfirmModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);
  const buttonClassName = variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary';
  const effectiveLoading = loading || submitting;
  const effectiveError = error || submissionError;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleConfirm(): Promise<void> {
    if (!onConfirm || effectiveLoading || disabled || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmissionError('');
    try {
      await onConfirm();
    } catch (requestError) {
      if (mountedRef.current) {
        setSubmissionError(apiErrorMessage(requestError, failureMessage));
      }
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={effectiveLoading ? undefined : onClose}
      closeOnOverlay={closeOnOverlay}
      isLoading={effectiveLoading}
      variant={variant}
      footer={
        <>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={onClose}
            disabled={effectiveLoading}
          >
            {cancelLabel}
          </button>
          {onConfirm && (
            <button
              className={buttonClassName}
              type="button"
              onClick={() => void handleConfirm()}
              disabled={effectiveLoading || disabled}
            >
              {effectiveLoading ? (
                <>
                  <Spinner /> {loadingLabel}
                </>
              ) : (
                confirmLabel
              )}
            </button>
          )}
        </>
      }
    >
      {children}
      {effectiveError && <ErrorBanner>{effectiveError}</ErrorBanner>}
    </Modal>
  );
}
