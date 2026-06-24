import { useState } from 'react';
import Modal from './Modal';
import { updateLine } from '../api/lines';
import { ApiResponseError } from '../api/client';
import { ProductionLine } from '../types';
import { LineFormData } from './LineForm';
import { lineMachinesEqual, normalizeLineMachine } from '../utils/lineMachines';

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
  const [loading, setLoading] = useState(false);

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

  if (machinesChanged(line, form)) {
    changes.push({
      field: 'machines',
      label: 'Ordre des machines',
      oldVal: `${line.machines.length} machine(s) — ${formatMachineOrder(line.machines)}`,
      newVal: `${form.machines.length} machine(s) — ${formatMachineOrder(form.machines.map(normalizeLineMachine))}`,
    });
  }

  async function handleSave() {
    setError('');
    setLoading(true);

    try {
      const updated = await updateLine(line.id, {
        lineNumber: form.lineNumber.trim(),
        isActive: form.isActive,
        machines: form.machines.map(normalizeLineMachine),
      });
      onSuccess(updated);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : 'Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
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
          <button className="btn btn-primary" onClick={handleSave} disabled={loading || changes.length === 0}>
            {loading ? <><span className="spinner" aria-hidden="true" /> Enregistrement…</> : 'Enregistrer'}
          </button>
        </>
      }
    >
      {changes.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Aucune modification détectée.</p>
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
      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
