import AdminPasswordConfirmModal from './AdminPasswordConfirmModal';
import { useMutationRunner } from './ui/MutationFeedback';

type RevokeSessionsConfirmModalProps = {
  revokeAdmin: boolean;
  revokeWorkshop: boolean;
  revokeBoard: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
};

export default function RevokeSessionsConfirmModal({
  revokeAdmin,
  revokeWorkshop,
  revokeBoard,
  onClose,
  onConfirm,
}: RevokeSessionsConfirmModalProps) {
  useMutationRunner();
  const scopes: string[] = [];
  if (revokeAdmin) scopes.push('Sessions administrateur');
  if (revokeWorkshop) scopes.push('Sessions atelier (tous les utilisateurs)');
  if (revokeBoard) scopes.push('Sessions board atelier');

  return (
    <AdminPasswordConfirmModal
      title="Révoquer des sessions ?"
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="Révoquer"
      loadingLabel="Révocation…"
      mutationKey="admin:sessions:revoke"
      successMessage="Sessions révoquées."
    >
      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
          margin: '0 0 10px',
        }}
      >
        Les utilisateurs concernés seront déconnectés immédiatement à leur prochaine requête. Cette
        action est irréversible.
      </p>
      <div className="notice notice--danger" style={{ marginBottom: 4 }}>
        <strong>Sessions à révoquer :</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {scopes.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
    </AdminPasswordConfirmModal>
  );
}
