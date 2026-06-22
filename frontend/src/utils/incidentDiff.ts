import { IncidentState, ProductionLine, WorkshopIncident } from '../types';
import { STATE_LABELS } from './labels';

export interface ChangeRow {
  label: string;
  current: string;
  requested: string;
}

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

export function computeIncidentDiff(
  incident: WorkshopIncident,
  requested: Record<string, unknown>,
  lines: ProductionLine[]
): ChangeRow[] {
  const rows: ChangeRow[] = [];

  const requestedLineId = requested.lineId as number | undefined;
  const requestedMachineId = requested.machineId as string | undefined;
  const requestedRobotLabel = requested.robotLabel as string | undefined;
  const requestedHeadNumber = requested.headNumber as number | undefined;
  const requestedState = requested.state as IncidentState | undefined;
  const requestedComment = requested.comment as string | undefined;
  const requestedProduct = requested.currentProduct as string | undefined;

  if (requestedLineId && requestedLineId !== incident.line_id) {
    rows.push({ label: 'Ligne', current: formatLineLabel(lines, incident.line_id), requested: formatLineLabel(lines, requestedLineId) });
  }
  if (requestedMachineId && requestedMachineId !== incident.machine_id) {
    const lineId = requestedLineId ?? incident.line_id;
    rows.push({ label: 'Machine', current: formatMachineLabel(lines, incident.line_id, incident.machine_id), requested: formatMachineLabel(lines, lineId, requestedMachineId) });
  }
  if (requestedRobotLabel && requestedRobotLabel !== incident.robot_label) {
    rows.push({ label: 'Robot', current: incident.robot_label, requested: requestedRobotLabel });
  }
  if (requestedHeadNumber && requestedHeadNumber !== incident.head_number) {
    rows.push({ label: 'Tête', current: String(incident.head_number), requested: String(requestedHeadNumber) });
  }
  if (requestedState && requestedState !== incident.state) {
    rows.push({ label: 'État', current: STATE_LABELS[incident.state], requested: STATE_LABELS[requestedState] || requestedState });
  }
  if (requestedProduct !== undefined && requestedProduct !== (incident.current_product || '')) {
    rows.push({ label: 'Produit en cours', current: formatValue(incident.current_product || ''), requested: formatValue(requestedProduct) });
  }
  if (requestedComment !== undefined && requestedComment !== (incident.comment || '')) {
    rows.push({ label: 'Commentaire', current: formatValue(incident.comment || ''), requested: formatValue(requestedComment) });
  }

  return rows;
}
