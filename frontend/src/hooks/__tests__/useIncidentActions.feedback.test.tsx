import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

import { updateWorkshopIncident, cancelWorkshopIncident } from '../../api/workshop';

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
    setReviewLoading: vi.fn(),
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
        <button type="button" onClick={() => void actions.handleMaintenanceDeleteConfirm('direct')}>
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
  });
});
