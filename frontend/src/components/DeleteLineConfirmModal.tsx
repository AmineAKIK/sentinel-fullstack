import { useEffect, useState } from 'react';
import AdminPasswordConfirmModal from './AdminPasswordConfirmModal';
import { deleteLine, getLineImpact } from '../api/lines';
import { ProductionLine } from '../types';

interface DeleteLineConfirmModalProps {
  line: ProductionLine;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DeleteLineConfirmModal({
  line,
  onClose,
  onSuccess,
}: DeleteLineConfirmModalProps) {
  const [impact, setImpact] = useState<{ incidents: number; open_or_pending_incidents: number } | null>(null);

  useEffect(() => {
    getLineImpact(line.id).then(setImpact).catch(() => setImpact(null));
  }, [line.id]);

  const hasActiveIncidents = Boolean(impact && impact.open_or_pending_incidents > 0);

  async function handleConfirm() {
    await deleteLine(line.id);
    onSuccess();
  }

  return (
    <AdminPasswordConfirmModal
      title="Supprimer la ligne"
      onClose={onClose}
      onConfirm={handleConfirm}
      disabled={hasActiveIncidents}
    >
      <p style={{ fontWeight: 500, marginBottom: 8 }}>
        Supprimer la ligne {line.line_number} ?
      </p>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
        Cette action retirera la ligne de la gestion courante. Sa configuration ne sera plus visible dans la liste.
      </p>
      {impact && impact.incidents > 0 && (
        <div className="notice">
          Impact historique : {impact.incidents} incident(s) lié(s), dont {impact.open_or_pending_incidents} actif(s).
          {hasActiveIncidents && (
            <> Suppression bloquée tant que ces incidents ne sont pas clôturés ou annulés.</>
          )}
        </div>
      )}
    </AdminPasswordConfirmModal>
  );
}
