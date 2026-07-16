import { describe, it, expect } from 'vitest';
import { canPerform, WorkshopAction } from '../../utils/workshopPermissions';
import type { WorkshopIncident } from '../../types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function incident(overrides: Partial<WorkshopIncident> = {}): WorkshopIncident {
  return {
    id: 1,
    user_id: 1,
    line_id: 1,
    line_number: 'L01',
    machine_id: 'M01',
    machine_brand: 'Brand',
    robot_label: 'R1',
    head_number: 1,
    state: 'DEGRADEE',
    comment: null,
    current_product: null,
    is_taken: false,
    is_priority: false,
    status: 'OPEN',
    diagnostic: null,
    intervention_note: null,
    responsible_comment: null,
    edit_request: null,
    cancel_request: false,
    cancel_request_reason: null,
    taken_by_user_id: null,
    taken_at: null,
    taken_by_first_name: null,
    taken_by_last_name: null,
    taken_by_role: null,
    display_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    first_name: 'Alice',
    last_name: 'Dupont',
    badge_number: null,
    role: 'OPERATOR',
    ...overrides,
  };
}

// ─── undefined role ────────────────────────────────────────────────────────────

describe('canPerform – undefined role', () => {
  it('returns false for any action', () => {
    expect(canPerform(undefined, 'take', incident())).toBe(false);
    expect(canPerform(undefined, 'close', incident())).toBe(false);
  });
});

// ─── OPERATOR ─────────────────────────────────────────────────────────────────

describe('OPERATOR permissions', () => {
  it('can requestEdit on active incident', () => {
    expect(canPerform('OPERATOR', 'requestEdit', incident({ status: 'OPEN', user_id: 1 }), 1)).toBe(
      true
    );
    expect(
      canPerform('OPERATOR', 'requestEdit', incident({ status: 'PENDING', user_id: 1 }), 1)
    ).toBe(true);
  });

  it('cannot requestEdit on CLOSED or CANCELED', () => {
    expect(
      canPerform('OPERATOR', 'requestEdit', incident({ status: 'CLOSED', user_id: 1 }), 1)
    ).toBe(false);
    expect(
      canPerform('OPERATOR', 'requestEdit', incident({ status: 'CANCELED', user_id: 1 }), 1)
    ).toBe(false);
  });

  it('cannot requestEdit without actor ownership', () => {
    expect(canPerform('OPERATOR', 'requestEdit', incident({ user_id: 1 }), 2)).toBe(false);
    expect(canPerform('OPERATOR', 'requestEdit', incident({ user_id: 1 }))).toBe(false);
  });

  it('can requestCancel on open non-taken incident', () => {
    expect(
      canPerform('OPERATOR', 'requestCancel', incident({ is_taken: false, user_id: 1 }), 1)
    ).toBe(true);
  });

  it('cannot requestCancel when taken', () => {
    expect(
      canPerform('OPERATOR', 'requestCancel', incident({ is_taken: true, user_id: 1 }), 1)
    ).toBe(false);
  });

  it('cannot requestCancel without actor ownership', () => {
    expect(
      canPerform('OPERATOR', 'requestCancel', incident({ is_taken: false, user_id: 1 }), 2)
    ).toBe(false);
    expect(canPerform('OPERATOR', 'requestCancel', incident({ is_taken: false, user_id: 1 }))).toBe(
      false
    );
  });

  it('cannot directEdit, cancel, take, close', () => {
    const inc = incident();
    (['directEdit', 'cancel', 'take', 'close'] as WorkshopAction[]).forEach((action) => {
      expect(canPerform('OPERATOR', action, inc)).toBe(false);
    });
  });

  it('can withdraw its own active edit request', () => {
    expect(
      canPerform(
        'OPERATOR',
        'withdrawEdit',
        incident({ user_id: 1, edit_request: { comment: 'Correction' } }),
        1
      )
    ).toBe(true);
  });
});

// ─── MAINTENANCE ──────────────────────────────────────────────────────────────

describe('MAINTENANCE permissions', () => {
  it('can take an open non-taken incident', () => {
    expect(
      canPerform('MAINTENANCE', 'take', incident({ status: 'OPEN', is_taken: false }), 7)
    ).toBe(true);
  });

  it('can transfer an incident owned by another technician, but not retake its own', () => {
    const taken = incident({ status: 'OPEN', is_taken: true, taken_by_user_id: 9 });
    expect(canPerform('MAINTENANCE', 'take', taken, 7)).toBe(true);
    expect(canPerform('MAINTENANCE', 'take', taken, 9)).toBe(false);
  });

  it('can setPending when OPEN and taken', () => {
    expect(
      canPerform('MAINTENANCE', 'setPending', incident({ status: 'OPEN', is_taken: true }))
    ).toBe(true);
  });

  it('cannot setPending when not taken', () => {
    expect(
      canPerform('MAINTENANCE', 'setPending', incident({ status: 'OPEN', is_taken: false }))
    ).toBe(false);
  });

  it('can resume when PENDING and taken', () => {
    expect(
      canPerform('MAINTENANCE', 'resume', incident({ status: 'PENDING', is_taken: true }))
    ).toBe(true);
  });

  it('can close when OPEN and taken', () => {
    expect(canPerform('MAINTENANCE', 'close', incident({ status: 'OPEN', is_taken: true }))).toBe(
      true
    );
  });

  it('cannot close when not taken', () => {
    expect(canPerform('MAINTENANCE', 'close', incident({ status: 'OPEN', is_taken: false }))).toBe(
      false
    );
  });

  it('can directEdit on active non-taken incident', () => {
    expect(canPerform('MAINTENANCE', 'directEdit', incident({ is_taken: false }))).toBe(true);
  });

  it('hides treatment actions while a normalized arbitration case is open', () => {
    const arbitration = {
      edit: {
        caseId: 21,
        requestEventId: 42,
        requestedAt: '2026-07-01T08:00:00.000Z',
        state: 'ACTIVE' as const,
      },
    };
    expect(canPerform('MAINTENANCE', 'take', incident({ is_taken: false, arbitration }), 7)).toBe(
      false
    );
    expect(canPerform('MAINTENANCE', 'close', incident({ is_taken: true, arbitration }))).toBe(
      false
    );
    expect(
      canPerform('MAINTENANCE', 'directEdit', incident({ is_taken: false, arbitration }))
    ).toBe(false);
  });
});

// ─── RESPONSABLE ──────────────────────────────────────────────────────────────

describe('RESPONSABLE permissions', () => {
  it('can approveEdit and rejectEdit only when an edit request exists', () => {
    expect(
      canPerform('RESPONSABLE', 'approveEdit', incident({ edit_request: { comment: 'x' } }))
    ).toBe(true);
    expect(
      canPerform('RESPONSABLE', 'rejectEdit', incident({ edit_request: { comment: 'x' } }))
    ).toBe(true);
    expect(canPerform('RESPONSABLE', 'approveEdit', incident())).toBe(false);
    expect(canPerform('RESPONSABLE', 'rejectEdit', incident())).toBe(false);
  });

  it('cannot approveEdit on CLOSED incident', () => {
    expect(canPerform('RESPONSABLE', 'approveEdit', incident({ status: 'CLOSED' }))).toBe(false);
  });

  it('can approveCancel when cancel_request is true', () => {
    expect(canPerform('RESPONSABLE', 'approveCancel', incident({ cancel_request: true }))).toBe(
      true
    );
  });

  it('cannot approveCancel when cancel_request is false', () => {
    expect(canPerform('RESPONSABLE', 'approveCancel', incident({ cancel_request: false }))).toBe(
      false
    );
  });

  it('can rejectCancel only when cancel_request is true', () => {
    expect(canPerform('RESPONSABLE', 'rejectCancel', incident({ cancel_request: true }))).toBe(
      true
    );
    expect(canPerform('RESPONSABLE', 'rejectCancel', incident())).toBe(false);
  });

  it('can setPriority, responsibleComment on active incident', () => {
    const inc = incident();
    expect(canPerform('RESPONSABLE', 'setPriority', inc)).toBe(true);
    expect(canPerform('RESPONSABLE', 'responsibleComment', inc)).toBe(true);
  });

  it('can invalidateClosed only when CLOSED', () => {
    expect(canPerform('RESPONSABLE', 'invalidateClosed', incident({ status: 'CLOSED' }))).toBe(
      true
    );
    expect(canPerform('RESPONSABLE', 'invalidateClosed', incident({ status: 'OPEN' }))).toBe(false);
  });

  it('cannot take or close', () => {
    expect(canPerform('RESPONSABLE', 'take', incident())).toBe(false);
    expect(canPerform('RESPONSABLE', 'close', incident({ status: 'OPEN', is_taken: true }))).toBe(
      false
    );
  });
});
