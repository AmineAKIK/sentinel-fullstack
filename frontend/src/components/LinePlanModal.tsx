import { useMemo, useState } from 'react';
import Modal from './Modal';
import { ProductionLine } from '../types';
import { updateLine } from '../api/lines';
import { apiErrorMessage } from '../api/errorMessages';
import { lineMachinesEqual, normalizeLineMachine } from '../utils/lineMachines';

interface LinePlanModalProps {
  line: ProductionLine;
  onClose: () => void;
  onSuccess: (line: ProductionLine) => void;
}

export default function LinePlanModal({ line, onClose, onSuccess }: LinePlanModalProps) {
  const [machines, setMachines] = useState(line.machines.map(normalizeLineMachine));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'plan' | 'preview'>('plan');

  const hasChanges = useMemo(() => {
    return !lineMachinesEqual(machines, line.machines);
  }, [machines, line.machines]);

  function formatOrder(list: typeof machines): string {
    return list.map((machine) => machine.machineId).join(' → ');
  }

  function moveMachine(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= machines.length) return;
    const next = [...machines];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    setMachines(next);
  }

  async function handleSave() {
    setError('');
    setLoading(true);
    try {
      const updated = await updateLine(line.id, { machines });
      onSuccess(updated);
    } catch (err) {
      setError(apiErrorMessage(err, 'Une erreur inattendue est survenue.'));
      setLoading(false);
    }
  }

  function handlePreview() {
    setError('');
    if (!hasChanges) {
      onClose();
      return;
    }
    setStep('preview');
  }

  function handleBack() {
    setError('');
    setStep('plan');
  }

  return (
    <Modal
      title={step === 'preview' ? 'Aperçu du plan' : 'Plan de la ligne'}
      onClose={loading ? undefined : onClose}
      closeOnOverlay={false}
      isDirty={step === 'plan' && hasChanges}
      isLoading={loading}
      size="lg"
      footer={
        step === 'preview' ? (
          <>
            <button className="btn btn-secondary" onClick={handleBack} disabled={loading}>
              Retour
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Enregistrement…
                </>
              ) : (
                'Confirmer'
              )}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Annuler
            </button>
            <button
              className="btn btn-primary"
              onClick={handlePreview}
              disabled={loading || !hasChanges}
            >
              Aperçu
            </button>
          </>
        )
      }
    >
      {step === 'preview' ? (
        <div className="recap-list">
          <div className="recap-item">
            <div className="recap-title">Ordre des machines</div>
            <div className="recap-columns">
              <div className="recap-block">
                <div className="recap-label">Avant</div>
                <div>{formatOrder(line.machines.map(normalizeLineMachine))}</div>
              </div>
              <div className="recap-block">
                <div className="recap-label">Après</div>
                <div>{formatOrder(machines)}</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="plan-hint">Glissez pour réorganiser les machines de la SPI vers le four.</p>
          <div className="plan-list">
            {machines.map((machine, index) => (
              <div
                key={`${machine.machineId}-${index}`}
                className="plan-item"
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (dragIndex === null || dragIndex === index) return;
                  moveMachine(dragIndex, index);
                  setDragIndex(index);
                }}
              >
                <div className="plan-handle" aria-hidden="true">
                  ⋮⋮
                </div>
                <div className="plan-order">{index + 1}</div>
                <div className="plan-info">
                  <strong>{machine.machineId}</strong>
                  <div className="plan-meta">{machine.brand}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
