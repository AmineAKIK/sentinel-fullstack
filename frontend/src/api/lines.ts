import { api } from './client';
import { LineMachine, ProductionLine } from '../types';
import { buildRequiredQuery } from '../utils/query';

export interface CreateLinePayload {
  lineNumber: string;
  isActive?: boolean;
  machines: LineMachine[];
}

export type UpdateLinePayload = Partial<CreateLinePayload>;

export async function listLines(): Promise<ProductionLine[]> {
  return api.get<ProductionLine[]>('/api/admin/lines');
}

export async function getLine(id: number): Promise<ProductionLine> {
  return api.get<ProductionLine>(`/api/admin/lines/${id}`);
}

export async function createLine(payload: CreateLinePayload): Promise<ProductionLine> {
  return api.post<ProductionLine>('/api/admin/lines', payload);
}

export async function checkLineAvailability(lineNumber: string): Promise<{ exists: boolean }> {
  const query = buildRequiredQuery({ lineNumber });
  return api.get<{ exists: boolean }>(`/api/admin/lines/check-line?${query}`);
}

export async function checkLineConflicts(payload: {
  lineNumber: string;
  machineIds: string[];
  lineId?: number;
}): Promise<{ lineExists: boolean; machineConflicts: string[] }> {
  return api.post<{ lineExists: boolean; machineConflicts: string[] }>(
    '/api/admin/lines/check-line-conflicts',
    payload
  );
}

export async function updateLine(
  id: number,
  payload: UpdateLinePayload
): Promise<ProductionLine> {
  return api.patch<ProductionLine>(`/api/admin/lines/${id}`, payload);
}

export async function deleteLine(id: number): Promise<void> {
  return api.delete<void>(`/api/admin/lines/${id}`);
}

export async function getLineImpact(id: number): Promise<{
  incidents: number;
  open_or_pending_incidents: number;
}> {
  return api.get(`/api/admin/lines/${id}/impact`);
}
