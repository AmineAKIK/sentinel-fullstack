import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import ErrorBanner from './ui/ErrorBanner';
import Spinner from './ui/Spinner';
import { useMutationRunner } from './ui/MutationFeedback';
import { apiErrorMessage } from '../api/errorMessages';

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
  mutationKey?: string;
};

type ConfirmModalSurfaceProps = Omit<
  ConfirmModalProps,
  'loading' | 'error' | 'failureMessage' | 'mutationKey'
> & {
  effectiveLoading: boolean;
  effectiveError: string;
  onConfirmAction: () => void;
};

function ConfirmModalSurface({
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel = 'Confirmer',
  loadingLabel = 'Confirmation…',
  cancelLabel = 'Annuler',
  disabled = false,
  variant = 'default',
  closeOnOverlay = false,
  effectiveLoading,
  effectiveError,
  onConfirmAction,
}: ConfirmModalSurfaceProps) {
  const buttonClassName = variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary';

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
              onClick={onConfirmAction}
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

type SharedMutationConfirmModalProps = ConfirmModalProps & {
  mutationKey: string;
};

function SharedMutationConfirmModal({
  mutationKey,
  loading = false,
  error = '',
  disabled = false,
  onConfirm,
  ...surfaceProps
}: SharedMutationConfirmModalProps) {
  const { isPending } = useMutationRunner();
  const effectiveLoading = loading || isPending(mutationKey);

  function handleConfirm(): void {
    if (!onConfirm || effectiveLoading || disabled) return;
    void onConfirm();
  }

  return (
    <ConfirmModalSurface
      {...surfaceProps}
      onConfirm={onConfirm}
      disabled={disabled}
      effectiveLoading={effectiveLoading}
      effectiveError={error}
      onConfirmAction={handleConfirm}
    />
  );
}

function LegacyConfirmModal({
  loading = false,
  error = '',
  disabled = false,
  failureMessage = 'Impossible de confirmer cette action.',
  onConfirm,
  ...surfaceProps
}: ConfirmModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);
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
    <ConfirmModalSurface
      {...surfaceProps}
      onConfirm={onConfirm}
      disabled={disabled}
      effectiveLoading={effectiveLoading}
      effectiveError={effectiveError}
      onConfirmAction={() => void handleConfirm()}
    />
  );
}

export default function ConfirmModal(props: ConfirmModalProps) {
  if (props.mutationKey) {
    return <SharedMutationConfirmModal {...props} mutationKey={props.mutationKey} />;
  }

  // Compatibilité strictement transitoire pour les consommateurs hors Atelier :
  // leur migration vers le runner partagé appartient au lot 5.
  return <LegacyConfirmModal {...props} />;
}
