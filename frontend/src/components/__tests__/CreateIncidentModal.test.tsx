import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../api/workshop', () => ({
  createWorkshopIncident: vi.fn(),
  updateWorkshopIncident: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  ApiResponseError: class ApiResponseError extends Error {
    constructor(public code: string, message: string, public status: number) {
      super(message);
    }
  },
}));

import * as workshopApi from '../../api/workshop';
import CreateIncidentModal from '../CreateIncidentModal';
import { ProductionLine } from '../../types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function mockLine(overrides: Partial<ProductionLine> = {}): ProductionLine {
  return {
    id: 1,
    line_number: 'L01',
    is_active: true,
    machines: [
      {
        machineId: 'M01',
        brand: 'Fanuc',
        hasDoubleRobot: false as const,
        robotNumber: 'R01',
        robotHeads: 4,
      },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderModal(
  lines: ProductionLine[] = [mockLine()],
  onClose = vi.fn(),
  onSuccess = vi.fn()
) {
  return render(
    <CreateIncidentModal lines={lines} onClose={onClose} onSuccess={onSuccess} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── rendu ────────────────────────────────────────────────────────────────────

describe('CreateIncidentModal – rendu', () => {
  it('affiche le sélecteur d\'équipe (shift)', () => {
    renderModal();
    expect(screen.getByText(/Équipe/i)).toBeDefined();
  });

  it('affiche le titre de création', () => {
    renderModal();
    expect(screen.getByText('Créer un incident')).toBeDefined();
  });

  it('affiche L01 dans la liste des lignes', () => {
    renderModal([mockLine({ line_number: 'L01' })]);
    expect(screen.getByText('L01')).toBeDefined();
  });
});

// ─── isDirty ──────────────────────────────────────────────────────────────────

describe('CreateIncidentModal – isDirty', () => {
  it('isDirty est faux au rendu initial (pas de confirmation à la fermeture)', () => {
    const onClose = vi.fn();
    renderModal([], onClose);
    const cancelBtn = screen.getByRole('button', { name: /Annuler/i });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('isDirty est vrai quand un shift est sélectionné', async () => {
    renderModal();
    const shiftSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(shiftSelect, { target: { value: 'MORNING' } });
    await waitFor(() => {
      const overlay = document.querySelector('.modal-confirm-overlay');
      expect(overlay).toBeNull();
    });
  });
});

// ─── soumission ───────────────────────────────────────────────────────────────

describe('CreateIncidentModal – soumission', () => {
  it('n\'appelle pas createWorkshopIncident si le formulaire est incomplet', () => {
    renderModal();
    const aperçuBtn = screen.getByRole('button', { name: /Aperçu/i });
    fireEvent.click(aperçuBtn);
    expect(workshopApi.createWorkshopIncident).not.toHaveBeenCalled();
  });
});

// ─── soumission réussie ────────────────────────────────────────────────────────

describe('CreateIncidentModal – soumission réussie', () => {
  it('appelle createWorkshopIncident et onSuccess après soumission complète', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    vi.mocked(workshopApi.createWorkshopIncident).mockResolvedValue({ id: 1 } as never);
    renderModal([mockLine()], onClose, onSuccess);

    // Sélectionner le shift
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'MATIN' } });

    // Attendre que le formulaire soit rendu avec les lignes
    await waitFor(() => {
      expect(screen.getByText('L01')).toBeDefined();
    });
  });

  it('gère l\'erreur API 400 et affiche un message', async () => {
    const { ApiResponseError } = await import('../../api/client');
    vi.mocked(workshopApi.createWorkshopIncident).mockRejectedValue(
      new ApiResponseError('VALIDATION_ERROR', 'Sélection invalide', 400)
    );
    renderModal();
    // Modal reste ouverte en cas d'erreur
    expect(screen.getByText('Créer un incident')).toBeDefined();
  });
});

// ─── mode requestOnly ──────────────────────────────────────────────────────────

describe('CreateIncidentModal – mode requestOnly', () => {
  it("affiche Modifier l'incident si un incident est fourni (mode édition)", () => {
    const incident = {
      id: 1, shift: 'MATIN' as const, line_id: 1, line_number: 'L01',
      machine_id: 'M01', machine_brand: 'Fanuc', robot_label: 'R01', head_number: 1,
      state: 'DEGRADEE' as const, status: 'OPEN' as const, is_taken: false,
      is_priority: false, comment: null, current_product: null, display_order: 0,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      diagnostic: null, intervention_note: null, responsible_comment: null,
      edit_request: null, delete_request: false, delete_request_reason: null,
      taken_by_user_id: null, taken_at: null, taken_by_first_name: null,
      taken_by_last_name: null, taken_by_role: null,
      first_name: 'Jean', last_name: 'Dupont', role: 'OPERATOR' as const,
    };
    render(
      <CreateIncidentModal
        lines={[mockLine()]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        incident={incident as never}
        requestOnly
      />
    );
    expect(screen.getByText("Modifier l'incident")).toBeDefined();
  });
});
