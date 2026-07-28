import AdminPasswordConfirmModal from './AdminPasswordConfirmModal';
import { useMutationRunner } from './ui/MutationFeedback';

type BoardToggleConfirmModalProps = {
  enabling: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
};

export default function BoardToggleConfirmModal({
  enabling,
  onClose,
  onConfirm,
}: BoardToggleConfirmModalProps) {
  useMutationRunner();
  return (
    <AdminPasswordConfirmModal
      title={enabling ? 'Activer le board atelier ?' : 'Désactiver le board atelier ?'}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel={enabling ? 'Activer' : 'Désactiver'}
      loadingLabel={enabling ? 'Activation…' : 'Désactivation…'}
      mutationKey={`admin:board:${enabling ? 'enable' : 'disable'}`}
      successMessage={enabling ? 'Board activé.' : 'Board désactivé. Sessions Board révoquées.'}
    >
      {enabling ? (
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
            margin: '0 0 4px',
          }}
        >
          Le board atelier sera accessible aux écrans disposant du code d'accès.
        </p>
      ) : (
        <>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              margin: '0 0 8px',
            }}
          >
            Le board atelier sera immédiatement inaccessible.
          </p>
          <div className="notice notice--danger" style={{ marginBottom: 4 }}>
            Toutes les sessions board actives seront révoquées. Les écrans connectés seront
            déconnectés à leur prochaine requête.
          </div>
        </>
      )}
    </AdminPasswordConfirmModal>
  );
}
