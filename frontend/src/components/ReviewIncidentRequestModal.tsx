import { useMemo } from 'react';
import Modal from './Modal';
import { IncidentShift, IncidentState, ProductionLine, WorkshopIncident } from '../types';

interface ChangeRow {
  label: string;
  current: string;
  requested: string;
}

interface ReviewIncidentRequestModalProps {
  incident: WorkshopIncident;
  lines: ProductionLine[];
  type: 'edit' | 'delete';
  loading: boolean;
  error: string;
  allowDeleteApproval?: boolean;
  allowDeleteReject?: boolean;
  deleteApprovalDisabled?: boolean;
  deleteWarning?: string;
  allowEditApply?: boolean;
  allowEditReject?: boolean;
  editDisabled?: boolean;
  editWarning?: string;
  onClose: () => void;
  onApplyEdit: () => void;
  onRejectEdit: () => void;
  onApproveDelete: () => void;
  onRejectDelete: () => void;
}

const SHIFT_LABELS: Record<IncidentShift, string> = {
  MATIN: 'Matin',
  APRES_MIDI: 'Après midi',
  NUIT: 'Nuit',
  WEEKEND: 'Weekend',
};

const STATE_LABELS: Record<IncidentState, string> = {
  SKIPEE_PAR_MACHINE: 'Skipée par machine',
  SKIPEE_PAR_CONDUCTEUR: 'Skipée par conducteur',
  DEGRADEE: 'Dégradée',
  INDISPONIBLE: 'Indisponible',
  AUTRE: 'Autre',
};

function formatValue(value: string | null | undefined): string {
  if (!value) return '-';
  return value;
}

function findLine(lines: ProductionLine[], lineId?: number) {
  if (!lineId) return undefined;
  return lines.find((line) => line.id === lineId);
}

function formatLineLabel(lines: ProductionLine[], lineId?: number): string {
  const line = findLine(lines, lineId);
  return line ? line.line_number : lineId ? String(lineId) : '-';
}

function formatMachineLabel(lines: ProductionLine[], lineId: number | undefined, machineId?: string): string {
  if (!machineId) return '-';
  const line = findLine(lines, lineId);
  const machine = line?.machines.find((item) => item.machineId === machineId);
  if (!machine) return machineId;
  return `${machine.machineId} · ${machine.brand}`;
}

export default function ReviewIncidentRequestModal({
  incident,
  lines,
  type,
  loading,
  error,
  allowDeleteApproval = true,
  allowDeleteReject = true,
  deleteApprovalDisabled = false,
  deleteWarning,
  allowEditApply = true,
  allowEditReject = true,
  editDisabled = false,
  editWarning,
  onClose,
  onApplyEdit,
  onRejectEdit,
  onApproveDelete,
  onRejectDelete,
}: ReviewIncidentRequestModalProps) {
  const requested = useMemo(() => {
    if (!incident.edit_request || typeof incident.edit_request !== 'object') return null;
    return incident.edit_request as Record<string, unknown>;
  }, [incident.edit_request]);

  const changeRows = useMemo<ChangeRow[]>(() => {
    if (!requested) return [];

    const rows: ChangeRow[] = [];
    const requestedShift = requested.shift as IncidentShift | undefined;
    const requestedLineId = requested.lineId as number | undefined;
    const requestedMachineId = requested.machineId as string | undefined;
    const requestedRobotLabel = requested.robotLabel as string | undefined;
    const requestedHeadNumber = requested.headNumber as number | undefined;
    const requestedState = requested.state as IncidentState | undefined;
    const requestedComment = requested.comment as string | undefined;
    const requestedProduct = requested.currentProduct as string | undefined;

    if (requestedShift && requestedShift !== incident.shift) {
      rows.push({
        label: 'Équipe',
        current: SHIFT_LABELS[incident.shift],
        requested: SHIFT_LABELS[requestedShift] || requestedShift,
      });
    }

    if (requestedLineId && requestedLineId !== incident.line_id) {
      rows.push({
        label: 'Ligne',
        current: formatLineLabel(lines, incident.line_id),
        requested: formatLineLabel(lines, requestedLineId),
      });
    }

    if (requestedMachineId && requestedMachineId !== incident.machine_id) {
      const lineId = requestedLineId ?? incident.line_id;
      rows.push({
        label: 'Machine',
        current: formatMachineLabel(lines, incident.line_id, incident.machine_id),
        requested: formatMachineLabel(lines, lineId, requestedMachineId),
      });
    }

    if (requestedRobotLabel && requestedRobotLabel !== incident.robot_label) {
      rows.push({
        label: 'Robot',
        current: incident.robot_label,
        requested: requestedRobotLabel,
      });
    }

    if (requestedHeadNumber && requestedHeadNumber !== incident.head_number) {
      rows.push({
        label: 'Tête',
        current: String(incident.head_number),
        requested: String(requestedHeadNumber),
      });
    }

    if (requestedState && requestedState !== incident.state) {
      rows.push({
        label: 'État',
        current: STATE_LABELS[incident.state],
        requested: STATE_LABELS[requestedState] || requestedState,
      });
    }

    if (requestedProduct !== undefined && requestedProduct !== (incident.current_product || '')) {
      rows.push({
        label: 'Produit en cours',
        current: formatValue(incident.current_product || ''),
        requested: formatValue(requestedProduct),
      });
    }

    if (requestedComment !== undefined && requestedComment !== (incident.comment || '')) {
      rows.push({
        label: 'Commentaire',
        current: formatValue(incident.comment || ''),
        requested: formatValue(requestedComment),
      });
    }

    return rows;
  }, [incident, lines, requested]);

  const footer = type === 'edit' ? (
    <>
      {allowEditReject && (
        <button className="btn btn-secondary" onClick={onRejectEdit} disabled={loading || editDisabled}>
          Refuser
        </button>
      )}
      {allowEditApply && (
        <button className="btn btn-primary" onClick={onApplyEdit} disabled={loading || editDisabled}>
          {loading ? 'Application…' : 'Appliquer'}
        </button>
      )}
    </>
  ) : (
    <>
      {allowDeleteReject && (
        <button className="btn btn-secondary" onClick={onRejectDelete} disabled={loading}>
          Refuser
        </button>
      )}
      {allowDeleteApproval && (
        <button
          className="btn btn-danger"
          onClick={onApproveDelete}
          disabled={loading || deleteApprovalDisabled}
        >
          {loading ? 'Suppression…' : 'Supprimer'}
        </button>
      )}
    </>
  );

  return (
    <Modal
      title={type === 'edit' ? 'Demande de modification' : 'Demande de suppression'}
      onClose={loading ? undefined : onClose}
      footer={footer}
    >
      <div className="detail-grid">
        <div className="detail-field">
          <span className="detail-field-label">Incident</span>
          <span className="detail-field-value">
            {incident.line_number} · {incident.machine_id}
          </span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">Utilisateur</span>
          <span className="detail-field-value">
            {incident.first_name} {incident.last_name}
          </span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">Équipe</span>
          <span className="detail-field-value">{SHIFT_LABELS[incident.shift]}</span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">État</span>
          <span className="detail-field-value">{STATE_LABELS[incident.state]}</span>
        </div>
      </div>

      {type === 'delete' && (
        <>
          <div className="notice">
            <strong>Motif :</strong> {incident.delete_request_reason || 'Non renseigné'}
          </div>
          {deleteWarning && (
            <div className="notice" style={{ marginTop: 12 }}>{deleteWarning}</div>
          )}
          {deleteApprovalDisabled && (
            <div className="notice" style={{ marginTop: 12 }}>
              Suppression impossible apres prise en charge.
            </div>
          )}
        </>
      )}

      {type === 'edit' && editWarning && (
        <div className="notice" style={{ marginTop: 12 }}>{editWarning}</div>
      )}

      {type === 'edit' && (
        <div className="table-wrapper">
          <table className="change-table">
            <tbody>
              {changeRows.length === 0 ? (
                <tr>
                  <td colSpan={3}>Aucune modification détectée.</td>
                </tr>
              ) : (
                changeRows.map((row) => (
                  <tr key={row.label}>
                    <td><strong>{row.label}</strong></td>
                    <td>{row.current}</td>
                    <td>{row.requested}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
