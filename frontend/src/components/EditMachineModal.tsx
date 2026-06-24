import { useState } from 'react';
import Modal from './Modal';
import { LineMachine, ProductionLine } from '../types';
import { ApiResponseError } from '../api/client';
import { checkLineConflicts, updateLine } from '../api/lines';
import { FIELD_LIMITS } from '../utils/fieldLimits';
import ErrorBanner from './ui/ErrorBanner';
import Spinner from './ui/Spinner';
import {
  emptyToString,
  lineMachineEquals,
  machineRobotSummary,
  normalizeLineMachine,
  switchMachineRobotMode,
  validateMachineAgainstLine,
} from '../utils/lineMachines';

interface EditMachineModalProps {
  line: ProductionLine;
  machineIndex: number;
  onClose: () => void;
  onSuccess: (line: ProductionLine) => void;
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
      setForm(switchMachineRobotMode(form, Boolean(value)));
      return;
    }

    setForm({ ...form, [field]: value });
  }

  function validate(): string[] {
    return validateMachineAgainstLine(form, line.machines, machineIndex);
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

    // Filet de sécurité : rien n'a changé → on ne sollicite pas le serveur et
    // on ne ment pas avec un message de succès. Le bouton est déjà désactivé
    // dans ce cas ; cette garde couvre aussi l'appel clavier.
    if (!isDirty) {
      onClose();
      return;
    }

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

  const original = line.machines[machineIndex];
  const isDirty = !lineMachineEquals(form, original);

  // Récapitulatif « avant / après » : on montre ce qui change, pas seulement
  // l'état final — cohérent avec les autres écrans de modification.
  const changes: { label: string; before: string; after: string }[] = [];
  const originalNorm = normalizeLineMachine(original);
  const formNorm = normalizeLineMachine(form);
  if (originalNorm.machineId !== formNorm.machineId) {
    changes.push({ label: 'ID machine', before: originalNorm.machineId, after: formNorm.machineId });
  }
  if (originalNorm.brand !== formNorm.brand) {
    changes.push({ label: 'Marque', before: originalNorm.brand, after: formNorm.brand });
  }
  if (machineRobotSummary(originalNorm) !== machineRobotSummary(formNorm)) {
    changes.push({
      label: 'Configuration robot',
      before: machineRobotSummary(originalNorm),
      after: machineRobotSummary(formNorm),
    });
  }

  return (
    <Modal
      title={step === 'preview' ? 'Aperçu machine' : 'Modifier la machine'}
      onClose={loading ? undefined : handleClose}
      closeOnOverlay={false}
      isDirty={step === 'form' && isDirty}
      isLoading={loading}
      size="lg"
      footer={
        step === 'preview' ? (
          <>
            <button className="btn btn-secondary" onClick={handleBack} disabled={loading}>
              Retour
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={loading || !isDirty}>
              {loading ? <><Spinner /> Enregistrement…</> : 'Confirmer'}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={handleClose} disabled={loading}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={handlePreview} disabled={loading || !isDirty}>
              Aperçu
            </button>
          </>
        )
      }
    >
      {step === 'preview' ? (
        changes.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
            Aucune modification détectée.
          </p>
        ) : (
          <div className="recap-list">
            {changes.map((change) => (
              <div key={change.label} className="recap-item">
                <div className="recap-title">{change.label}</div>
                <div className="recap-columns">
                  <div className="recap-block">
                    <div className="recap-label">Avant</div>
                    <div>{change.before}</div>
                  </div>
                  <div className="recap-block">
                    <div className="recap-label">Après</div>
                    <div>{change.after}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
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
              maxLength={FIELD_LIMITS.MACHINE_ID}
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
              maxLength={FIELD_LIMITS.BRAND}
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
                <label className="form-label" htmlFor="leftRobotHeads">Nombre de têtes *</label>
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
                <label className="form-label" htmlFor="rightRobotHeads">Nombre de têtes *</label>
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
          {fieldError && <ErrorBanner>{fieldError}</ErrorBanner>}
          {error && <ErrorBanner>{error}</ErrorBanner>}
        </>
      )}
      {step === 'preview' && error && <ErrorBanner>{error}</ErrorBanner>}
    </Modal>
  );
}
