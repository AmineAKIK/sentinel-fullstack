import { useMemo, useState } from 'react';
import Modal from './Modal';
import { createWorkshopIncident, updateWorkshopIncident } from '../api/workshop';
import { ApiResponseError } from '../api/client';
import {
  IncidentShift,
  IncidentState,
  LineMachine,
  ProductionLine,
  WorkshopIncident,
} from '../types';

interface CreateIncidentModalProps {
  lines: ProductionLine[];
  incident?: WorkshopIncident;
  requestOnly?: boolean;
  onClose: () => void;
  onSuccess: (incident: WorkshopIncident) => void;
}

interface RobotOption {
  label: string;
  heads: number;
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

function robotOptions(machine?: LineMachine): RobotOption[] {
  if (!machine) return [];
  if (machine.hasDoubleRobot) {
    return [
      { label: `Gauche ${machine.leftRobotNumber}`, heads: machine.leftRobotHeads },
      { label: `Droite ${machine.rightRobotNumber}`, heads: machine.rightRobotHeads },
    ];
  }
  return [{ label: machine.robotNumber, heads: machine.robotHeads }];
}

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
  const robots = robotOptions(selectedMachine);
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
              {loading ? <><span className="spinner" /> Enregistrement…</> : isEditing ? 'Valider la modification' : 'Valider la création'}
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
          {error && <div className="error-message">{error}</div>}
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
        <select
          id="incidentShift"
          className="form-select"
          value={shift}
          onChange={(e) => setShift(e.target.value as IncidentShift)}
          disabled={loading}
        >
          <option value="">-- Sélectionner --</option>
          {SHIFTS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="incidentLine">Ligne *</label>
        <select
          id="incidentLine"
          className="form-select"
          value={lineId}
          onChange={(e) => {
            setLineId(e.target.value);
            setMachineId('');
            setRobotLabel('');
            setHeadNumber('');
          }}
          disabled={loading || !hasLineReferences}
        >
          <option value="">{hasLineReferences ? '-- Ligne du référentiel --' : '-- Aucune ligne active --'}</option>
          {lines.map((line) => (
            <option key={line.id} value={line.id}>{line.line_number}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="incidentMachine">Machine *</label>
        <select
          id="incidentMachine"
          className="form-select"
          value={machineId}
          onChange={(e) => {
            setMachineId(e.target.value);
            setRobotLabel('');
            setHeadNumber('');
          }}
          disabled={loading || !selectedLine}
        >
          <option value="">{selectedLine ? '-- Machine du référentiel --' : '-- Sélectionnez une ligne d’abord --'}</option>
          {selectedLine?.machines.map((machine) => (
            <option key={machine.machineId} value={machine.machineId}>
              {machine.machineId} · {machine.brand}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="incidentRobot">Robot *</label>
        <select
          id="incidentRobot"
          className="form-select"
          value={robotLabel}
          onChange={(e) => {
            setRobotLabel(e.target.value);
            setHeadNumber('');
          }}
          disabled={loading || !selectedMachine}
        >
          <option value="">{selectedMachine ? '-- Robot du référentiel --' : '-- Sélectionnez une machine d’abord --'}</option>
          {robots.map((robot) => (
            <option key={robot.label} value={robot.label}>{robot.label}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="incidentHead">Tête *</label>
        <select
          id="incidentHead"
          className="form-select"
          value={headNumber}
          onChange={(e) => setHeadNumber(e.target.value)}
          disabled={loading || !selectedRobot}
        >
          <option value="">{selectedRobot ? '-- Tête disponible --' : '-- Sélectionnez un robot d’abord --'}</option>
          {heads.map((head) => (
            <option key={head} value={head}>{head}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="incidentState">État *</label>
        <select
          id="incidentState"
          className="form-select"
          value={state}
          onChange={(e) => setState(e.target.value as IncidentState)}
          disabled={loading}
        >
          <option value="">-- Sélectionner --</option>
          {STATES.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
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
        />
      </div>

      {error && <div className="error-message">{error}</div>}
        </>
      )}
    </Modal>
  );
}
