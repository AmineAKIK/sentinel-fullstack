import { canPerform, CurrentIncident } from '../workshop.policy';

// ─── helpers ──────────────────────────────────────────────────────────────────

const ACTOR_ID = 42;

function incident(overrides: Partial<CurrentIncident> = {}): CurrentIncident {
  return {
    status: 'OPEN',
    is_taken: false,
    taken_by_user_id: null,
    user_id: ACTOR_ID,
    cancel_request: false,
    ...overrides,
  };
}

// ─── canPerform – invalid role ────────────────────────────────────────────────

describe('canPerform – unknown role', () => {
  it('returns false for any action when the role is not a WorkshopRole', () => {
    expect(canPerform('ADMIN', 'TAKE', incident())).toBe(false);
    expect(canPerform('', 'CLOSE', incident())).toBe(false);
  });
});

// ─── OPERATOR actions ─────────────────────────────────────────────────────────

describe('OPERATOR permissions', () => {
  it('can REQUEST_EDIT on their own active incident', () => {
    expect(canPerform('OPERATOR', 'REQUEST_EDIT', incident({ status: 'OPEN' }), ACTOR_ID)).toBe(true);
    expect(canPerform('OPERATOR', 'REQUEST_EDIT', incident({ status: 'PENDING' }), ACTOR_ID)).toBe(true);
  });

  it('cannot REQUEST_EDIT on another operator\'s incident', () => {
    expect(canPerform('OPERATOR', 'REQUEST_EDIT', incident({ user_id: 99 }), ACTOR_ID)).toBe(false);
  });

  it('cannot REQUEST_EDIT without passing actorId', () => {
    expect(canPerform('OPERATOR', 'REQUEST_EDIT', incident())).toBe(false);
  });

  it('cannot REQUEST_EDIT on a closed/canceled incident', () => {
    expect(canPerform('OPERATOR', 'REQUEST_EDIT', incident({ status: 'CLOSED' }), ACTOR_ID)).toBe(false);
    expect(canPerform('OPERATOR', 'REQUEST_EDIT', incident({ status: 'CANCELED' }), ACTOR_ID)).toBe(false);
  });

  it('can REQUEST_CANCEL on their own open, non-taken incident', () => {
    expect(canPerform('OPERATOR', 'REQUEST_CANCEL', incident({ status: 'OPEN', is_taken: false }), ACTOR_ID)).toBe(true);
  });

  it('cannot REQUEST_CANCEL on another operator\'s incident', () => {
    expect(canPerform('OPERATOR', 'REQUEST_CANCEL', incident({ user_id: 99, is_taken: false }), ACTOR_ID)).toBe(false);
  });

  it('cannot REQUEST_CANCEL when incident is taken', () => {
    expect(canPerform('OPERATOR', 'REQUEST_CANCEL', incident({ is_taken: true }), ACTOR_ID)).toBe(false);
  });

  it('cannot REQUEST_CANCEL on a closed incident', () => {
    expect(canPerform('OPERATOR', 'REQUEST_CANCEL', incident({ status: 'CLOSED' }), ACTOR_ID)).toBe(false);
  });

  it('cannot perform DIRECT_EDIT, CANCEL, TAKE, CLOSE', () => {
    const inc = incident();
    expect(canPerform('OPERATOR', 'DIRECT_EDIT', inc)).toBe(false);
    expect(canPerform('OPERATOR', 'CANCEL', inc)).toBe(false);
    expect(canPerform('OPERATOR', 'TAKE', inc)).toBe(false);
    expect(canPerform('OPERATOR', 'CLOSE', inc)).toBe(false);
  });
});

// ─── MAINTENANCE actions ──────────────────────────────────────────────────────

describe('MAINTENANCE permissions', () => {
  it('can TAKE an open, non-taken incident', () => {
    expect(canPerform('MAINTENANCE', 'TAKE', incident({ status: 'OPEN', is_taken: false }))).toBe(true);
  });

  it('can TAKE an already-taken incident (retake — team play, every transfer is logged)', () => {
    expect(canPerform('MAINTENANCE', 'TAKE', incident({ status: 'OPEN', is_taken: true }))).toBe(true);
  });

  it('cannot TAKE a PENDING incident', () => {
    expect(canPerform('MAINTENANCE', 'TAKE', incident({ status: 'PENDING', is_taken: false }))).toBe(false);
  });

  it('can SET_PENDING when OPEN and taken', () => {
    expect(canPerform('MAINTENANCE', 'SET_PENDING', incident({ status: 'OPEN', is_taken: true }))).toBe(true);
  });

  it('cannot SET_PENDING when not taken', () => {
    expect(canPerform('MAINTENANCE', 'SET_PENDING', incident({ status: 'OPEN', is_taken: false }))).toBe(false);
  });

  it('can RESUME when PENDING and taken', () => {
    expect(canPerform('MAINTENANCE', 'RESUME', incident({ status: 'PENDING', is_taken: true }))).toBe(true);
  });

  it('cannot RESUME when OPEN', () => {
    expect(canPerform('MAINTENANCE', 'RESUME', incident({ status: 'OPEN', is_taken: true }))).toBe(false);
  });

  it('can CLOSE when OPEN and taken', () => {
    expect(canPerform('MAINTENANCE', 'CLOSE', incident({ status: 'OPEN', is_taken: true }))).toBe(true);
  });

  it('cannot CLOSE when not taken', () => {
    expect(canPerform('MAINTENANCE', 'CLOSE', incident({ status: 'OPEN', is_taken: false }))).toBe(false);
  });

  it('can DIRECT_EDIT on active non-taken incident', () => {
    expect(canPerform('MAINTENANCE', 'DIRECT_EDIT', incident({ status: 'OPEN', is_taken: false }))).toBe(true);
  });

  it('cannot DIRECT_EDIT when taken', () => {
    expect(canPerform('MAINTENANCE', 'DIRECT_EDIT', incident({ is_taken: true }))).toBe(false);
  });

  it('can CANCEL on active non-taken incident', () => {
    expect(canPerform('MAINTENANCE', 'CANCEL', incident({ status: 'OPEN', is_taken: false }))).toBe(true);
  });

  it('cannot APPROVE_EDIT, REJECT_EDIT, REORDER, INVALIDATE_CLOSED', () => {
    const inc = incident({ status: 'CLOSED' });
    expect(canPerform('MAINTENANCE', 'APPROVE_EDIT', inc)).toBe(false);
    expect(canPerform('MAINTENANCE', 'REJECT_EDIT', incident())).toBe(false);
    expect(canPerform('MAINTENANCE', 'REORDER', incident())).toBe(false);
    expect(canPerform('MAINTENANCE', 'INVALIDATE_CLOSED', inc)).toBe(false);
  });
});

// ─── RESPONSABLE actions ──────────────────────────────────────────────────────

describe('RESPONSABLE permissions', () => {
  it('can APPROVE_EDIT and REJECT_EDIT only when an edit request exists', () => {
    expect(canPerform('RESPONSABLE', 'APPROVE_EDIT', incident({ edit_request: { comment: 'x' } }))).toBe(true);
    expect(canPerform('RESPONSABLE', 'REJECT_EDIT', incident({ edit_request: { comment: 'x' } }))).toBe(true);
    expect(canPerform('RESPONSABLE', 'APPROVE_EDIT', incident())).toBe(false);
    expect(canPerform('RESPONSABLE', 'REJECT_EDIT', incident())).toBe(false);
  });

  it('cannot APPROVE_EDIT on closed incident', () => {
    expect(canPerform('RESPONSABLE', 'APPROVE_EDIT', incident({ status: 'CLOSED' }))).toBe(false);
  });

  it('can APPROVE_CANCEL when cancel_request is true', () => {
    expect(canPerform('RESPONSABLE', 'APPROVE_CANCEL', incident({ cancel_request: true }))).toBe(true);
  });

  it('cannot APPROVE_CANCEL when cancel_request is false', () => {
    expect(canPerform('RESPONSABLE', 'APPROVE_CANCEL', incident({ cancel_request: false }))).toBe(false);
  });

  it('can REJECT_CANCEL only when cancel_request is true', () => {
    expect(canPerform('RESPONSABLE', 'REJECT_CANCEL', incident({ cancel_request: true }))).toBe(true);
    expect(canPerform('RESPONSABLE', 'REJECT_CANCEL', incident())).toBe(false);
  });

  it('can SET_PRIORITY, REORDER, RESPONSIBLE_COMMENT on active incidents', () => {
    const inc = incident();
    expect(canPerform('RESPONSABLE', 'SET_PRIORITY', inc)).toBe(true);
    expect(canPerform('RESPONSABLE', 'REORDER', inc)).toBe(true);
    expect(canPerform('RESPONSABLE', 'RESPONSIBLE_COMMENT', inc)).toBe(true);
  });

  it('cannot SET_PRIORITY on closed incident', () => {
    expect(canPerform('RESPONSABLE', 'SET_PRIORITY', incident({ status: 'CLOSED' }))).toBe(false);
  });

  it('can INVALIDATE_CLOSED only when status is CLOSED', () => {
    expect(canPerform('RESPONSABLE', 'INVALIDATE_CLOSED', incident({ status: 'CLOSED' }))).toBe(true);
    expect(canPerform('RESPONSABLE', 'INVALIDATE_CLOSED', incident({ status: 'OPEN' }))).toBe(false);
  });

  it('can DIRECT_EDIT on active non-taken incident', () => {
    expect(canPerform('RESPONSABLE', 'DIRECT_EDIT', incident({ status: 'OPEN', is_taken: false }))).toBe(true);
  });

  it('cannot TAKE or CLOSE', () => {
    expect(canPerform('RESPONSABLE', 'TAKE', incident())).toBe(false);
    expect(canPerform('RESPONSABLE', 'CLOSE', incident({ status: 'OPEN', is_taken: true }))).toBe(false);
  });
});
