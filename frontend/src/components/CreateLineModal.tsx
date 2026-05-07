import { useState } from 'react';
import Modal from './Modal';
import LineForm, { EMPTY_LINE_FORM, LineFormData } from './LineForm';
import { checkLineConflicts, createLine } from '../api/lines';
import { ApiResponseError } from '../api/client';
import { LineMachine, ProductionLine } from '../types';

interface CreateLineModalProps {
  onClose: () => void;
  onSuccess: (line: ProductionLine) => void;
}

export function validateLineForm(form: LineFormData): string {
  if (!form.lineNumber.trim()) return 'Le numéro de ligne est obligatoire.';
  if (form.machines.length < 1) return 'Ajoutez au moins une machine.';
  if (form.machines.length > 10) return 'Une ligne ne peut pas dépasser 10 machines.';

  const seenIds = new Set<string>();

  for (const [index, machine] of form.machines.entries()) {
    const label = `Machine ${index + 1}`;
    if (!machine.machineId.trim()) return `${label} : l'ID machine est obligatoire.`;
    const normalizedId = machine.machineId.trim().toLowerCase();
    if (seenIds.has(normalizedId)) return `${label} : l'ID machine est déjà utilisé.`;
    seenIds.add(normalizedId);
    if (!machine.brand.trim()) return `${label} : la marque est obligatoire.`;
    if (machine.hasDoubleRobot) {
      if (!machine.leftRobotNumber.trim()) return `${label} : le robot gauche est obligatoire.`;
      if (!machine.rightRobotNumber.trim()) return `${label} : le robot droit est obligatoire.`;
      if (machine.leftRobotHeads < 1 || machine.rightRobotHeads < 1) {
        return `${label} : le nombre de têtes doit être positif.`;
      }
    } else if (!machine.robotNumber.trim()) {
      return `${label} : le numéro de robot est obligatoire.`;
    } else if (machine.robotHeads < 1) {
      return `${label} : le nombre de têtes doit être positif.`;
    }
  }

  return '';
}

export function normalizeLineMachine(machine: LineMachine): LineMachine {
  if (machine.hasDoubleRobot) {
    return {
      ...machine,
      machineId: machine.machineId.trim(),
      brand: machine.brand.trim(),
      leftRobotNumber: machine.leftRobotNumber.trim(),
      rightRobotNumber: machine.rightRobotNumber.trim(),
    };
  }

  return {
    ...machine,
    machineId: machine.machineId.trim(),
    brand: machine.brand.trim(),
    robotNumber: machine.robotNumber.trim(),
    robotHeads: machine.robotHeads,
  };
}

export default function CreateLineModal({ onClose, onSuccess }: CreateLineModalProps) {
  const [form, setForm] = useState<LineFormData>(EMPTY_LINE_FORM);
  const [error, setError] = useState('');
  const [lineError, setLineError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'preview'>('form');

  async function handlePreview() {
    setError('');
    setLineError('');
    setFieldError('');

    const issues: string[] = [];

    if (!form.lineNumber.trim()) issues.push('Le numéro de ligne est obligatoire.');
    if (form.machines.length < 1) issues.push('Ajoutez au moins une machine.');
    if (form.machines.length > 10) issues.push('Une ligne ne peut pas dépasser 10 machines.');

    form.machines.forEach((machine, index) => {
      const label = `Machine ${index + 1}`;
      if (!machine.machineId.trim()) issues.push(`${label} : l'ID machine est obligatoire.`);
      if (!machine.brand.trim()) issues.push(`${label} : la marque est obligatoire.`);
      if (machine.hasDoubleRobot) {
        if (!machine.leftRobotNumber.trim()) issues.push(`${label} : le robot gauche est obligatoire.`);
        if (!machine.rightRobotNumber.trim()) issues.push(`${label} : le robot droit est obligatoire.`);
        if (machine.leftRobotHeads < 1 || machine.rightRobotHeads < 1) {
          issues.push(`${label} : le nombre de têtes doit être positif.`);
        }
      } else {
        if (!machine.robotNumber.trim()) issues.push(`${label} : le numéro de robot est obligatoire.`);
        if (machine.robotHeads < 1) issues.push(`${label} : le nombre de têtes doit être positif.`);
      }
    });

    if (issues.length > 1) {
      setError('Merci de compléter les champs obligatoires.');
      return;
    }
    if (issues.length === 1) {
      setFieldError(issues[0]);
      return;
    }

    setLoading(true);
    try {
      const machineIds = form.machines.map((machine) => machine.machineId.trim()).filter(Boolean);
      const conflicts = await checkLineConflicts({
        lineNumber: form.lineNumber.trim(),
        machineIds,
      });
      if (conflicts.lineExists) {
        setLineError('Ce numéro de ligne existe déjà.');
        return;
      }
      if (conflicts.machineConflicts.length > 0) {
        setError(`ID machine déjà utilisé : ${conflicts.machineConflicts.join(', ')}`);
        return;
      }
      setStep('preview');
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : 'Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    setError('');
    setLineError('');
    setFieldError('');

    setLoading(true);
    try {
      const line = await createLine({
        lineNumber: form.lineNumber.trim(),
        machines: form.machines.map(normalizeLineMachine),
      });
      onSuccess(line);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : 'Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setError('');
    setLineError('');
    setStep('form');
  }

  return (
    <Modal
      title={step === 'preview' ? 'Aperçu de la ligne' : 'Ajouter une ligne'}
      onClose={loading ? undefined : onClose}
      closeOnOverlay={false}
      footer={
        step === 'preview' ? (
          <>
            <button className="btn btn-secondary" onClick={handleBack} disabled={loading}>
              Retour
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? <><span className="spinner" /> Création…</> : 'Confirmer la création'}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={handlePreview} disabled={loading}>
              Aperçu
            </button>
          </>
        )
      }
    >
      {step === 'preview' ? (
        <div className="detail-grid">
          <div className="detail-field">
            <span className="detail-field-label">Numéro de ligne</span>
            <span className="detail-field-value">{form.lineNumber}</span>
          </div>
          <div className="detail-field">
            <span className="detail-field-label">Machines</span>
            <span className="detail-field-value">{form.machines.length}</span>
          </div>
          <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
            <span className="detail-field-label">Liste des machines</span>
            <span className="detail-field-value">
              {form.machines.map((machine) => machine.machineId || '-').join(', ')}
            </span>
          </div>
        </div>
      ) : (
        <>
          <LineForm
            data={form}
            onChange={(next) => {
              if (next.lineNumber !== form.lineNumber) setLineError('');
              if (fieldError) setFieldError('');
              setForm(next);
            }}
            disabled={loading}
            lineError={lineError}
          />
          {fieldError && <div className="error-message">{fieldError}</div>}
          {error && <div className="error-message">{error}</div>}
        </>
      )}
      {error && step === 'preview' && <div className="error-message">{error}</div>}
    </Modal>
  );
}
