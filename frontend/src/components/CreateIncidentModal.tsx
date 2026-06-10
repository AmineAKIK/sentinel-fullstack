import { useMemo, useState } from 'react';
import Modal from './Modal';
import SelectField from './ui/SelectField';
import { createWorkshopIncident, updateWorkshopIncident } from '../api/workshop';
import { ApiResponseError } from '../api/client';
import {
  IncidentShift,
  IncidentState,
  ProductionLine,
  WorkshopIncident,
} from '../types';
import { getRobotOptions } from '../utils/lineMachines';

interface CreateIncidentModalProps {
  lines: ProductionLine[];
  incident?: WorkshopIncident;
  requestOnly?: boolean;
  onClose: () => void;
  onSuccess: (incident: WorkshopIncident) => void;
}

const SHIFTS: { value: IncidentShift; label: string }[] = [
  { value: 'MATIN', label: 'Matin' },
  { value: 'APRES_MIDI', label: 'Après midi' },
  { value: 'NUIT', label: 'Nuit' },
  { value: 'WEEKEND', label: 'Weekend' },
];

const STATES: { value: IncidentState; label: string }[] = [
  { value: 'SKIPEE_PAR_MACHINE', label: 'Skipée par machine' },
  { value: 'SKIPEE_PAR_CONDUCTEUR', label: 'Skipée par conducteur' },
  { value: 'DEGRADEE', label: 'Dégradée' },
  { value: 'INDISPONIBLE', label: 'Indisponible' },
];

export default function CreateIncidentModal({
  lines,
  incident,
  requestOnly,
  onClose,
  onSuccess,
}: CreateIncidentModalProps) {
  const hasLineReferences = lines.length > 0;
  const [shift, setShift] = useState<IncidentShift | ''>(incident?.shift || '');
  const [lineId, setLineId] = useState(incident ? String(incident.line_id) : '');
  const [machineId, setMachineId] = useState(incident?.machine_id || '');
  const [robotLabel, setRobotLabel] = useState(incident?.robot_label || '');
  const [headNumber, setHeadNumber] = useState(incident ? String(incident.head_number) : '');
  const [state, setState] = useState<IncidentState | ''>(incident?.state || '');
  const [comment, setComment] = useState(incident?.comment || '');
  const [currentProduct, setCurrentProduct] = useState(incident?.current_product || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const selectedLine = useMemo(
    () => lines.find((line) => String(line.id) === lineId),
    [lines, lineId]
  );
  const selectedMachine = selectedLine?.machines.find((machine) => machine.machineId === machineId);
  const robots = selectedMachine ? getRobotOptions(selectedMachine) : [];
  const selectedRobot = robots.find((robot) => robot.label === robotLabel);
  const heads = selectedRobot ? Array.from({ length: selectedRobot.heads }, (_, i) => i + 1) : [];

  function validate(): boolean {
    setError('');
    if (!hasLineReferences) {
      setError("Aucune ligne active n'est disponible dans le référentiel.");
      return false;
    }
    if (!shift || !lineId || !machineId || !robotLabel || !headNumber || !state) {
      setError('Veuillez renseigner tous les champs obligatoires.');
      return false;
    }
    return true;
  }

  function handlePreview() {
    if (validate()) setShowPreview(true);
  }

  async function handleSubmit() {
    if (!validate()) return;

    const selectedShift = shift as IncidentShift;
    const selectedState = state as IncidentState;

    setLoading(true);
    try {
      const payload = {
        shift: selectedShift,
        lineId: Number(lineId),
        machineId,
        robotLabel,
        headNumber: Number(headNumber),
        state: selectedState,
        comment: comment.trim(),
        currentProduct: currentProduct.trim(),
        requestOnly,
      };
      const saved = incident
        ? await updateWorkshopIncident(incident.id, payload)
        : await createWorkshopIncident(payload);
      onSuccess(saved);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : 'Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
  }

  const isEditing = Boolean(incident);
  const isDirty = !showPreview && (
    shift !== (incident?.shift || '') ||
    lineId !== (incident ? String(incident.line_id) : '') ||
    machineId !== (incident?.machine_id || '') ||
    robotLabel !== (incident?.robot_label || '') ||
    headNumber !== (incident ? String(incident.head_number) : '') ||
    state !== (incident?.state || '') ||
    comment !== (incident?.comment || '') ||
    currentProduct !== (incident?.current_product || '')
  );

  return (
    <Modal
      title={showPreview ? "Aperçu de l'incident" : incident ? "Modifier l'incident" : 'Créer un incident'}
      onClose={loading ? undefined : onClose}
      closeOnOverlay={false}
      isDirty={isDirty}
      isLoading={loading}
      size="lg"
      footer={
        showPreview ? (
          <>
            <button className="btn btn-secondary" onClick={() => setShowPreview(false)} disabled={loading}>
              Retour
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? <><span className="spinner" aria-hidden="true" /> Enregistrement…</> : isEditing ? 'Valider la modification' : 'Valider la création'}
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
      {showPreview ? (
        <>
          <div className="table-wrapper">
            <table className="change-table">
              <tbody>
                <tr>
                  <td><strong>Équipe</strong></td>
                  <td>{SHIFTS.find((item) => item.value === shift)?.label}</td>
                </tr>
                <tr>
                  <td><strong>Ligne</strong></td>
                  <td>{selectedLine?.line_number}</td>
                </tr>
                <tr>
                  <td><strong>Machine</strong></td>
                  <td>{selectedMachine?.machineId} - {selectedMachine?.brand}</td>
                </tr>
                <tr>
                  <td><strong>Robot</strong></td>
                  <td>{robotLabel}</td>
                </tr>
                <tr>
                  <td><strong>Tête</strong></td>
                  <td>{headNumber}</td>
                </tr>
                <tr>
                  <td><strong>État</strong></td>
                  <td>{STATES.find((item) => item.value === state)?.label}</td>
                </tr>
                <tr>
                  <td><strong>Produit en cours</strong></td>
                  <td>{currentProduct.trim() || '-'}</td>
                </tr>
                <tr>
                  <td><strong>Commentaire</strong></td>
                  <td>{comment.trim() || '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {error && <div id="create-incident-error-preview" className="error-message" role="alert">{error}</div>}
        </>
      ) : (
        <>
      <div className={hasLineReferences ? 'notice' : 'error-message'} style={{ marginBottom: 12 }}>
        {hasLineReferences
          ? 'Ligne, machine, robot et tête proviennent du référentiel actif créé dans l’administration.'
          : "Aucune ligne active n'est disponible. Créez ou activez une ligne dans l’administration avant de déclarer un incident."}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="incidentShift">Équipe *</label>
        <SelectField
          id="incidentShift"
          value={shift}
          onChange={(value) => setShift(value as IncidentShift)}
          disabled={loading}
          ariaLabel="Équipe"
          options={[
            { value: '', label: '-- Sélectionner --' },
            ...SHIFTS.map((item) => ({ value: item.value, label: item.label })),
          ]}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="incidentLine">Ligne *</label>
        <SelectField
          id="incidentLine"
          value={lineId}
          onChange={(value) => {
            setLineId(value);
            setMachineId('');
            setRobotLabel('');
            setHeadNumber('');
          }}
          disabled={loading || !hasLineReferences}
          ariaLabel="Ligne"
          options={[
            { value: '', label: hasLineReferences ? '-- Ligne du référentiel --' : '-- Aucune ligne active --' },
            ...lines.map((line) => ({ value: String(line.id), label: line.line_number })),
          ]}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="incidentMachine">Machine *</label>
        <SelectField
          id="incidentMachine"
          value={machineId}
          onChange={(value) => {
            setMachineId(value);
            setRobotLabel('');
            setHeadNumber('');
          }}
          disabled={loading || !selectedLine}
          ariaLabel="Machine"
          options={[
            { value: '', label: selectedLine ? '-- Machine du référentiel --' : '-- Sélectionnez une ligne d’abord --' },
            ...(selectedLine?.machines.map((machine) => ({
              value: machine.machineId,
              label: `${machine.machineId} · ${machine.brand}`,
            })) ?? []),
          ]}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="incidentRobot">Robot *</label>
        <SelectField
          id="incidentRobot"
          value={robotLabel}
          onChange={(value) => {
            setRobotLabel(value);
            setHeadNumber('');
          }}
          disabled={loading || !selectedMachine}
          ariaLabel="Robot"
          options={[
            { value: '', label: selectedMachine ? '-- Robot du référentiel --' : '-- Sélectionnez une machine d’abord --' },
            ...robots.map((robot) => ({ value: robot.label, label: robot.label })),
          ]}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="incidentHead">Tête *</label>
        <SelectField
          id="incidentHead"
          value={headNumber}
          onChange={setHeadNumber}
          disabled={loading || !selectedRobot}
          ariaLabel="Tête"
          options={[
            { value: '', label: selectedRobot ? '-- Tête disponible --' : '-- Sélectionnez un robot d’abord --' },
            ...heads.map((head) => ({ value: String(head), label: String(head) })),
          ]}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="incidentState">État *</label>
        <SelectField
          id="incidentState"
          value={state}
          onChange={(value) => setState(value as IncidentState)}
          disabled={loading}
          ariaLabel="État"
          options={[
            { value: '', label: '-- Sélectionner --' },
            ...STATES.map((item) => ({ value: item.value, label: item.label })),
          ]}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="incidentComment">Commentaire</label>
        <textarea
          id="incidentComment"
          className="form-input"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={loading}
          rows={3}
          placeholder="Ajouter un commentaire"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? 'create-incident-error' : undefined}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="incidentProduct">Produit en cours</label>
        <input
          id="incidentProduct"
          className="form-input"
          value={currentProduct}
          onChange={(e) => setCurrentProduct(e.target.value)}
          disabled={loading}
          placeholder="Référence produit"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? 'create-incident-error' : undefined}
        />
      </div>

      {error && <div id="create-incident-error" className="error-message" role="alert">{error}</div>}
        </>
      )}
    </Modal>
  );
}
