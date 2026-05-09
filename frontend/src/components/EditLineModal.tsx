import { useState } from 'react';
import Modal from './Modal';
import LineForm, { LineFormData } from './LineForm';
import { ProductionLine } from '../types';
import { normalizeLineMachine, validateLineForm } from './CreateLineModal';
import EditLineSummaryModal from './EditLineSummaryModal';

interface EditLineModalProps {
  line: ProductionLine;
  onClose: () => void;
  onSuccess: (line: ProductionLine) => void;
}

function lineToForm(line: ProductionLine): LineFormData {
  return {
    lineNumber: line.line_number,
    isActive: line.is_active,
    machines: line.machines,
  };
}

export default function EditLineModal({ line, onClose, onSuccess }: EditLineModalProps) {
  const [form, setForm] = useState<LineFormData>(lineToForm(line));
  const [error, setError] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const normalizedMachines = form.machines.map(normalizeLineMachine);
  const isDirty =
    form.lineNumber.trim() !== line.line_number ||
    form.isActive !== line.is_active ||
    JSON.stringify(line.machines) !== JSON.stringify(normalizedMachines);

  function handleSubmit() {
    setError('');
    const noChanges =
      form.lineNumber.trim() === line.line_number &&
      form.isActive === line.is_active &&
      JSON.stringify(line.machines) === JSON.stringify(normalizedMachines);
    if (noChanges) {
      onClose();
      return;
    }
    const validationError = validateLineForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setShowSummary(true);
  }

  if (showSummary) {
    return (
      <EditLineSummaryModal
        line={line}
        form={form}
        onBack={() => setShowSummary(false)}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
  }

  return (
    <Modal
      title="Modifier la ligne"
      onClose={onClose}
      closeOnOverlay={false}
      isDirty={isDirty}
      size="lg"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            Confirmer
          </button>
        </>
      }
    >
      <LineForm data={form} onChange={setForm} showStatus />
      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
