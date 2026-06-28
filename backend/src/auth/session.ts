export const SESSION_DURATION_HOURS_DEFAULT = 8;

export function sessionDurationJwt(hours: number): string {
  return `${hours}h`;
}

export function sessionDurationMs(hours: number): number {
  return hours * 60 * 60 * 1000;
}
