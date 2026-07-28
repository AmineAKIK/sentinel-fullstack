import { useState } from 'react';
import Modal from './Modal';
import { updateLine } from '../api/lines';
import { apiErrorMessage } from '../api/errorMessages';
import { ProductionLine } from '../types';
import { LineFormData } from './LineForm';
import { lineMachinesEqual, normalizeLineMachine } from '../utils/lineMachines';
import { useMutationRunner } from './ui/MutationFeedback';
import { formatCount } from '../utils/french';

interface EditLineSummaryModalProps {
  line: ProductionLine;
  form: LineFormData;
  onBack: () => void;
  onClose: () => void;
  onSuccess: (line: ProductionLine) => void;
}

function machinesChanged(line: ProductionLine, form: LineFormData): boolean {
  return !lineMachinesEqual(line.machines, form.machines);
}

function formatMachineOrder(machines: ProductionLine['machines']): string {
  return machines.map((machine) => machine.machineId).join(' → ');
}

export default function EditLineSummaryModal({
  line,
  form,
  onBack,
  onClose,
  onSuccess,
}: EditLineSummaryModalProps) {
  const [error, setError] = useState('');
  const mutation = useMutationRunner();
  const key = `admin:line:${line.id}:update`;
  const loading = mutation.isPending(key);

  const changes: { field: string; label: string; oldVal: string; newVal: string }[] = [];

  if (form.lineNumber.trim() !== line.line_number) {
    changes.push({
      field: 'lineNumber',
      label: 'Numéro de ligne',
      oldVal: line.line_number,
      newVal: form.lineNumber.trim(),
    });
  }

  if (form.isActive !== undefined && form.isActive !== line.is_active) {
    changes.push({
      field: 'isActive',
      label: 'Statut',
      oldVal: line.is_active ? 'Actif' : 'Inactif',
      newVal: form.isActive ? 'Actif' : 'Inactif',
    });
  }
  const statusChange = form.isActive !== undefined && form.isActive !== line.is_active;

  if (machinesChanged(line, form)) {
    changes.push({
      field: 'machines',
      label: 'Ordre des machines',
      oldVal: `${formatCount(line.machines.length, 'machine', 'machines')} — ${formatMachineOrder(line.machines)}`,
      newVal: `${formatCount(form.machines.length, 'machine', 'machines')} — ${formatMachineOrder(form.machines.map(normalizeLineMachine))}`,
    });
  }

  async function handleSave() {
    setError('');
    await mutation.execute(
      () =>
        updateLine(line.id, {
          lineNumber: form.lineNumber.trim(),
          isActive: form.isActive,
          machines: form.machines.map(normalizeLineMachine),
        }),
      {
        key,
        successMessage:
          statusChange && form.isActive
            ? 'Ligne activée.'
            : statusChange
              ? 'Ligne désactivée.'
              : 'Ligne modifiée.',
        errorPresentation: 'local',
        toErrorMessage: (err) => apiErrorMessage(err, 'Une erreur inattendue est survenue.'),
        onSuccess,
        onError: (_err, safeMessage) => setError(safeMessage),
      }
    );
  }

  return (
    <Modal
      title="Récapitulatif des modifications"
      onClose={loading ? undefined : onClose}
      closeOnOverlay={false}
      isLoading={loading}
      size="lg"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onBack} disabled={loading}>
            Retour
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={loading || changes.length === 0}
          >
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" /> Enregistrement…
              </>
            ) : (
              'Enregistrer'
            )}
          </button>
        </>
      }
    >
      {changes.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
          Aucune modification détectée.
        </p>
      ) : (
        <div className="recap-list">
          {changes.map((change) => (
            <div key={change.field} className="recap-item">
              <div className="recap-title">{change.label}</div>
              <div className="recap-columns">
                <div className="recap-block">
                  <div className="recap-label">Avant</div>
                  <div>{change.oldVal}</div>
                </div>
                <div className="recap-block">
                  <div className="recap-label">Après</div>
                  <div>{change.newVal}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {statusChange && !form.isActive ? (
        <div className="notice notice--danger">
          La désactivation retirera cette ligne de la gestion active. Son historique restera
          conservé. Confirmez uniquement après avoir vérifié les incidents en cours.
        </div>
      ) : null}
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
