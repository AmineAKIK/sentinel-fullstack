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
  successMessage?: string;
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

function DefaultMutationConfirmModal({
  loading = false,
  error = '',
  disabled = false,
  failureMessage = 'Impossible de confirmer cette action.',
  successMessage,
  onConfirm,
  title,
  ...surfaceProps
}: ConfirmModalProps) {
  const mutation = useMutationRunner();
  const key = `confirmation:${title}`;
  const effectiveLoading = loading || mutation.isPending(key);

  async function handleConfirm(): Promise<void> {
    if (!onConfirm || effectiveLoading || disabled) return;
    await mutation.execute(() => Promise.resolve(onConfirm()), {
      key,
      successMessage,
      toErrorMessage: (requestError) => apiErrorMessage(requestError, failureMessage),
    });
  }

  return (
    <ConfirmModalSurface
      title={title}
      {...surfaceProps}
      onConfirm={onConfirm}
      disabled={disabled}
      effectiveLoading={effectiveLoading}
      effectiveError={error}
      onConfirmAction={() => void handleConfirm()}
    />
  );
}

export default function ConfirmModal(props: ConfirmModalProps) {
  if (props.mutationKey) {
    return <SharedMutationConfirmModal {...props} mutationKey={props.mutationKey} />;
  }

  return <DefaultMutationConfirmModal {...props} />;
}
