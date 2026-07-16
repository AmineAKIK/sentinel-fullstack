import { api } from './client';
import { WorkshopBoardData } from '../types';

export interface BoardAccessResponse {
  access: true;
  label: string;
  expiresInHours: number;
}

export async function createBoardSession(code: string): Promise<BoardAccessResponse> {
  return api.post<BoardAccessResponse>('/api/board/session', { code });
}

export async function getBoardAccess(signal?: AbortSignal): Promise<BoardAccessResponse> {
  return api.get<BoardAccessResponse>('/api/board/me', signal);
}

export async function logoutBoardSession(): Promise<void> {
  return api.post<void>('/api/board/logout', {});
}

export async function getBoardData(signal?: AbortSignal): Promise<WorkshopBoardData> {
  return api.get<WorkshopBoardData>('/api/board/data', signal);
}
