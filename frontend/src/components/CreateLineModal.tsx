import { useState } from 'react';
import Modal from './Modal';
import LineForm, { EMPTY_LINE_FORM, LineFormData } from './LineForm';
import { checkLineConflicts, createLine } from '../api/lines';
import { apiErrorMessage } from '../api/errorMessages';
import { ProductionLine } from '../types';
import DetailField from './ui/DetailField';
import ErrorBanner from './ui/ErrorBanner';
import Spinner from './ui/Spinner';
import { normalizeLineMachine, validateLineForm } from '../utils/lineMachines';
import { useMutationRunner } from './ui/MutationFeedback';

interface CreateLineModalProps {
  onClose: () => void;
  onSuccess: (line: ProductionLine) => void;
}

export default function CreateLineModal({ onClose, onSuccess }: CreateLineModalProps) {
  const [form, setForm] = useState<LineFormData>(EMPTY_LINE_FORM);
  const [error, setError] = useState('');
  const [lineError, setLineError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [checking, setChecking] = useState(false);
  const mutation = useMutationRunner();
  const mutationPending = mutation.isPending('admin:line:create');
  const loading = checking || mutationPending;
  const [step, setStep] = useState<'form' | 'preview'>('form');

  async function handlePreview() {
    setError('');
    setLineError('');
    setFieldError('');

    const issues = validateLineForm(form);

    if (issues.length > 1) {
      setError('Merci de compléter les champs obligatoires.');
      return;
    }
    if (issues.length === 1) {
      setFieldError(issues[0]);
      return;
    }

    setChecking(true);
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
      setError(apiErrorMessage(err, 'Une erreur inattendue est survenue.'));
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit() {
    setError('');
    setLineError('');
    setFieldError('');

    await mutation.execute(
      () =>
        createLine({
          lineNumber: form.lineNumber.trim(),
          machines: form.machines.map(normalizeLineMachine),
        }),
      {
        key: 'admin:line:create',
        successMessage: 'Ligne créée.',
        errorPresentation: 'local',
        toErrorMessage: (err) => apiErrorMessage(err, 'Une erreur inattendue est survenue.'),
        onSuccess,
        onError: (_err, safeMessage) => setError(safeMessage),
      }
    );
  }

  function handleBack() {
    setError('');
    setLineError('');
    setStep('form');
  }

  const isDirty =
    step === 'form' &&
    (form.lineNumber.trim() !== '' ||
      form.machines.length !== EMPTY_LINE_FORM.machines.length ||
      JSON.stringify(form.machines) !== JSON.stringify(EMPTY_LINE_FORM.machines));

  return (
    <Modal
      title={step === 'preview' ? 'Aperçu de la ligne' : 'Ajouter une ligne'}
      onClose={loading ? undefined : onClose}
      closeOnOverlay={false}
      isDirty={isDirty}
      isLoading={loading}
      size="lg"
      footer={
        step === 'preview' ? (
          <>
            <button className="btn btn-secondary" onClick={handleBack} disabled={loading}>
              Retour
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <>
                  <Spinner /> Création…
                </>
              ) : (
                'Confirmer la création'
              )}
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
          <DetailField label="Numéro de ligne">{form.lineNumber}</DetailField>
          <DetailField label="Machines">{form.machines.length}</DetailField>
          <DetailField label="Liste des machines" style={{ gridColumn: '1 / -1' }}>
            {form.machines.map((machine) => machine.machineId || '-').join(', ')}
          </DetailField>
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
          {fieldError && <ErrorBanner>{fieldError}</ErrorBanner>}
          {error && <ErrorBanner>{error}</ErrorBanner>}
        </>
      )}
      {error && step === 'preview' && <ErrorBanner>{error}</ErrorBanner>}
    </Modal>
  );
}
