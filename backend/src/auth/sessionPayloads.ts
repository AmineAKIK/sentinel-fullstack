import { isWorkshopRole } from '../domain/constants';

export type AuthScope = 'admin' | 'workshop' | 'board';

export interface AdminSessionPayload {
  scope: 'admin';
  adminId: number;
  username: string;
  sessionVersion: number;
}

export interface WorkshopSessionPayload {
  scope: 'workshop';
  userId: number;
  badgeNumber: string;
  role: string;
  sessionVersion: number;
}

export interface BoardSessionPayload {
  scope: 'board';
  label: string;
  boardSessionVersion: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isSessionVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isAdminSessionPayload(value: unknown): value is AdminSessionPayload {
  return (
    isRecord(value) &&
    value.scope === 'admin' &&
    isPositiveInteger(value.adminId) &&
    typeof value.username === 'string' &&
    value.username.length > 0 &&
    isSessionVersion(value.sessionVersion)
  );
}

export function isWorkshopSessionPayload(value: unknown): value is WorkshopSessionPayload {
  return (
    isRecord(value) &&
    value.scope === 'workshop' &&
    isPositiveInteger(value.userId) &&
    typeof value.badgeNumber === 'string' &&
    value.badgeNumber.length > 0 &&
    typeof value.role === 'string' &&
    isWorkshopRole(value.role) &&
    isSessionVersion(value.sessionVersion)
  );
}

export function isBoardSessionPayload(value: unknown): value is BoardSessionPayload {
  return (
    isRecord(value) &&
    value.scope === 'board' &&
    typeof value.label === 'string' &&
    value.label.length > 0 &&
    isSessionVersion(value.boardSessionVersion)
  );
}
