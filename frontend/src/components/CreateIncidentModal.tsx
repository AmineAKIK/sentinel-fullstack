import { useMemo, useState } from 'react';
import Modal from './Modal';
import SelectField from './ui/SelectField';
import CharCounter from './ui/CharCounter';
import { createWorkshopIncident, updateWorkshopIncident } from '../api/workshop';
import { translateApiError } from '../api/errorMessages';
import { useMutationRunner } from './ui/MutationFeedback';
import { IncidentState, ProductionLine, WorkshopIncident } from '../types';
import { getRobotOptions } from '../utils/lineMachines';
import { FIELD_LIMITS } from '../utils/fieldLimits';
import { STATE_LABELS } from '../utils/labels';
import { WORKSHOP_MUTATION_KEYS } from '../utils/workshopMutationKeys';

interface CreateIncidentModalProps {
  lines: ProductionLine[];
  incident?: WorkshopIncident;
  requestOnly?: boolean;
  onClose: () => void;
  onSuccess: (incident: WorkshopIncident) => void;
}

const STATES: { value: IncidentState; label: string }[] = [
  { value: 'SKIPEE_PAR_MACHINE', label: STATE_LABELS.SKIPEE_PAR_MACHINE },
  { value: 'SKIPEE_PAR_CONDUCTEUR', label: STATE_LABELS.SKIPEE_PAR_CONDUCTEUR },
  { value: 'DEGRADEE', label: STATE_LABELS.DEGRADEE },
  { value: 'INDISPONIBLE', label: STATE_LABELS.INDISPONIBLE },
];

export default function CreateIncidentModal({
  lines,
  incident,
  requestOnly,
  onClose,
  onSuccess,
}: CreateIncidentModalProps) {
  const mutation = useMutationRunner();
  const hasLineReferences = lines.length > 0;
  const [lineId, setLineId] = useState(incident ? String(incident.line_id) : '');
  const [machineId, setMachineId] = useState(incident?.machine_id || '');
  const [robotLabel, setRobotLabel] = useState(incident?.robot_label || '');
  const [headNumber, setHeadNumber] = useState(incident ? String(incident.head_number) : '');
  const [state, setState] = useState<IncidentState | ''>(incident?.state || '');
  const [comment, setComment] = useState(incident?.comment || '');
  const [currentProduct, setCurrentProduct] = useState(incident?.current_product || '');
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const isEditing = Boolean(incident);
  const mutationKey = requestOnly
    ? WORKSHOP_MUTATION_KEYS.REQUEST_EDIT
    : isEditing
      ? WORKSHOP_MUTATION_KEYS.EDIT
      : WORKSHOP_MUTATION_KEYS.CREATE;
  const isPending = mutation.isPending(mutationKey);
  const successMessage = requestOnly
    ? 'Demande de correction envoyée.'
    : isEditing
      ? 'Modification appliquée.'
      : 'Incident signalé.';
  const pendingLabel = requestOnly ? 'Envoi de la demande…' : 'Enregistrement…';

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
      setError("Aucune ligne active n'est disponible.");
      return false;
    }
    if (!lineId || !machineId || !robotLabel || !headNumber || !state || !currentProduct.trim()) {
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

    const selectedState = state as IncidentState;
    setError('');

    const payload = {
      lineId: Number(lineId),
      machineId,
      robotLabel,
      headNumber: Number(headNumber),
      state: selectedState,
      comment: comment.trim(),
      currentProduct: currentProduct.trim(),
      requestOnly,
    };
    const result = await mutation.execute(
      () =>
        incident ? updateWorkshopIncident(incident.id, payload) : createWorkshopIncident(payload),
      {
        key: mutationKey,
        successMessage,
        toErrorMessage: translateApiError,
        errorPresentation: 'local',
        onError: (_requestError, safeMessage) => {
          // L'erreur reste près du formulaire ; aucune saisie n'est réinitialisée.
          setError(safeMessage);
        },
      }
    );

    if (result.status === 'success') {
      onSuccess(result.value);
    }
  }

  const isDirty =
    !showPreview &&
    (lineId !== (incident ? String(incident.line_id) : '') ||
      machineId !== (incident?.machine_id || '') ||
      robotLabel !== (incident?.robot_label || '') ||
      headNumber !== (incident ? String(incident.head_number) : '') ||
      state !== (incident?.state || '') ||
      comment !== (incident?.comment || '') ||
      currentProduct !== (incident?.current_product || ''));

  return (
    <Modal
      title={
        showPreview
          ? "Aperçu de l'incident"
          : incident
            ? "Modifier l'incident"
            : 'Créer un incident'
      }
      onClose={isPending ? undefined : onClose}
      closeOnOverlay={false}
      isDirty={isDirty}
      isLoading={isPending}
      size="lg"
      footer={
        showPreview ? (
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setShowPreview(false)}
              disabled={isPending}
            >
              Retour
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={isPending}>
              {isPending ? (
                <>
                  <span className="spinner" aria-hidden="true" /> {pendingLabel}
                </>
              ) : isEditing ? (
                'Valider la modification'
              ) : (
                'Valider la création'
              )}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={onClose} disabled={isPending}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={handlePreview} disabled={isPending}>
              Aperçu
            </button>
          </>
        )
      }
    >
      {showPreview ? (
        <>
          <div className="table-wrapper">
            <table className="change-table change-table--rows">
              <tbody>
                <tr>
                  <th scope="row">Ligne</th>
                  <td>{selectedLine?.line_number}</td>
                </tr>
                <tr>
                  <th scope="row">Machine</th>
                  <td>
                    {selectedMachine?.machineId} - {selectedMachine?.brand}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Robot</th>
                  <td>{robotLabel}</td>
                </tr>
                <tr>
                  <th scope="row">Tête</th>
                  <td>{headNumber}</td>
                </tr>
                <tr>
                  <th scope="row">État</th>
                  <td>{STATES.find((item) => item.value === state)?.label}</td>
                </tr>
                <tr>
                  <th scope="row">Produit en cours</th>
                  <td>{currentProduct.trim() || '-'}</td>
                </tr>
                <tr>
                  <th scope="row">Commentaire</th>
                  <td>{comment.trim() || '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {error && (
            <div id="create-incident-error-preview" className="error-message" role="alert">
              {error}
            </div>
          )}
        </>
      ) : (
        <>
          {!hasLineReferences && (
            <div className="error-message" style={{ marginBottom: 12 }}>
              Aucune ligne active n'est disponible. Créez ou activez une ligne dans l’administration
              avant de déclarer un incident.
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="incidentLine">
              Ligne *
            </label>
            <SelectField
              id="incidentLine"
              value={lineId}
              onChange={(value) => {
                setLineId(value);
                setMachineId('');
                setRobotLabel('');
                setHeadNumber('');
              }}
              disabled={isPending || !hasLineReferences}
              ariaLabel="Ligne"
              options={[
                {
                  value: '',
                  label: hasLineReferences ? 'Sélectionner une ligne' : 'Aucune ligne active',
                },
                ...lines.map((line) => ({ value: String(line.id), label: line.line_number })),
              ]}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="incidentMachine">
              Machine *
            </label>
            <SelectField
              id="incidentMachine"
              value={machineId}
              onChange={(value) => {
                setMachineId(value);
                setRobotLabel('');
                setHeadNumber('');
              }}
              disabled={isPending || !selectedLine}
              ariaLabel="Machine"
              options={[
                {
                  value: '',
                  label: selectedLine ? 'Sélectionner une machine' : 'Choisir une ligne d’abord',
                },
                ...(selectedLine?.machines.map((machine) => ({
                  value: machine.machineId,
                  label: `${machine.machineId} · ${machine.brand}`,
                })) ?? []),
              ]}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="incidentRobot">
              Robot *
            </label>
            <SelectField
              id="incidentRobot"
              value={robotLabel}
              onChange={(value) => {
                setRobotLabel(value);
                setHeadNumber('');
              }}
              disabled={isPending || !selectedMachine}
              ariaLabel="Robot"
              options={[
                {
                  value: '',
                  label: selectedMachine ? 'Sélectionner un robot' : 'Choisir une machine d’abord',
                },
                ...robots.map((robot) => ({ value: robot.label, label: robot.label })),
              ]}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="incidentHead">
              Tête *
            </label>
            <SelectField
              id="incidentHead"
              value={headNumber}
              onChange={setHeadNumber}
              disabled={isPending || !selectedRobot}
              ariaLabel="Tête"
              options={[
                {
                  value: '',
                  label: selectedRobot ? 'Sélectionner une tête' : 'Choisir un robot d’abord',
                },
                ...heads.map((head) => ({ value: String(head), label: String(head) })),
              ]}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="incidentState">
              État *
            </label>
            <SelectField
              id="incidentState"
              value={state}
              onChange={(value) => setState(value as IncidentState)}
              disabled={isPending}
              ariaLabel="État"
              options={[
                { value: '', label: 'Sélectionner un état' },
                ...STATES.map((item) => ({ value: item.value, label: item.label })),
              ]}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="incidentComment">
              Commentaire
            </label>
            <textarea
              id="incidentComment"
              className="form-input"
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, FIELD_LIMITS.COMMENT))}
              disabled={isPending}
              rows={3}
              maxLength={FIELD_LIMITS.COMMENT}
              placeholder="Ajouter un commentaire"
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'create-incident-error' : undefined}
            />
            <CharCounter current={comment.length} max={FIELD_LIMITS.COMMENT} />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="incidentProduct">
              Produit en cours *
            </label>
            <input
              id="incidentProduct"
              className="form-input"
              value={currentProduct}
              onChange={(e) => setCurrentProduct(e.target.value)}
              disabled={isPending}
              maxLength={FIELD_LIMITS.PRODUCT}
              placeholder="Référence produit"
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'create-incident-error' : undefined}
            />
          </div>

          {error && (
            <div id="create-incident-error" className="error-message" role="alert">
              {error}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
