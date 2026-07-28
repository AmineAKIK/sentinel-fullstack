import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../api/workshop', () => ({
  createWorkshopIncident: vi.fn(),
  updateWorkshopIncident: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  ApiResponseError: class ApiResponseError extends Error {
    constructor(
      public code: string,
      message: string,
      public status: number,
      public details?: {
        field?: string;
        reason?: string;
        min?: number;
        max?: number;
        count?: number;
      }
    ) {
      super(message);
      this.name = 'ApiResponseError';
    }
  },
}));

import * as workshopApi from '../../api/workshop';
import CreateIncidentModal from '../CreateIncidentModal';
import { MutationFeedbackProvider } from '../ui/MutationFeedback';
import { ProductionLine, WorkshopIncident } from '../../types';

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

function mockIncident(overrides: Partial<WorkshopIncident> = {}): WorkshopIncident {
  return {
    id: 41,
    user_id: 7,
    line_id: 1,
    line_number: 'L01',
    machine_id: 'M01',
    machine_brand: 'Fanuc',
    robot_label: 'R01',
    head_number: 1,
    state: 'DEGRADEE',
    status: 'OPEN',
    is_taken: false,
    is_priority: false,
    comment: 'Commentaire initial',
    current_product: 'REF-INITIALE',
    display_order: 0,
    created_at: '2026-01-02T03:04:05.000Z',
    updated_at: '2026-01-02T03:04:05.000Z',
    diagnostic: null,
    waiting_reason: null,
    intervention_note: null,
    responsible_comment: null,
    edit_request: null,
    cancel_request: false,
    cancel_request_reason: null,
    delete_request: false,
    delete_request_reason: null,
    taken_by_user_id: null,
    taken_at: null,
    taken_by_first_name: null,
    taken_by_last_name: null,
    taken_by_role: null,
    first_name: 'Jean',
    last_name: 'Dupont',
    badge_number: 'OP-007',
    role: 'OPERATOR',
    ...overrides,
  };
}

function renderModal(
  lines: ProductionLine[] = [mockLine()],
  onClose: () => void = vi.fn(),
  onSuccess: (incident: WorkshopIncident) => void = vi.fn()
) {
  return render(<CreateIncidentModal lines={lines} onClose={onClose} onSuccess={onSuccess} />, {
    wrapper: MutationFeedbackProvider,
  });
}

function renderRequestOnlyModal({
  incident = mockIncident(),
  onClose = vi.fn(),
  onSuccess = vi.fn(),
}: {
  incident?: WorkshopIncident;
  onClose?: () => void;
  onSuccess?: (incident: WorkshopIncident) => void;
} = {}) {
  return render(
    <CreateIncidentModal
      lines={[mockLine()]}
      onClose={onClose}
      onSuccess={onSuccess}
      incident={incident}
      requestOnly
    />,
    { wrapper: MutationFeedbackProvider }
  );
}

function chooseOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

function completeCreationForm() {
  chooseOption('Ligne', 'L01');
  chooseOption('Machine', 'M01 · Fanuc');
  chooseOption('Robot', 'R01');
  chooseOption('Tête', '1');
  chooseOption('État', 'Dégradée');
  fireEvent.change(screen.getByLabelText(/Produit en cours/i), {
    target: { value: 'REF-001' },
  });
}

function openPreview() {
  fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));
}

function submitPreview(label: 'Valider la création' | 'Valider la modification') {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const EDIT_COMMENT = '  Commentaire opérateur — ligne α\nseconde ligne  ';
const EDIT_PRODUCT = '  LOT-RC4 / β-42  ';
const TECHNICAL_SENTINELS = [
  'board_session_ttl_hours',
  'waiting_reason',
  'decision_reason',
  'internal_failure',
  'SELECT * FROM workshop_incidents',
  'HTTP 500 Internal Server Error',
  'details.field',
  'details.reason',
] as const;

function enterEditValues() {
  fireEvent.change(screen.getByLabelText('Commentaire'), {
    target: { value: EDIT_COMMENT },
  });
  fireEvent.change(screen.getByLabelText(/Produit en cours/i), {
    target: { value: EDIT_PRODUCT },
  });
}

function expectTechnicalSentinelsAbsent() {
  for (const sentinel of TECHNICAL_SENTINELS) {
    expect(document.body).not.toHaveTextContent(sentinel);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── rendu ────────────────────────────────────────────────────────────────────

describe('CreateIncidentModal – rendu', () => {
  it('affiche le champ produit en cours', () => {
    renderModal();
    expect(screen.getByLabelText(/Produit en cours/i)).toBeDefined();
  });

  it('affiche le titre de création', () => {
    renderModal();
    expect(screen.getByText('Créer un incident')).toBeDefined();
  });

  it('affiche L01 dans la liste des lignes', () => {
    renderModal([mockLine({ line_number: 'L01' })]);
    fireEvent.click(screen.getByRole('combobox', { name: 'Ligne' }));
    expect(screen.getByRole('option', { name: 'L01' })).toBeDefined();
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

  it('isDirty est vrai quand un état est sélectionné', async () => {
    renderModal();
    chooseOption('État', 'Dégradée');
    fireEvent.click(screen.getByRole('button', { name: /Fermer/i }));
    await waitFor(() => {
      expect(screen.getByText('Quitter sans enregistrer ?')).toBeDefined();
    });
  });
});

// ─── soumission ───────────────────────────────────────────────────────────────

describe('CreateIncidentModal – soumission', () => {
  it("n'appelle pas createWorkshopIncident si le formulaire est incomplet", () => {
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

    completeCreationForm();
    openPreview();
    submitPreview('Valider la création');

    await waitFor(() => {
      expect(workshopApi.createWorkshopIncident).toHaveBeenCalledWith({
        lineId: 1,
        machineId: 'M01',
        robotLabel: 'R01',
        headNumber: 1,
        state: 'DEGRADEE',
        comment: '',
        currentProduct: 'REF-001',
        requestOnly: undefined,
      });
      expect(onSuccess).toHaveBeenCalledWith({ id: 1 });
    });
  });

  it("soumet réellement le formulaire et maintient la modale après l'erreur API 400", async () => {
    const { ApiResponseError } = await import('../../api/client');
    const onSuccess = vi.fn();
    vi.mocked(workshopApi.createWorkshopIncident).mockRejectedValue(
      new ApiResponseError(
        'VALIDATION_ERROR',
        'HTTP 400 — waiting_reason — internal_failure',
        400,
        {
          field: 'waiting_reason',
          reason: 'internal_failure',
        }
      )
    );
    renderModal([mockLine()], vi.fn(), onSuccess);

    completeCreationForm();
    openPreview();
    submitPreview('Valider la création');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Une erreur est survenue. Veuillez réessayer.'
    );
    expect(workshopApi.createWorkshopIncident).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveAccessibleName("Aperçu de l'incident");
    expect(document.body).not.toHaveTextContent('HTTP 400');
    expect(document.body).not.toHaveTextContent('waiting_reason');
    expect(document.body).not.toHaveTextContent('internal_failure');
  });
});

describe('CreateIncidentModal – modification directe', () => {
  it('branche updateWorkshopIncident et annonce exactement la modification appliquée', async () => {
    const incident = mockIncident();
    const updated = mockIncident({
      comment: EDIT_COMMENT.trim(),
      current_product: EDIT_PRODUCT.trim(),
      updated_at: '2026-01-02T03:06:05.000Z',
    });
    const onSuccess = vi.fn();
    vi.mocked(workshopApi.updateWorkshopIncident).mockResolvedValue(updated);
    render(
      <CreateIncidentModal
        lines={[mockLine()]}
        incident={incident}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />,
      { wrapper: MutationFeedbackProvider }
    );

    enterEditValues();
    openPreview();
    submitPreview('Valider la modification');

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(updated));
    expect(workshopApi.updateWorkshopIncident).toHaveBeenCalledWith(incident.id, {
      lineId: 1,
      machineId: 'M01',
      robotLabel: 'R01',
      headNumber: 1,
      state: 'DEGRADEE',
      comment: EDIT_COMMENT.trim(),
      currentProduct: EDIT_PRODUCT.trim(),
      requestOnly: undefined,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Modification appliquée.');
  });
});

// ─── mode requestOnly ──────────────────────────────────────────────────────────

describe('CreateIncidentModal – mode requestOnly', () => {
  it("affiche Modifier l'incident si un incident est fourni (mode édition)", () => {
    renderRequestOnlyModal();
    expect(screen.getByText("Modifier l'incident")).toBeDefined();
  });

  it('annonce exactement la création de la demande, jamais une modification déjà appliquée', async () => {
    const incident = mockIncident();
    const updated = mockIncident({
      edit_request: { current_product: 'LOT-RC4' },
      updated_at: '2026-01-02T03:05:05.000Z',
    });
    const onSuccess = vi.fn();
    vi.mocked(workshopApi.updateWorkshopIncident).mockResolvedValue(updated);
    renderRequestOnlyModal({ incident, onSuccess });

    enterEditValues();
    openPreview();
    submitPreview('Valider la modification');

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(updated));
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Demande de correction envoyée.');
    expect(status).not.toHaveTextContent('Modification appliquée.');
    expect(workshopApi.updateWorkshopIncident).toHaveBeenCalledWith(incident.id, {
      lineId: 1,
      machineId: 'M01',
      robotLabel: 'R01',
      headNumber: 1,
      state: 'DEGRADEE',
      comment: EDIT_COMMENT.trim(),
      currentProduct: EDIT_PRODUCT.trim(),
      requestOnly: true,
    });
  });

  it('expose le pending par aria-busy, désactive la commande et emploie un libellé progressif métier', async () => {
    const request = deferred<WorkshopIncident>();
    const updated = mockIncident({ edit_request: { current_product: 'LOT-RC4' } });
    vi.mocked(workshopApi.updateWorkshopIncident).mockReturnValue(request.promise);
    renderRequestOnlyModal();

    enterEditValues();
    openPreview();
    submitPreview('Valider la modification');
    await waitFor(() => expect(workshopApi.updateWorkshopIncident).toHaveBeenCalledTimes(1));

    const dialog = screen.getByRole('dialog');
    const pendingButton = screen.getByRole('button', { name: /…/ });
    const pendingSnapshot = {
      ariaBusy: dialog.getAttribute('aria-busy'),
      disabled: pendingButton.hasAttribute('disabled'),
      label: pendingButton.textContent?.trim(),
    };

    await act(async () => {
      request.resolve(updated);
      await request.promise;
    });

    expect(pendingSnapshot).toEqual({
      ariaBusy: 'true',
      disabled: true,
      label: 'Envoi de la demande…',
    });
  });

  it('transforme une double activation rapprochée en une seule requête', async () => {
    const user = userEvent.setup();
    const request = deferred<WorkshopIncident>();
    vi.mocked(workshopApi.updateWorkshopIncident).mockReturnValue(request.promise);
    renderRequestOnlyModal();

    enterEditValues();
    openPreview();
    await user.dblClick(screen.getByRole('button', { name: 'Valider la modification' }));

    expect(workshopApi.updateWorkshopIncident).toHaveBeenCalledTimes(1);

    await act(async () => {
      request.resolve(mockIncident({ edit_request: { state: 'INDISPONIBLE' } }));
      await request.promise;
    });
  });

  it('conserve les saisies byte-for-byte après une erreur réseau, réactive puis réussit au réessai', async () => {
    const onSuccess = vi.fn();
    const updated = mockIncident({ edit_request: { current_product: 'LOT-RC4' } });
    vi.mocked(workshopApi.updateWorkshopIncident)
      .mockRejectedValueOnce(
        new Error(
          'HTTP 500 Internal Server Error board_session_ttl_hours details.field details.reason'
        )
      )
      .mockResolvedValueOnce(updated);
    renderRequestOnlyModal({ onSuccess });

    enterEditValues();
    openPreview();
    submitPreview('Valider la modification');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Une erreur est survenue. Veuillez réessayer.'
    );
    const retryButton = screen.getByRole('button', { name: 'Valider la modification' });
    expect(retryButton).toBeEnabled();
    expectTechnicalSentinelsAbsent();

    fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByLabelText('Commentaire')).toHaveValue(EDIT_COMMENT);
    expect(screen.getByLabelText(/Produit en cours/i)).toHaveValue(EDIT_PRODUCT);

    openPreview();
    submitPreview('Valider la modification');

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(updated));
    expect(workshopApi.updateWorkshopIncident).toHaveBeenCalledTimes(2);
  });

  it('traduit une erreur métier sans fuite, conserve les saisies et autorise un réessai réussi', async () => {
    const { ApiResponseError } = await import('../../api/client');
    const onSuccess = vi.fn();
    const updated = mockIncident({ edit_request: { state: 'DEGRADEE' } });
    vi.mocked(workshopApi.updateWorkshopIncident)
      .mockRejectedValueOnce(
        new ApiResponseError(
          'ARBITRATION_ALREADY_PENDING',
          [
            'HTTP 500 Internal Server Error',
            'board_session_ttl_hours',
            'waiting_reason',
            'decision_reason',
            'internal_failure',
            'SELECT * FROM workshop_incidents',
            'details.field',
            'details.reason',
          ].join(' '),
          409,
          { field: 'waiting_reason', reason: 'internal_failure' }
        )
      )
      .mockResolvedValueOnce(updated);
    renderRequestOnlyModal({ onSuccess });

    enterEditValues();
    openPreview();
    submitPreview('Valider la modification');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Une demande d’arbitrage est déjà en attente sur cet incident.'
    );
    expectTechnicalSentinelsAbsent();
    expect(screen.getByRole('button', { name: 'Valider la modification' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByLabelText('Commentaire')).toHaveValue(EDIT_COMMENT);
    expect(screen.getByLabelText(/Produit en cours/i)).toHaveValue(EDIT_PRODUCT);

    openPreview();
    submitPreview('Valider la modification');

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(updated));
    expect(workshopApi.updateWorkshopIncident).toHaveBeenCalledTimes(2);
  });
});
