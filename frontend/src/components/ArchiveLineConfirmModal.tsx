import { useEffect, useState } from 'react';
import AdminPasswordConfirmModal from './AdminPasswordConfirmModal';
import { archiveLine, getLineImpact } from '../api/lines';
import { ProductionLine } from '../types';
import { useMutationRunner } from './ui/MutationFeedback';

interface ArchiveLineConfirmModalProps {
  line: ProductionLine;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ArchiveLineConfirmModal({
  line,
  onClose,
  onSuccess,
}: ArchiveLineConfirmModalProps) {
  useMutationRunner();
  const [impact, setImpact] = useState<{
    incidents: number;
    open_or_pending_incidents: number;
  } | null>(null);
  const [forceMode, setForceMode] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getLineImpact(line.id, controller.signal)
      .then(setImpact)
      .catch(() => {
        if (!controller.signal.aborted) setImpact(null);
      });
    return () => controller.abort();
  }, [line.id]);

  const activeCount = impact?.open_or_pending_incidents ?? 0;
  const hasActiveIncidents = activeCount > 0;

  async function handleConfirm() {
    await archiveLine(line.id, forceMode);
    onSuccess();
  }

  const title = forceMode ? `Archiver et annuler ${activeCount} incident(s)` : 'Archiver la ligne';

  return (
    <AdminPasswordConfirmModal
      title={title}
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmLabel={forceMode ? `Annuler ${activeCount} incident(s) et archiver` : 'Archiver'}
      mutationKey={`admin:line:${line.id}:archive`}
      successMessage="Ligne archivée."
      failureMessage="Impossible d’archiver la ligne."
    >
      <p style={{ fontWeight: 500, marginBottom: 8 }}>Archiver la ligne {line.line_number} ?</p>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
        La ligne sera retirée de la gestion courante. Son historique et sa base de connaissance
        restent consultables.
      </p>

      {impact && impact.incidents > 0 && (
        <div className="notice" style={{ marginTop: 12 }}>
          {impact.incidents} incident(s) lié(s) à cette ligne au total.
          {hasActiveIncidents && (
            <>
              {' '}
              <strong>{activeCount} actif(s)</strong> — doivent être traités avant archivage.
            </>
          )}
        </div>
      )}

      {hasActiveIncidents && !forceMode && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-danger"
            style={{ fontSize: 13, width: '100%' }}
            onClick={() => setForceMode(true)}
          >
            Annuler les {activeCount} incident(s) actif(s) et archiver
          </button>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>
            Les incidents actifs seront annulés automatiquement. Cette action est irréversible.
          </p>
        </div>
      )}

      {forceMode && (
        <div className="notice notice--danger" style={{ marginTop: 12 }}>
          <strong>Attention :</strong> {activeCount} incident(s) actif(s) seront annulés
          définitivement avec la ligne.
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 12, marginTop: 6, display: 'block' }}
            onClick={() => setForceMode(false)}
          >
            ← Revenir à l'archivage simple
          </button>
        </div>
      )}
    </AdminPasswordConfirmModal>
  );
}
