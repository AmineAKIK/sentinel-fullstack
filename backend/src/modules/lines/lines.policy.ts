function machineSignature(machines: unknown): string {
  return JSON.stringify(machines);
}

function machineOrder(machines: Array<{ machineId: string }>): string[] {
  return machines.map((machine) => machine.machineId);
}

export function getLineEventType(current: {
  line_number: string;
  is_active: boolean;
  machine_sequence: Array<{ machineId: string }>;
}, updates: {
  lineNumber?: string;
  isActive?: boolean;
  machines?: Array<{ machineId: string }>;
}): string {
  const hasLineSummaryChange =
    (updates.lineNumber !== undefined && updates.lineNumber !== current.line_number) ||
    (updates.isActive !== undefined && updates.isActive !== current.is_active);

  if (!updates.machines) return hasLineSummaryChange ? 'LINE_SUMMARY_UPDATED' : 'LINE_UPDATED';

  const beforeOrder = machineOrder(current.machine_sequence).join('|');
  const afterOrder = machineOrder(updates.machines).join('|');
  const sameMachines = machineSignature(current.machine_sequence) === machineSignature(updates.machines);

  if (!sameMachines && beforeOrder === afterOrder && !hasLineSummaryChange) {
    return 'LINE_MACHINE_UPDATED';
  }
  if (!sameMachines && beforeOrder !== afterOrder && !hasLineSummaryChange) {
    return 'LINE_PLAN_UPDATED';
  }
  return 'LINE_UPDATED';
}
