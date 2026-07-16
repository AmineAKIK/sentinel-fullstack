import { useState } from 'react';
import Modal from './Modal';
import LineForm, { LineFormData } from './LineForm';
import { ProductionLine } from '../types';
import { lineMachinesEqual, validateLineForm } from '../utils/lineMachines';
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
  const isDirty =
    form.lineNumber.trim() !== line.line_number ||
    form.isActive !== line.is_active ||
    !lineMachinesEqual(line.machines, form.machines);

  function handleSubmit() {
    setError('');
    // Rien n'a changé → on ferme sans afficher de confirmation mensongère.
    if (!isDirty) {
      onClose();
      return;
    }
    const validationIssues = validateLineForm(form);
    if (validationIssues.length > 0) {
      setError(
        validationIssues.length > 1
          ? 'Merci de compléter les champs obligatoires.'
          : validationIssues[0]
      );
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
