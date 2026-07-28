import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MutationFeedbackProvider } from '../ui/MutationFeedback';
import PendingConfirmModal from '../PendingConfirmModal';
import { useIncidentActions } from '../../hooks/useIncidentActions';
import type { ModalStateApi } from '../../hooks/useModalState';
import type { WorkshopIncident } from '../../types';
import { ApiResponseError } from '../../api/client';

vi.mock('../../api/workshop', () => ({
  updateWorkshopIncident: vi.fn(),
  cancelWorkshopIncident: vi.fn(),
  followWorkshopIncident: vi.fn(),
  unfollowWorkshopIncident: vi.fn(),
}));

import { updateWorkshopIncident } from '../../api/workshop';

const incident = {
  id: 42,
  line_number: 'L42',
  machine_id: 'M42',
  status: 'OPEN',
  is_taken: true,
  is_priority: false,
  is_followed: false,
  cancel_request: false,
  cancel_request_reason: null,
} as unknown as WorkshopIncident;

function modalState(): ModalStateApi {
  return {
    state: {
      activeModal: 'pending',
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

function PendingMutationHarness({ modal }: { modal: ModalStateApi }) {
  const actions = useIncidentActions({
    selectedIncident: incident,
    clearSelectedIncident: vi.fn(),
    upsertIncident: vi.fn(),
    setIncidents: vi.fn(),
    refreshMetrics: () => Promise.resolve(),
    modal,
    isMaintenance: true,
    userRole: 'MAINTENANCE',
  });

  return (
    <PendingConfirmModal
      incident={incident}
      onClose={modal.closeModal}
      onConfirm={actions.handleSetPending}
    />
  );
}

function renderInApplicationRoot(ui: React.ReactNode) {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
  const result = render(<MutationFeedbackProvider>{ui}</MutationFeedbackProvider>, {
    container: root,
  });
  return { ...result, root };
}

describe('contrat commun des mutations Atelier avec saisie métier', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
    document.getElementById('root')?.remove();
  });

  it('garde l’erreur accessible dans la modale, la saisie byte-for-byte, puis permet un vrai réessai', async () => {
    const privatePayload = [
      'board_session_ttl_hours',
      'waiting_reason',
      'decision_reason',
      'internal_failure',
      'SELECT * FROM workshop_incidents',
      'HTTP 500 Internal Server Error',
      'field=waiting_reason',
      'reason=INVALID_FORMAT',
    ].join(' | ');
    vi.mocked(updateWorkshopIncident)
      .mockRejectedValueOnce(
        new ApiResponseError('PRIVATE_INTERNAL_CODE', privatePayload, 500, {
          field: 'waiting_reason',
          reason: 'decision_reason',
        })
      )
      .mockResolvedValueOnce({ ...incident, status: 'PENDING' });
    const modal = modalState();
    const { root } = renderInApplicationRoot(<PendingMutationHarness modal={modal} />);
    const dialog = screen.getByRole('dialog', { name: "Suspendre l'incident" });
    const textarea = within(dialog).getByLabelText<HTMLTextAreaElement>(
      'Motif de mise en attente *'
    );
    const exactDraft = '  Attente pièce A42\nContrôle\tqualité  ';

    fireEvent.change(textarea, { target: { value: exactDraft } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspendre' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Une erreur est survenue. Veuillez réessayer.');
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(textarea.value).toBe(exactDraft);
    expect(document.activeElement).toBe(textarea);
    expect(modal.closeModal).not.toHaveBeenCalled();
    for (const secret of privatePayload.split(' | ')) {
      expect(document.body.textContent).not.toContain(secret);
    }

    const retry = within(dialog).getByRole('button', { name: 'Suspendre' });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);

    await waitFor(() => expect(updateWorkshopIncident).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(modal.closeModal).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status')).toHaveTextContent('Incident mis en attente.');
    expect(updateWorkshopIncident).toHaveBeenLastCalledWith(42, {
      status: 'PENDING',
      waitingReason: exactDraft.trim(),
    });
  });

  it('rend le pending observable et bloque deux activations rapprochées', async () => {
    let resolveRequest!: (value: WorkshopIncident) => void;
    vi.mocked(updateWorkshopIncident).mockImplementation(
      () =>
        new Promise<WorkshopIncident>((resolve) => {
          resolveRequest = resolve;
        })
    );
    const modal = modalState();
    renderInApplicationRoot(<PendingMutationHarness modal={modal} />);
    const dialog = screen.getByRole('dialog', { name: "Suspendre l'incident" });
    fireEvent.change(within(dialog).getByLabelText('Motif de mise en attente *'), {
      target: { value: 'Attente composant' },
    });
    const submit = within(dialog).getByRole('button', { name: 'Suspendre' });

    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(updateWorkshopIncident).toHaveBeenCalledTimes(1));
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).getByRole('button', { name: 'Confirmation…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toBeDisabled();

    await act(async () => {
      resolveRequest({ ...incident, status: 'PENDING' });
      await Promise.resolve();
    });
  });
});
