import { useState } from 'react';
import Modal from './Modal';
import { LineMachine, ProductionLine } from '../types';
import { ApiResponseError } from '../api/client';
import { checkLineConflicts, updateLine } from '../api/lines';
import { normalizeLineMachine } from './CreateLineModal';

interface EditMachineModalProps {
  line: ProductionLine;
  machineIndex: number;
  onClose: () => void;
  onSuccess: (line: ProductionLine) => void;
}

function emptyToString(value: number | undefined): string {
  if (!value) return '';
  return String(value);
}

export default function EditMachineModal({
  line,
  machineIndex,
  onClose,
  onSuccess,
}: EditMachineModalProps) {
  const [form, setForm] = useState<LineMachine>({ ...line.machines[machineIndex] });
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'preview'>('form');

  function updateField(field: string, value: string | number | boolean) {
    if (field === 'hasDoubleRobot') {
      const next: LineMachine = value
        ? {
            machineId: form.machineId,
            brand: form.brand,
            hasDoubleRobot: true,
            leftRobotNumber: '',
            leftRobotHeads: 0,
            rightRobotNumber: '',
            rightRobotHeads: 0,
          }
        : {
            machineId: form.machineId,
            brand: form.brand,
            hasDoubleRobot: false,
            robotNumber: '',
            robotHeads: 0,
          };
      setForm(next);
      return;
    }

    setForm({ ...form, [field]: value } as LineMachine);
  }

  function validate(): string[] {
    const issues: string[] = [];

    if (!form.machineId.trim()) issues.push('L\'ID machine est obligatoire.');
    if (!form.brand.trim()) issues.push('La marque est obligatoire.');

    if (form.hasDoubleRobot) {
      if (!form.leftRobotNumber.trim()) issues.push('Le robot gauche est obligatoire.');
      if (!form.rightRobotNumber.trim()) issues.push('Le robot droit est obligatoire.');
      if (form.leftRobotHeads < 1 || form.rightRobotHeads < 1) {
        issues.push('Le nombre de têtes doit être positif.');
      }
    } else {
      if (!form.robotNumber.trim()) issues.push('Le numéro de robot est obligatoire.');
      if (form.robotHeads < 1) issues.push('Le nombre de têtes doit être positif.');
    }

    const normalizedId = form.machineId.trim().toLowerCase();
    const duplicate = line.machines.some((machine, index) =>
      index !== machineIndex && machine.machineId.trim().toLowerCase() === normalizedId
    );
    if (duplicate) issues.push('L\'ID machine existe déjà sur cette ligne.');

    return issues;
  }

  async function handlePreview() {
    setError('');
    setFieldError('');

    const issues = validate();
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
      const nextMachines = line.machines.map((machine, index) =>
        index === machineIndex ? normalizeLineMachine(form) : machine
      );
      const machineIds = nextMachines.map((machine) => machine.machineId.trim()).filter(Boolean);
      const conflicts = await checkLineConflicts({
        lineNumber: line.line_number,
        machineIds,
        lineId: line.id,
      });

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

  async function handleSave() {
    setError('');
    setLoading(true);

    try {
      const updatedMachines = line.machines.map((machine, index) =>
        index === machineIndex ? normalizeLineMachine(form) : machine
      );
      const updated = await updateLine(line.id, {
        machines: updatedMachines,
      });
      onSuccess(updated);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : 'Une erreur inattendue est survenue.');
      setLoading(false);
    }
  }

  function handleBack() {
    setError('');
    setFieldError('');
    setStep('form');
  }

  function handleClose() {
    onClose();
  }

  return (
    <Modal
      title={step === 'preview' ? 'Aperçu machine' : 'Modifier la machine'}
      onClose={handleClose}
      closeOnOverlay={false}
      footer={
        step === 'preview' ? (
          <>
            <button className="btn btn-secondary" onClick={handleBack} disabled={loading}>
              Retour
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
              {loading ? <><span className="spinner" /> Enregistrement…</> : 'Confirmer'}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={handleClose} disabled={loading}>
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
            <span className="detail-field-label">ID machine</span>
            <span className="detail-field-value">{form.machineId}</span>
          </div>
          <div className="detail-field">
            <span className="detail-field-label">Marque</span>
            <span className="detail-field-value">{form.brand}</span>
          </div>
          <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
            <span className="detail-field-label">Configuration robot</span>
            <span className="detail-field-value">
              {form.hasDoubleRobot
                ? `Double robot · Gauche ${form.leftRobotNumber} (${form.leftRobotHeads} têtes) · Droite ${form.rightRobotNumber} (${form.rightRobotHeads} têtes)`
                : `Robot unique · ${form.robotNumber} (${form.robotHeads} têtes)`}
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="form-group">
            <label className="form-label" htmlFor="machineId">ID machine *</label>
            <input
              id="machineId"
              className="form-input"
              type="text"
              value={form.machineId}
              onChange={(e) => updateField('machineId', e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="brand">Marque *</label>
            <input
              id="brand"
              className="form-input"
              type="text"
              value={form.brand}
              onChange={(e) => updateField('brand', e.target.value)}
              disabled={loading}
            />
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.hasDoubleRobot}
              onChange={(e) => updateField('hasDoubleRobot', e.target.checked)}
              disabled={loading}
            />
            Machine à double robot
          </label>
          {form.hasDoubleRobot ? (
            <div className="line-machine-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="leftRobotNumber">Robot gauche *</label>
                <input
                  id="leftRobotNumber"
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={form.leftRobotNumber}
                  onChange={(e) => updateField('leftRobotNumber', e.target.value.replace(/\D/g, '').slice(0, 2))}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="leftRobotHeads">Têtes gauche *</label>
                <input
                  id="leftRobotHeads"
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={emptyToString(form.leftRobotHeads)}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, '').slice(0, 2);
                    updateField('leftRobotHeads', next === '' ? 0 : Number(next));
                  }}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="rightRobotNumber">Robot droit *</label>
                <input
                  id="rightRobotNumber"
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={form.rightRobotNumber}
                  onChange={(e) => updateField('rightRobotNumber', e.target.value.replace(/\D/g, '').slice(0, 2))}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="rightRobotHeads">Têtes droit *</label>
                <input
                  id="rightRobotHeads"
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={emptyToString(form.rightRobotHeads)}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, '').slice(0, 2);
                    updateField('rightRobotHeads', next === '' ? 0 : Number(next));
                  }}
                  disabled={loading}
                />
              </div>
            </div>
          ) : (
            <div className="line-machine-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="robotNumber">Numéro de robot *</label>
                <input
                  id="robotNumber"
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={form.robotNumber}
                  onChange={(e) => updateField('robotNumber', e.target.value.replace(/\D/g, '').slice(0, 2))}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="robotHeads">Nombre de têtes *</label>
                <input
                  id="robotHeads"
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={emptyToString(form.robotHeads)}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, '').slice(0, 2);
                    updateField('robotHeads', next === '' ? 0 : Number(next));
                  }}
                  disabled={loading}
                />
              </div>
            </div>
          )}
          {fieldError && <div className="error-message">{fieldError}</div>}
          {error && <div className="error-message">{error}</div>}
        </>
      )}
      {step === 'preview' && error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
