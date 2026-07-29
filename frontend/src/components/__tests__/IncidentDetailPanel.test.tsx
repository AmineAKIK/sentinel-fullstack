import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MutationFeedbackProvider } from '../ui/MutationFeedback';
import IncidentDetailPanel from '../IncidentDetailPanel';
import { ModalStateApi } from '../../hooks/useModalState';
import { WorkshopIncident } from '../../types';

const resolvedVoid = () => Promise.resolve();

function mockIncident(overrides: Partial<WorkshopIncident> = {}): WorkshopIncident {
  return {
    id: 1,
    user_id: 1,
    line_id: 1,
    line_number: '117',
    machine_id: 'MCH-2117',
    machine_brand: 'Panasonic',
    robot_label: 'Droite 4',
    head_number: 2,
    state: 'SKIPEE_PAR_MACHINE',
    comment: 'A faire vite',
    current_product: 'aida',
    is_taken: false,
    is_priority: true,
    status: 'OPEN',
    diagnostic: null,
    waiting_reason: null,
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
    created_at: '2026-06-28T10:24:00.000Z',
    updated_at: '2026-06-28T10:24:00.000Z',
    first_name: 'Eden',
    last_name: 'AKIK',
    badge_number: null,
    role: 'RESPONSABLE',
    is_followed: true,
    ...overrides,
  };
}

function mockModal(): ModalStateApi {
  return {
    state: {
      activeModal: null,
      reviewIncident: null,
      reviewType: null,
      reviewError: '',
      unfollowConfirmIncident: null,
      deleteResponsibleCommentIncident: null,
    },
    openModal: vi.fn(),
    closeModal: vi.fn(),
    openReview: vi.fn(),
    closeReview: vi.fn(),
    setReviewError: vi.fn(),
    setUnfollowConfirm: vi.fn(),
    setDeleteCommentConfirm: vi.fn(),
  };
}

function renderPanel({
  incident = mockIncident(),
  userRole = 'RESPONSABLE',
  userId = 1,
  isResponsable = true,
  patchIncident = vi.fn(() => Promise.resolve(incident)),
}: {
  incident?: WorkshopIncident;
  userRole?: 'OPERATOR' | 'MAINTENANCE' | 'RESPONSABLE';
  userId?: number;
  isResponsable?: boolean;
  patchIncident?: (id: number, payload: unknown) => Promise<WorkshopIncident>;
} = {}) {
  const modal = mockModal();

  const view = render(
    <MemoryRouter>
      <MutationFeedbackProvider>
        <IncidentDetailPanel
          incident={incident}
          lines={[]}
          modal={modal}
          userRole={userRole}
          userId={userId}
          isResponsable={isResponsable}
          onBack={vi.fn()}
          onToggleFollow={vi.fn(resolvedVoid)}
          onToggleUrgent={vi.fn(resolvedVoid)}
          onConfirmTakeCharge={vi.fn(resolvedVoid)}
          onRequestDelete={vi.fn(resolvedVoid)}
          onSetPending={vi.fn(resolvedVoid)}
          onResumeIncident={vi.fn(resolvedVoid)}
          onCloseIncident={vi.fn(resolvedVoid)}
          onInvalidateIncident={vi.fn(resolvedVoid)}
          onMaintenanceDeleteConfirm={vi.fn(resolvedVoid)}
          onEditSuccess={vi.fn()}
          onDeleteCommentConfirm={vi.fn(resolvedVoid)}
          patchIncident={patchIncident}
        />
      </MutationFeedbackProvider>
    </MemoryRouter>
  );

  return { modal, patchIncident, ...view };
}

describe('IncidentDetailPanel', () => {
  it('ne rend aucune section Diagnostic pour une valeur vide ou blanche', () => {
    renderPanel({
      incident: mockIncident({
        comment: null,
        diagnostic: '   ',
        waiting_reason: null,
        intervention_note: null,
      }),
    });

    expect(screen.queryByText('Diagnostic')).not.toBeInTheDocument();
  });

  it('affiche la synthèse, le dossier et les décisions du drawer', () => {
    renderPanel({
      incident: mockIncident({
        edit_request: { state: 'DEGRADEE' },
        cancel_request: true,
      }),
    });

    expect(screen.getByRole('heading', { name: 'Décision requise' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Dossier' })).toBeDefined();
    expect(screen.getByRole('heading', { name: "Suivi de l'incident" })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Contexte machine' })).toBeDefined();
    expect(screen.getAllByText('Urgent')).toHaveLength(1);
    expect(screen.getAllByText('Ouvert')).toHaveLength(1);
    expect(screen.queryByText('Suivi')).toBeNull();
    expect(screen.getAllByText('Non pris')).toHaveLength(1);
    expect(screen.getByText('Correction opérateur')).toBeDefined();
    expect(screen.getByText('Annulation opérateur')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Notes' })).toBeNull();
  });

  it('déplace le focus sur le titre du dossier à l’ouverture (clavier, lot 8)', () => {
    renderPanel({ incident: mockIncident({ line_number: '117', machine_id: 'MCH-2117' }) });

    const title = screen.getByRole('heading', { name: 'Ligne 117 · MCH-2117' });
    // Focusable programmatiquement sans entrer dans l'ordre de tabulation…
    expect(title.getAttribute('tabindex')).toBe('-1');
    // …et effectivement focalisé quand le dossier s'ouvre : l'utilisateur
    // clavier entre dans le panneau au lieu de rester sur la carte.
    expect(document.activeElement).toBe(title);
  });

  it('nomme explicitement l’action destructive responsable', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: "Annuler l'incident" })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Annuler$/ })).toBeNull();
  });

  it('nomme explicitement une demande opérateur d’annulation', () => {
    renderPanel({
      incident: mockIncident({ role: 'OPERATOR', user_id: 7, is_followed: false }),
      userRole: 'OPERATOR',
      userId: 7,
      isResponsable: false,
    });

    expect(screen.getByRole('button', { name: "Demander l'annulation" })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Annuler$/ })).toBeNull();
  });

  it("permet de reprendre l'arbitrage depuis le détail après consultation du cas", () => {
    const incident = mockIncident({
      edit_request: { state: 'DEGRADEE' },
      arbitration: {
        edit: {
          caseId: 21,
          requestEventId: 42,
          requestedAt: '2026-06-28T11:00:00.000Z',
          state: 'WAITING',
          consultedAt: '2026-06-28T11:05:00.000Z',
        },
      },
    });
    const { modal } = renderPanel({ incident });

    fireEvent.click(screen.getByRole('button', { name: 'Reprendre' }));

    expect(modal.openReview).toHaveBeenCalledWith(incident, 'edit');
  });

  it('affiche la consigne responsable même sans droit d’édition', () => {
    renderPanel({
      incident: mockIncident({
        responsible_comment: 'Prioriser après contrôle qualité.',
        is_taken: true,
        taken_by_user_id: 9,
        taken_by_first_name: 'Assia',
        taken_by_last_name: 'AKIK',
        taken_by_role: 'MAINTENANCE',
      }),
      userRole: 'MAINTENANCE',
      userId: 9,
      isResponsable: false,
    });

    expect(screen.getByRole('heading', { name: 'Consigne du responsable' })).toBeDefined();
    expect(screen.getByText('Prioriser après contrôle qualité.')).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'Consigne du responsable' })).toBeNull();
  });
});

describe('IncidentDetailPanel – retrait de la demande d’annulation (lot 5)', () => {
  const requesterIncident = (overrides: Partial<WorkshopIncident> = {}) =>
    mockIncident({
      role: 'OPERATOR',
      user_id: 7,
      is_followed: false,
      cancel_request: true,
      cancel_request_reason: 'Doublon de signalement.',
      ...overrides,
    });

  function renderAsRequester(
    patchIncident?: (id: number, payload: unknown) => Promise<WorkshopIncident>
  ) {
    const incident = requesterIncident();
    return renderPanel({
      incident,
      userRole: 'OPERATOR',
      userId: 7,
      isResponsable: false,
      patchIncident,
    });
  }

  it('offre « Retirer ma demande » au demandeur tant que la demande est active', () => {
    renderAsRequester();
    expect(screen.getByRole('button', { name: 'Retirer ma demande' })).toBeDefined();
  });

  it('n’offre pas le retrait à un autre opérateur que le demandeur', () => {
    renderPanel({
      incident: requesterIncident(),
      userRole: 'OPERATOR',
      userId: 99, // pas l'auteur de la demande
      isResponsable: false,
    });
    expect(screen.queryByRole('button', { name: 'Retirer ma demande' })).toBeNull();
  });

  it('n’offre pas le retrait quand aucune demande d’annulation n’est en attente', () => {
    renderPanel({
      incident: requesterIncident({ cancel_request: false, cancel_request_reason: null }),
      userRole: 'OPERATOR',
      userId: 7,
      isResponsable: false,
    });
    expect(screen.queryByRole('button', { name: 'Retirer ma demande' })).toBeNull();
  });

  it('envoie withdrawCancelRequest et affiche un retour de succès accessible', async () => {
    const patchIncident = vi.fn(() => Promise.resolve(mockIncident()));
    renderAsRequester(patchIncident);

    fireEvent.click(screen.getByRole('button', { name: 'Retirer ma demande' }));

    await screen.findByText('Demande d’annulation retirée.');
    expect(patchIncident).toHaveBeenCalledTimes(1);
    expect(patchIncident).toHaveBeenCalledWith(1, { withdrawCancelRequest: true });
  });

  it('verrouille le bouton pendant la requête (anti double-clic)', async () => {
    // Promesse contrôlée pour figer l'action « en cours ».
    let resolvePatch: (value: WorkshopIncident) => void = () => {};
    const patchIncident = vi.fn(
      () =>
        new Promise<WorkshopIncident>((resolve) => {
          resolvePatch = resolve;
        })
    );
    renderAsRequester(patchIncident);

    const button = screen.getByRole('button', { name: 'Retirer ma demande' });
    fireEvent.click(button);
    // Deuxième clic immédiat pendant que la première requête est en vol.
    fireEvent.click(button);

    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(patchIncident).toHaveBeenCalledTimes(1);

    resolvePatch(mockIncident());
    await screen.findByText('Demande d’annulation retirée.');
  });

  it('affiche une erreur métier traduite et reste utilisable après un conflit', async () => {
    const { ApiResponseError } = await import('../../api/client');
    // Constructeur : (code, message, status, details?). Le `message` brut ne
    // doit JAMAIS s'afficher — seule la traduction publique du code apparaît.
    const conflict = new ApiResponseError('CONFLICT', 'ignored-raw-message', 409);
    const patchIncident = vi.fn((): Promise<WorkshopIncident> => Promise.reject(conflict));
    renderAsRequester(patchIncident);

    const button = screen.getByRole('button', { name: 'Retirer ma demande' });
    fireEvent.click(button);

    await screen.findByText(
      'Cette action entre en conflit avec l’état actuel. Rechargez puis réessayez.'
    );
    expect(screen.queryByText('ignored-raw-message')).toBeNull();
    // Après échec, le bouton est de nouveau actionnable (récupération).
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('montre l’arbitrage en cours à un rôle non autorisé SANS exposer de commande', () => {
    renderPanel({
      incident: mockIncident({
        role: 'OPERATOR',
        user_id: 7,
        cancel_request: true,
        cancel_request_reason: 'Doublon de signalement.',
        edit_request: { state: 'DEGRADEE' },
      }),
      userRole: 'MAINTENANCE',
      userId: 42,
      isResponsable: false,
    });

    // L'existence de l'arbitrage est un fait commun : le technicien la voit…
    expect(screen.getByRole('heading', { name: 'Demande en cours' })).toBeDefined();
    expect(screen.getByText('Correction opérateur')).toBeDefined();
    expect(screen.getByText('Annulation opérateur')).toBeDefined();
    // …mais aucune commande d'arbitrage ne lui est offerte.
    expect(screen.queryByRole('button', { name: 'Arbitrer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reprendre' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Décision requise' })).toBeNull();
  });
});

describe('IncidentDetailPanel – mutations panneau via le runner partagé RC4', () => {
  it('retire positivement une demande de correction et annonce le succès exact', async () => {
    const incident = mockIncident({
      role: 'OPERATOR',
      user_id: 7,
      is_followed: false,
      edit_request: { comment: 'Correction proposée' },
    });
    const updated = mockIncident({
      role: 'OPERATOR',
      user_id: 7,
      is_followed: false,
      edit_request: null,
    });
    const patchIncident = vi.fn(() => Promise.resolve(updated));
    renderPanel({
      incident,
      userRole: 'OPERATOR',
      userId: 7,
      isResponsable: false,
      patchIncident,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retirer ma demande' }));

    await screen.findByText('Demande de correction retirée.');
    expect(patchIncident).toHaveBeenCalledTimes(1);
    expect(patchIncident).toHaveBeenCalledWith(1, { withdrawEditRequest: true });
  });

  it('conserve une consigne byte-for-byte après erreur, refocalise puis réussit au vrai réessai', async () => {
    const rawTechnicalError =
      'board_session_ttl_hours waiting_reason decision_reason internal_failure SELECT * FROM workshop_incidents HTTP 500 Internal Server Error internal_field_rc4 internal_reason_rc4';
    const incident = mockIncident({
      responsible_comment: null,
      role: 'RESPONSABLE',
    });
    const patchIncident = vi
      .fn<(id: number, payload: unknown) => Promise<WorkshopIncident>>()
      .mockRejectedValueOnce(new Error(rawTechnicalError))
      .mockResolvedValueOnce({
        ...incident,
        responsible_comment: 'Prioriser après contrôle qualité β.',
      });
    renderPanel({ incident, patchIncident });
    const textarea = screen.getByLabelText<HTMLTextAreaElement>('Consigne du responsable');
    const exactDraft = '  Prioriser après contrôle qualité β.\nPoste\t2  ';
    fireEvent.change(textarea, { target: { value: exactDraft } });

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    expect(await screen.findByText("Impossible d'enregistrer la consigne.")).toHaveAttribute(
      'role',
      'alert'
    );
    expect(textarea.value).toBe(exactDraft);
    await waitFor(() => expect(textarea).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeEnabled();
    expect(document.body.textContent).not.toContain(rawTechnicalError);

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    await screen.findByText('Consigne enregistrée.');
    expect(patchIncident).toHaveBeenCalledTimes(2);
    expect(patchIncident).toHaveBeenLastCalledWith(1, {
      responsibleComment: exactDraft.trim(),
    });
  });

  it('rend le pending du panneau observable et bloque deux activations à un appel', async () => {
    let resolvePatch!: (value: WorkshopIncident) => void;
    const incident = mockIncident({ responsible_comment: null, role: 'RESPONSABLE' });
    const patchIncident = vi.fn(
      () =>
        new Promise<WorkshopIncident>((resolve) => {
          resolvePatch = resolve;
        })
    );
    renderPanel({ incident, patchIncident });
    fireEvent.change(screen.getByLabelText('Consigne du responsable'), {
      target: { value: 'Prioriser ce contrôle' },
    });
    const submit = screen.getByRole('button', { name: 'Ajouter' });

    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(patchIncident).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.incident-detail-content')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled();
    expect(screen.getByLabelText('Consigne du responsable')).toBeDisabled();

    resolvePatch({ ...incident, responsible_comment: 'Prioriser ce contrôle' });
    await screen.findByText('Consigne enregistrée.');
  });
});

describe('IncidentDetailPanel – sémantique visuelle de l’urgence (RC5)', () => {
  it('rend l’activation avec la variante critique canonique, pas btn-warning', () => {
    renderPanel({ incident: mockIncident({ is_priority: false }) });

    const button = screen.getByRole('button', { name: 'Déclarer urgent' });
    expect(button.className).toMatch(/\bbtn-critical\b/);
    expect(button.className).not.toMatch(/\bbtn-warning\b/);
  });

  it('sa couleur calculée correspond au token urgent aligné sur le badge Urgent, pas à --color-warning', () => {
    renderPanel({ incident: mockIncident({ is_priority: false }) });

    const button = screen.getByRole('button', { name: 'Déclarer urgent' });
    const backgroundColor = window.getComputedStyle(button).backgroundColor;
    // --color-warning: #b45309 → rgb(180, 83, 9). Le bouton d'activation ne
    // doit plus jamais résoudre vers cette teinte orange/brun.
    expect(backgroundColor).not.toBe('rgb(180, 83, 9)');
  });

  it('distingue visuellement activation (critique pleine) et retrait (contour) de l’urgence', () => {
    const { rerender } = renderPanel({ incident: mockIncident({ is_priority: false }) });
    const activate = screen.getByRole('button', { name: 'Déclarer urgent' });
    expect(activate.className).toMatch(/\bbtn-critical\b/);
    expect(activate.className).not.toMatch(/\bbtn-critical-outline\b/);

    rerender(
      <MemoryRouter>
        <MutationFeedbackProvider>
          <IncidentDetailPanel
            incident={mockIncident({ is_priority: true })}
            lines={[]}
            modal={mockModal()}
            userRole="RESPONSABLE"
            userId={1}
            isResponsable
            onBack={vi.fn()}
            onToggleFollow={vi.fn(resolvedVoid)}
            onToggleUrgent={vi.fn(resolvedVoid)}
            onConfirmTakeCharge={vi.fn(resolvedVoid)}
            onRequestDelete={vi.fn(resolvedVoid)}
            onSetPending={vi.fn(resolvedVoid)}
            onResumeIncident={vi.fn(resolvedVoid)}
            onCloseIncident={vi.fn(resolvedVoid)}
            onInvalidateIncident={vi.fn(resolvedVoid)}
            onMaintenanceDeleteConfirm={vi.fn(resolvedVoid)}
            onEditSuccess={vi.fn()}
            onDeleteCommentConfirm={vi.fn(resolvedVoid)}
            patchIncident={vi.fn(() => Promise.resolve(mockIncident({ is_priority: true })))}
          />
        </MutationFeedbackProvider>
      </MemoryRouter>
    );

    const remove = screen.getByRole('button', { name: "Retirer l'urgence" });
    expect(remove.className).not.toMatch(/\bbtn-critical\b(?!-outline)/);
  });

  it('expose aria-pressed=false sur l’activation et aria-pressed=true sur le retrait', () => {
    const { unmount } = renderPanel({ incident: mockIncident({ is_priority: false }) });
    expect(screen.getByRole('button', { name: 'Déclarer urgent' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    unmount();

    renderPanel({ incident: mockIncident({ is_priority: true }) });
    expect(screen.getByRole('button', { name: "Retirer l'urgence" })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
