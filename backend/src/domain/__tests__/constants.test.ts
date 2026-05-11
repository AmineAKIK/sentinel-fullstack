import {
  isWorkshopRole,
  isIncidentStatus,
  isIncidentState,
  WORKSHOP_ROLES,
  INCIDENT_STATUSES,
  INCIDENT_STATES,
} from '../../domain/constants';

describe('isWorkshopRole', () => {
  it('returns true for each valid role', () => {
    WORKSHOP_ROLES.forEach((role) => {
      expect(isWorkshopRole(role)).toBe(true);
    });
  });

  it('returns false for invalid strings', () => {
    expect(isWorkshopRole('ADMIN')).toBe(false);
    expect(isWorkshopRole('operator')).toBe(false);
    expect(isWorkshopRole('')).toBe(false);
    expect(isWorkshopRole('UNKNOWN')).toBe(false);
  });
});

describe('isIncidentStatus', () => {
  it('returns true for each valid status', () => {
    INCIDENT_STATUSES.forEach((status) => {
      expect(isIncidentStatus(status)).toBe(true);
    });
  });

  it('returns false for invalid strings', () => {
    expect(isIncidentStatus('open')).toBe(false);
    expect(isIncidentStatus('DELETED')).toBe(false);
    expect(isIncidentStatus('')).toBe(false);
  });
});

describe('isIncidentState', () => {
  it('returns true for each valid state', () => {
    INCIDENT_STATES.forEach((state) => {
      expect(isIncidentState(state)).toBe(true);
    });
  });

  it('returns false for invalid strings', () => {
    expect(isIncidentState('DEGRADEE'.toLowerCase())).toBe(false);
    expect(isIncidentState('UNKNOWN')).toBe(false);
    expect(isIncidentState('')).toBe(false);
  });
});
