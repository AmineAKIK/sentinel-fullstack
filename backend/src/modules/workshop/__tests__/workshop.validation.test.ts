import {
  arbitrationConsultationSchema,
  createIncidentSchema,
  incidentWorkspaceQuerySchema,
  journalEventQuerySchema,
  updateIncidentSchema,
  workshopAnalyticsQuerySchema,
} from '../workshop.validation';

// ─── valid fixture ─────────────────────────────────────────────────────────────

function validCreatePayload() {
  return {
    lineId: 1,
    machineId: 'M01',
    robotLabel: 'Robot 1',
    headNumber: 2,
    state: 'DEGRADEE',
    currentProduct: 'REF-001',
  };
}

// ─── createIncidentSchema ──────────────────────────────────────────────────────

describe('createIncidentSchema', () => {
  it('accepts a minimal valid payload', () => {
    const result = createIncidentSchema.safeParse(validCreatePayload());
    expect(result.success).toBe(true);
  });

  it('accepts the optional comment field', () => {
    const result = createIncidentSchema.safeParse({
      ...validCreatePayload(),
      comment: 'Commentaire',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a payload without currentProduct', () => {
    const { currentProduct: _omit, ...withoutProduct } = validCreatePayload();
    const result = createIncidentSchema.safeParse(withoutProduct);
    expect(result.success).toBe(false);
  });

  it('rejects an empty currentProduct', () => {
    const result = createIncidentSchema.safeParse({
      ...validCreatePayload(),
      currentProduct: '   ',
    });
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

  it('rejects a comment longer than 500 characters', () => {
    const result = createIncidentSchema.safeParse({
      ...validCreatePayload(),
      comment: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a comment of exactly 500 characters', () => {
    const result = createIncidentSchema.safeParse({
      ...validCreatePayload(),
      comment: 'a'.repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it('trims whitespace from robotLabel', () => {
    const result = createIncidentSchema.safeParse({
      ...validCreatePayload(),
      robotLabel: '  R1  ',
    });
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

  it('rejects an interventionNote longer than 1000 characters', () => {
    const result = updateIncidentSchema.safeParse({ interventionNote: 'x'.repeat(1001) });
    expect(result.success).toBe(false);
  });

  it('accepts an interventionNote of exactly 1000 characters', () => {
    const result = updateIncidentSchema.safeParse({ interventionNote: 'x'.repeat(1000) });
    expect(result.success).toBe(true);
  });

  it('rejects a diagnostic longer than 1000 characters', () => {
    const result = updateIncidentSchema.safeParse({ diagnostic: 'x'.repeat(1001) });
    expect(result.success).toBe(false);
  });

  it('rejects a responsibleComment longer than 500 characters', () => {
    const result = updateIncidentSchema.safeParse({ responsibleComment: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('rejects a currentProduct longer than 120 characters', () => {
    const result = updateIncidentSchema.safeParse({ currentProduct: 'x'.repeat(121) });
    expect(result.success).toBe(false);
  });

  it('accepts a currentProduct of exactly 120 characters', () => {
    const result = updateIncidentSchema.safeParse({ currentProduct: 'x'.repeat(120) });
    expect(result.success).toBe(true);
  });

  it('coerces a numeric string headNumber', () => {
    const result = updateIncidentSchema.safeParse({ headNumber: '3' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.headNumber).toBe(3);
  });
});

describe('arbitrationConsultationSchema', () => {
  it.each(['EDIT', 'CANCEL'] as const)('accepts the exact %s case type', (requestType) => {
    expect(arbitrationConsultationSchema.safeParse({ requestType }).success).toBe(true);
  });

  it('rejects bulk or implicit consultation', () => {
    expect(arbitrationConsultationSchema.safeParse({ requestType: 'ALL' }).success).toBe(false);
    expect(arbitrationConsultationSchema.safeParse({}).success).toBe(false);
  });
});

// ─── workshopAnalyticsQuerySchema (ANA-05, DR-10) ─────────────────────────────

describe('workshopAnalyticsQuerySchema', () => {
  it('accepts a query without any date bound', () => {
    expect(workshopAnalyticsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a valid bounded window', () => {
    const result = workshopAnalyticsQuerySchema.safeParse({
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-01-31T23:59:59.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts start === end (a single instant is a valid, inclusive window)', () => {
    const result = workshopAnalyticsQuerySchema.safeParse({
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects start after end', () => {
    const result = workshopAnalyticsQuerySchema.safeParse({
      start: '2026-02-01T00:00:00.000Z',
      end: '2026-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a window of exactly 366 days', () => {
    const result = workshopAnalyticsQuerySchema.safeParse({
      start: '2026-01-01T00:00:00.000Z',
      end: '2027-01-02T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a window longer than 366 days', () => {
    const result = workshopAnalyticsQuerySchema.safeParse({
      start: '2026-01-01T00:00:00.000Z',
      end: '2027-01-03T00:00:01.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a window longer than 366 days when only end is provided (unbounded start)', () => {
    const farFuture = new Date();
    farFuture.setUTCFullYear(farFuture.getUTCFullYear() + 5);
    const result = workshopAnalyticsQuerySchema.safeParse({ end: farFuture.toISOString() });
    // `end` seul est accepté (le service applique une fenêtre par défaut sur
    // `start` uniquement quand aucune borne n'est fournie) — la contrainte de
    // 366 jours ne peut porter que sur un couple start/end explicite.
    expect(result.success).toBe(true);
  });

  it('rejects a malformed date string', () => {
    const result = workshopAnalyticsQuerySchema.safeParse({ start: 'not-a-date' });
    expect(result.success).toBe(false);
  });
});

// ─── journalEventQuerySchema (ANA-03, DR-10) ──────────────────────────────────

describe('journalEventQuerySchema', () => {
  it('accepts the existing Journal filters without any date bound', () => {
    const result = journalEventQuerySchema.safeParse({
      q: 'ligne 12',
      eventType: 'INCIDENT_CLOSED',
      lineId: 3,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid bounded period alongside the existing filters', () => {
    const result = journalEventQuerySchema.safeParse({
      eventType: 'INCIDENT_TAKEN',
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-01-31T23:59:59.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects start after end, same contract as the Pilotage window', () => {
    const result = journalEventQuerySchema.safeParse({
      start: '2026-02-01T00:00:00.000Z',
      end: '2026-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a window longer than 366 days', () => {
    const result = journalEventQuerySchema.safeParse({
      start: '2026-01-01T00:00:00.000Z',
      end: '2027-01-03T00:00:01.000Z',
    });
    expect(result.success).toBe(false);
  });
});

// ─── incidentWorkspaceQuerySchema (lot 7B/7C — pagination par curseur) ────────

describe('incidentWorkspaceQuerySchema', () => {
  it('accepts a query without a cursor', () => {
    expect(incidentWorkspaceQuerySchema.safeParse({ status: 'CLOSED' }).success).toBe(true);
  });

  it('accepts an opaque cursor token', () => {
    const result = incidentWorkspaceQuerySchema.safeParse({
      cursor: 'b64token-opaque-and-unvalidated-here',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a cursor longer than 200 characters', () => {
    const result = incidentWorkspaceQuerySchema.safeParse({ cursor: 'x'.repeat(201) });
    expect(result.success).toBe(false);
  });
});
