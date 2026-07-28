import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MutationFeedbackProvider } from '../../components/ui/MutationFeedback';
import { useIncidentActions } from '../useIncidentActions';
import type { WorkshopIncident } from '../../types';
import type { ModalStateApi } from '../useModalState';

// On simule la couche API : chaque test décide si la mutation réussit ou échoue.
vi.mock('../../api/workshop', () => ({
  updateWorkshopIncident: vi.fn(),
  cancelWorkshopIncident: vi.fn(),
  followWorkshopIncident: vi.fn(),
  unfollowWorkshopIncident: vi.fn(),
}));

import {
  updateWorkshopIncident,
  cancelWorkshopIncident,
  followWorkshopIncident,
  unfollowWorkshopIncident,
} from '../../api/workshop';
import { ApiResponseError } from '../../api/client';

// Erreur API dont le message BRUT contient un nom technique + du snake_case :
// elle ne doit jamais apparaître à l'écran (C-03).
const RAW_TECHNICAL_MESSAGE = 'board_session_ttl_hours internal_failure';
function technicalApiError(): ApiResponseError {
  return new ApiResponseError('VALIDATION_ERROR', RAW_TECHNICAL_MESSAGE, 400, {
    field: 'boardSessionDuration',
    reason: 'OUT_OF_RANGE',
    min: 1,
    max: 168,
  });
}

const baseIncident = {
  id: 42,
  status: 'OPEN',
  is_taken: false,
  is_priority: false,
  is_followed: false,
  cancel_request: false,
  cancel_request_reason: null,
} as unknown as WorkshopIncident;

function makeModal(): ModalStateApi {
  return {
    state: {
      reviewIncident: null,
      unfollowConfirmIncident: null,
    },
    closeModal: vi.fn(),
    closeReview: vi.fn(),
    setReviewError: vi.fn(),
    setUnfollowConfirm: vi.fn(),
  } as unknown as ModalStateApi;
}

// Harness : monte le hub de mutations avec le feedback global et expose des
// boutons pour déclencher une prise en charge (mutation « simple »).
function Harness({ modal }: { modal: ModalStateApi }) {
  const actions = useIncidentActions({
    selectedIncident: baseIncident,
    clearSelectedIncident: vi.fn(),
    upsertIncident: vi.fn(),
    setIncidents: vi.fn(),
    refreshMetrics: () => Promise.resolve(),
    modal,
    isMaintenance: false,
    userRole: 'RESPONSABLE',
  });
  return (
    <button type="button" onClick={() => void actions.handleConfirmTakeCharge()}>
      Prendre en charge
    </button>
  );
}

function MutationMatrixHarness({
  modal,
  selectedIncident = baseIncident,
}: {
  modal: ModalStateApi;
  selectedIncident?: WorkshopIncident;
}) {
  const actions = useIncidentActions({
    selectedIncident,
    clearSelectedIncident: vi.fn(),
    upsertIncident: vi.fn(),
    setIncidents: vi.fn(),
    refreshMetrics: () => Promise.resolve(),
    modal,
    isMaintenance: false,
    userRole: 'RESPONSABLE',
  });
  return (
    <>
      <button type="button" onClick={() => void actions.handleSetPending('Attente composant')}>
        Mettre en attente
      </button>
      <button type="button" onClick={() => void actions.handleResumeIncident()}>
        Reprendre
      </button>
      <button
        type="button"
        onClick={() => void actions.handleCloseIncident('Intervention terminée')}
      >
        Clôturer
      </button>
      <button
        type="button"
        onClick={() => void actions.handleInvalidateIncident('Doublon confirmé')}
      >
        Invalider
      </button>
      <button type="button" onClick={() => void actions.handleRequestDelete('Erreur de saisie')}>
        Demander annulation
      </button>
      <button type="button" onClick={() => void actions.handleToggleUrgent(selectedIncident)}>
        Basculer urgence
      </button>
      <button type="button" onClick={() => void actions.handleToggleFollow(selectedIncident)}>
        Basculer suivi
      </button>
      <button type="button" onClick={() => void actions.handleApplyEditRequest()}>
        Appliquer correction
      </button>
      <button
        type="button"
        onClick={() => void actions.handleRejectEditRequest('Mesures incohérentes')}
      >
        Refuser correction
      </button>
      <button type="button" onClick={() => void actions.handleApproveDeleteRequest()}>
        Approuver annulation
      </button>
      <button
        type="button"
        onClick={() => void actions.handleRejectDeleteRequest('Incident confirmé')}
      >
        Refuser annulation
      </button>
    </>
  );
}

describe('useIncidentActions — retour d’action global (lot 1 RC3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('annonce le message métier de succès après une prise en charge réussie', async () => {
    (updateWorkshopIncident as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseIncident,
      is_taken: true,
    });
    const modal = makeModal();
    render(
      <MutationFeedbackProvider>
        <Harness modal={modal} />
      </MutationFeedbackProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Prendre en charge' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Prise en charge enregistrée.')
    );
    expect(modal.closeModal).toHaveBeenCalled();
  });

  it('annonce une erreur globale persistante si la prise en charge échoue', async () => {
    (updateWorkshopIncident as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom réseau')
    );
    const modal = makeModal();
    render(
      <MutationFeedbackProvider>
        <Harness modal={modal} />
      </MutationFeedbackProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Prendre en charge' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    // La modale n’est PAS fermée sur échec (récupération possible).
    expect(modal.closeModal).not.toHaveBeenCalled();
  });

  it('branche positivement les mutations de cycle, demandes et arbitrages sur le runner commun', async () => {
    const updated = { ...baseIncident, updated_at: '2026-07-28T12:00:00.000Z' };
    vi.mocked(updateWorkshopIncident).mockResolvedValue(updated);
    vi.mocked(followWorkshopIncident).mockResolvedValue({
      ...updated,
      is_followed: true,
    });
    vi.mocked(cancelWorkshopIncident).mockResolvedValue(undefined);
    const modal = makeModal();
    (modal.state as { reviewIncident: WorkshopIncident | null }).reviewIncident = baseIncident;
    render(
      <MutationFeedbackProvider>
        <MutationMatrixHarness modal={modal} />
      </MutationFeedbackProvider>
    );

    async function run(label: string, success: string): Promise<void> {
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(success));
    }

    await run('Mettre en attente', 'Incident mis en attente.');
    expect(updateWorkshopIncident).toHaveBeenCalledWith(42, {
      status: 'PENDING',
      waitingReason: 'Attente composant',
    });

    await run('Reprendre', 'Traitement repris.');
    expect(updateWorkshopIncident).toHaveBeenCalledWith(42, { status: 'OPEN' });

    await run('Clôturer', 'Incident clôturé et conservé dans l’historique.');
    expect(updateWorkshopIncident).toHaveBeenCalledWith(42, {
      status: 'CLOSED',
      interventionNote: 'Intervention terminée',
    });

    await run('Invalider', 'Incident invalidé et conservé dans l’historique.');
    expect(updateWorkshopIncident).toHaveBeenCalledWith(42, {
      status: 'INVALIDATED',
      invalidationReason: 'Doublon confirmé',
    });

    await run('Demander annulation', 'Demande d’annulation envoyée.');
    expect(updateWorkshopIncident).toHaveBeenCalledWith(42, {
      cancelRequest: true,
      cancelRequestReason: 'Erreur de saisie',
    });

    await run('Basculer urgence', 'Incident déclaré urgent.');
    expect(updateWorkshopIncident).toHaveBeenCalledWith(42, { isPriority: true });

    await run('Basculer suivi', 'Suivi activé.');
    expect(followWorkshopIncident).toHaveBeenCalledWith(42);

    await run('Appliquer correction', 'Correction appliquée.');
    expect(updateWorkshopIncident).toHaveBeenCalledWith(42, { applyEditRequest: true });

    await run('Refuser correction', 'Demande de modification refusée.');
    expect(updateWorkshopIncident).toHaveBeenCalledWith(42, {
      rejectEditRequest: true,
      decisionReason: 'Mesures incohérentes',
    });

    await run('Approuver annulation', 'Incident annulé et conservé dans l’historique.');
    expect(cancelWorkshopIncident).toHaveBeenCalledWith(42, { expectArbitration: true });

    await run('Refuser annulation', 'Demande d’annulation refusée.');
    expect(updateWorkshopIncident).toHaveBeenCalledWith(42, {
      rejectDeleteRequest: true,
      decisionReason: 'Incident confirmé',
    });
  });

  it('branche les retraits urgence/suivi actif et le retrait confirmé d’un suivi résolu', async () => {
    const activeFollowed = {
      ...baseIncident,
      is_priority: true,
      is_followed: true,
    };
    vi.mocked(updateWorkshopIncident).mockResolvedValue({
      ...activeFollowed,
      is_priority: false,
    });
    vi.mocked(unfollowWorkshopIncident).mockResolvedValue({
      ...activeFollowed,
      is_followed: false,
    });
    const activeModal = makeModal();
    render(
      <MutationFeedbackProvider>
        <MutationMatrixHarness modal={activeModal} selectedIncident={activeFollowed} />
      </MutationFeedbackProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Basculer urgence' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Urgence retirée.'));
    expect(updateWorkshopIncident).toHaveBeenCalledWith(42, { isPriority: false });

    fireEvent.click(screen.getByRole('button', { name: 'Basculer suivi' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Suivi désactivé.'));
    expect(unfollowWorkshopIncident).toHaveBeenCalledWith(42);

    cleanup();
    vi.clearAllMocks();
    const resolvedFollowed = {
      ...baseIncident,
      status: 'CLOSED',
      is_followed: true,
    } as WorkshopIncident;
    const resolvedModal = makeModal();
    (
      resolvedModal.state as { unfollowConfirmIncident: WorkshopIncident | null }
    ).unfollowConfirmIncident = resolvedFollowed;
    vi.mocked(unfollowWorkshopIncident).mockResolvedValue({
      ...resolvedFollowed,
      is_followed: false,
    });
    render(
      <MutationFeedbackProvider>
        <MutationMatrixHarness modal={resolvedModal} selectedIncident={resolvedFollowed} />
      </MutationFeedbackProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Basculer suivi' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Suivi désactivé.'));
    expect(unfollowWorkshopIncident).toHaveBeenCalledTimes(1);
    expect(resolvedModal.setUnfollowConfirm).toHaveBeenCalledWith(null);
  });

  it('n’envoie pas deux annulations si on clique deux fois vite', async () => {
    let resolve!: (v: unknown) => void;
    const pending = new Promise((r) => {
      resolve = r;
    });
    (cancelWorkshopIncident as ReturnType<typeof vi.fn>).mockReturnValue(pending);
    // Ce test vérifie le verrou anti-double-soumission au niveau du hub pour une
    // annulation directe : deux déclenchements rapprochés ⇒ un seul appel API.
    const modal = makeModal();
    function CancelHarness() {
      const actions = useIncidentActions({
        selectedIncident: baseIncident,
        clearSelectedIncident: vi.fn(),
        upsertIncident: vi.fn(),
        setIncidents: vi.fn(),
        refreshMetrics: () => Promise.resolve(),
        modal,
        isMaintenance: true,
        userRole: 'MAINTENANCE',
      });
      return (
        <button type="button" onClick={() => void actions.handleMaintenanceDeleteConfirm()}>
          Confirmer l’annulation
        </button>
      );
    }
    render(
      <MutationFeedbackProvider>
        <CancelHarness />
      </MutationFeedbackProvider>
    );
    const button = screen.getByRole('button', { name: 'Confirmer l’annulation' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect((cancelWorkshopIncident as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    await act(async () => {
      resolve({});
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Incident annulé et conservé dans l’historique.'
      )
    );
    expect(modal.closeModal).toHaveBeenCalledTimes(1);
  });

  it('NÉGATIF runner partagé : l’alerte n’affiche jamais le message technique brut ni le snake_case', async () => {
    (updateWorkshopIncident as ReturnType<typeof vi.fn>).mockRejectedValue(technicalApiError());
    const modal = makeModal();
    render(
      <MutationFeedbackProvider>
        <Harness modal={modal} />
      </MutationFeedbackProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Prendre en charge' }));

    const alert = await screen.findByRole('alert');
    // Contenu EXACT vérifié : libellé public français, jamais la chaîne technique.
    expect(alert).toHaveTextContent('La durée de session Board doit être comprise entre 1 et 168.');
    expect(alert.textContent).not.toContain('board_session_ttl_hours');
    expect(alert.textContent).not.toContain('internal_failure');
    expect(alert.textContent).not.toMatch(/[a-z]+_[a-z]+/);
    // Le DOM entier ne contient nulle part la chaîne technique.
    expect(document.body.textContent).not.toContain(RAW_TECHNICAL_MESSAGE);
    // Récupération : la modale reste ouverte sur échec.
    expect(modal.closeModal).not.toHaveBeenCalled();
  });

  it('NÉGATIF handleApplyEditRequest() : setReviewError reçoit un libellé sûr, jamais le message brut', async () => {
    (updateWorkshopIncident as ReturnType<typeof vi.fn>).mockRejectedValue(technicalApiError());
    const modal = makeModal();
    // La modale d'arbitrage porte l'incident à réviser.
    (modal.state as { reviewIncident: WorkshopIncident | null }).reviewIncident = baseIncident;

    function ApplyHarness() {
      const actions = useIncidentActions({
        selectedIncident: baseIncident,
        clearSelectedIncident: vi.fn(),
        upsertIncident: vi.fn(),
        setIncidents: vi.fn(),
        refreshMetrics: () => Promise.resolve(),
        modal,
        isMaintenance: false,
        userRole: 'RESPONSABLE',
      });
      return (
        <button type="button" onClick={() => void actions.handleApplyEditRequest()}>
          Appliquer la correction
        </button>
      );
    }
    render(
      <MutationFeedbackProvider>
        <ApplyHarness />
      </MutationFeedbackProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer la correction' }));

    await waitFor(() => expect(modal.setReviewError).toHaveBeenCalled());
    const reviewErrorCalls = (modal.setReviewError as ReturnType<typeof vi.fn>).mock.calls;
    const shown = reviewErrorCalls[reviewErrorCalls.length - 1][0] as string;
    expect(shown).toBe('La durée de session Board doit être comprise entre 1 et 168.');
    expect(shown).not.toContain('board_session_ttl_hours');
    expect(shown).not.toContain('internal_failure');
    expect(shown).not.toMatch(/[a-z]+_[a-z]+/);
    // La revue reste ouverte sur échec (closeReview non appelée).
    expect(modal.closeReview).not.toHaveBeenCalled();
  });
});
