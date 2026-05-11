import { createIncidentSchema, updateIncidentSchema } from '../workshop.validation';

// ─── valid fixture ─────────────────────────────────────────────────────────────

function validCreatePayload() {
  return {
    shift: 'MATIN',
    lineId: 1,
    machineId: 'M01',
    robotLabel: 'Robot 1',
    headNumber: 2,
    state: 'DEGRADEE',
  };
}

// ─── createIncidentSchema ──────────────────────────────────────────────────────

describe('createIncidentSchema', () => {
  it('accepts a minimal valid payload', () => {
    const result = createIncidentSchema.safeParse(validCreatePayload());
    expect(result.success).toBe(true);
  });

  it('accepts optional fields comment and currentProduct', () => {
    const result = createIncidentSchema.safeParse({
      ...validCreatePayload(),
      comment: 'Commentaire',
      currentProduct: 'Produit X',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid shift', () => {
    const result = createIncidentSchema.safeParse({ ...validCreatePayload(), shift: 'SOIR' });
    expect(result.success).toBe(false);
  });

  it('rejects lineId of 0', () => {
    const result = createIncidentSchema.safeParse({ ...validCreatePayload(), lineId: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative lineId', () => {
    const result = createIncidentSchema.safeParse({ ...validCreatePayload(), lineId: -5 });
    expect(result.success).toBe(false);
  });

  it('coerces a numeric string lineId', () => {
    const result = createIncidentSchema.safeParse({ ...validCreatePayload(), lineId: '3' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.lineId).toBe(3);
  });

  it('rejects an empty machineId', () => {
    const result = createIncidentSchema.safeParse({ ...validCreatePayload(), machineId: '  ' });
    expect(result.success).toBe(false);
  });

  it('rejects headNumber < 1', () => {
    const result = createIncidentSchema.safeParse({ ...validCreatePayload(), headNumber: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid state', () => {
    const result = createIncidentSchema.safeParse({ ...validCreatePayload(), state: 'CASSEE' });
    expect(result.success).toBe(false);
  });

  it('rejects a comment longer than 1000 characters', () => {
    const result = createIncidentSchema.safeParse({
      ...validCreatePayload(),
      comment: 'a'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('trims whitespace from robotLabel', () => {
    const result = createIncidentSchema.safeParse({ ...validCreatePayload(), robotLabel: '  R1  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.robotLabel).toBe('R1');
  });

  it('rejects missing required fields', () => {
    const result = createIncidentSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.errors.length).toBeGreaterThan(0);
  });
});

// ─── updateIncidentSchema ──────────────────────────────────────────────────────

describe('updateIncidentSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    const result = updateIncidentSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts a partial update with only isTaken', () => {
    const result = updateIncidentSchema.safeParse({ isTaken: true });
    expect(result.success).toBe(true);
  });

  it('accepts a valid status value', () => {
    const result = updateIncidentSchema.safeParse({ status: 'CLOSED' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid status value', () => {
    const result = updateIncidentSchema.safeParse({ status: 'UNKNOWN' });
    expect(result.success).toBe(false);
  });

  it('accepts requestOnly flag', () => {
    const result = updateIncidentSchema.safeParse({ requestOnly: true });
    expect(result.success).toBe(true);
  });

  it('rejects an invalidationReason longer than 500 characters', () => {
    const result = updateIncidentSchema.safeParse({ invalidationReason: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('rejects a deleteRequestReason longer than 500 characters', () => {
    const result = updateIncidentSchema.safeParse({ deleteRequestReason: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('accepts all optional boolean flags together', () => {
    const result = updateIncidentSchema.safeParse({
      isTaken: false,
      isPriority: true,
      requestOnly: false,
      deleteRequest: true,
      applyEditRequest: false,
      rejectEditRequest: false,
      rejectDeleteRequest: false,
    });
    expect(result.success).toBe(true);
  });
});
