import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ConfirmModal from '../../components/ConfirmModal';
import CloseIncidentModal from '../CloseIncidentModal';
import InvalidateIncidentModal from '../InvalidateIncidentModal';
import MaintenanceDeleteConfirmModal from '../MaintenanceDeleteConfirmModal';
import { MutationFeedbackProvider } from '../ui/MutationFeedback';
import { ApiResponseError } from '../../api/client';
import type { WorkshopIncident } from '../../types';

const destructiveIncident = {
  id: 42,
  line_number: 'L42',
  machine_id: 'M-7',
  status: 'OPEN',
} as WorkshopIncident;
const closedIncident = { ...destructiveIncident, status: 'CLOSED' } as WorkshopIncident;

type DestructiveConfirmationCase = {
  name: string;
  dialogName: string;
  triggerLabel: string;
  primaryLabel: string;
  consequence: RegExp;
  renderModal: (onClose: () => void) => React.ReactNode;
};

const destructiveConfirmationCases: DestructiveConfirmationCase[] = [
  {
    name: 'clôture',
    dialogName: "Clôturer l'incident",
    triggerLabel: 'Ouvrir la clôture',
    primaryLabel: 'Clôturer',
    consequence: /conservé dans l’historique/i,
    renderModal: (onClose) => (
      <CloseIncidentModal
        incident={destructiveIncident}
        onClose={onClose}
        onConfirm={() => Promise.resolve()}
      />
    ),
  },
  {
    name: 'invalidation',
    dialogName: 'Invalider l’incident clôturé',
    triggerLabel: "Ouvrir l'invalidation",
    primaryLabel: 'Confirmer l’invalidation',
    consequence: /restera dans le journal.*exclu des statistiques.*base de connaissance/is,
    renderModal: (onClose) => (
      <InvalidateIncidentModal
        incident={closedIncident}
        onClose={onClose}
        onConfirm={() => Promise.resolve()}
      />
    ),
  },
  {
    name: 'annulation définitive',
    dialogName: "Annuler l'incident",
    triggerLabel: "Ouvrir l'annulation",
    primaryLabel: 'Confirmer l’annulation',
    consequence: /conserve.*historique/i,
    renderModal: (onClose) => (
      <MaintenanceDeleteConfirmModal
        incident={destructiveIncident}
        title="Annuler l'incident"
        onClose={onClose}
        onConfirm={() => Promise.resolve()}
      />
    ),
  },
];

function DestructiveConfirmationHarness({
  triggerLabel,
  renderModal,
}: Pick<DestructiveConfirmationCase, 'triggerLabel' | 'renderModal'>) {
  const [open, setOpen] = React.useState(false);
  return (
    <MutationFeedbackProvider>
      <button type="button" onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      {open ? renderModal(() => setOpen(false)) : null}
    </MutationFeedbackProvider>
  );
}

// ─── rendering ────────────────────────────────────────────────────────────────

describe('ConfirmModal – rendering', () => {
  it('renders the title', () => {
    render(
      <ConfirmModal title="Confirmer l'action" onClose={vi.fn()}>
        <p>Êtes-vous sûr ?</p>
      </ConfirmModal>
    );
    expect(screen.getByText("Confirmer l'action")).toBeDefined();
  });

  it('renders children content', () => {
    render(
      <ConfirmModal title="T" onClose={vi.fn()}>
        <p>Contenu confirmation</p>
      </ConfirmModal>
    );
    expect(screen.getByText('Contenu confirmation')).toBeDefined();
  });

  it('renders the default confirm and cancel buttons', () => {
    render(
      <ConfirmModal title="T" onClose={vi.fn()} onConfirm={vi.fn()}>
        <span />
      </ConfirmModal>
    );
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDefined();
  });

  it('uses custom confirmLabel and cancelLabel', () => {
    render(
      <ConfirmModal
        title="T"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        confirmLabel="Supprimer"
        cancelLabel="Retour"
      >
        <span />
      </ConfirmModal>
    );
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retour' })).toBeDefined();
  });

  it('does NOT render a confirm button when onConfirm is omitted', () => {
    render(
      <ConfirmModal title="T" onClose={vi.fn()}>
        <span />
      </ConfirmModal>
    );
    expect(screen.queryByRole('button', { name: 'Confirmer' })).toBeNull();
  });
});

// ─── callbacks ────────────────────────────────────────────────────────────────

describe('ConfirmModal – callbacks', () => {
  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal title="T" onClose={vi.fn()} onConfirm={onConfirm}>
        <span />
      </ConfirmModal>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn();
    render(
      <ConfirmModal title="T" onClose={onClose} onConfirm={vi.fn()}>
        <span />
      </ConfirmModal>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate submissions while the first request is pending', () => {
    const onConfirm = vi.fn(() => new Promise<void>(() => {}));
    render(
      <ConfirmModal title="T" onClose={vi.fn()} onConfirm={onConfirm}>
        <span />
      </ConfirmModal>
    );
    const confirmButton = screen.getByRole('button', { name: 'Confirmer' });

    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirmButton).toBeDisabled();
  });
});

// ─── loading state ────────────────────────────────────────────────────────────

describe('ConfirmModal – loading', () => {
  it('disables confirm and cancel buttons while loading', () => {
    render(
      <ConfirmModal title="T" onClose={vi.fn()} onConfirm={vi.fn()} loading>
        <span />
      </ConfirmModal>
    );
    const cancelBtn = screen.getByRole('button', { name: 'Annuler' });
    expect((cancelBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows loadingLabel on confirm button while loading', () => {
    render(
      <ConfirmModal
        title="T"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        loading
        loadingLabel="Suppression…"
      >
        <span />
      </ConfirmModal>
    );
    expect(screen.getByText('Suppression…')).toBeDefined();
  });
});

// ─── disabled state ───────────────────────────────────────────────────────────

describe('ConfirmModal – disabled', () => {
  it('disables the confirm button when disabled=true', () => {
    render(
      <ConfirmModal title="T" onClose={vi.fn()} onConfirm={vi.fn()} disabled>
        <span />
      </ConfirmModal>
    );
    const confirmBtn = screen.getByRole('button', { name: 'Confirmer' });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

// ─── error display ────────────────────────────────────────────────────────────

describe('ConfirmModal – error', () => {
  it('renders an error message when error prop is set', () => {
    render(
      <ConfirmModal title="T" onClose={vi.fn()} error="Erreur serveur.">
        <span />
      </ConfirmModal>
    );
    expect(screen.getByText('Erreur serveur.')).toBeDefined();
  });

  it('does NOT render error element when error is empty string', () => {
    render(
      <ConfirmModal title="T" onClose={vi.fn()} error="">
        <span />
      </ConfirmModal>
    );
    expect(screen.queryByText('Erreur serveur.')).toBeNull();
  });

  it('traduit l’erreur API (code) sans jamais exposer le message brut (C-03)', async () => {
    // Le backend envoie un CODE + un message serveur ; le frontend affiche la
    // TRADUCTION du code, jamais le message brut.
    const onConfirm = vi.fn(() =>
      Promise.reject(new ApiResponseError('CONFLICT', 'raw server detail — do not show', 409))
    );
    render(
      <ConfirmModal title="T" onClose={vi.fn()} onConfirm={onConfirm}>
        <span />
      </ConfirmModal>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Cette action entre en conflit avec l’état actuel. Rechargez puis réessayez.'
      )
    );
    expect(document.body.textContent).not.toContain('raw server detail');
  });
});

// ─── variant ─────────────────────────────────────────────────────────────────

describe('ConfirmModal – variant', () => {
  it('applies btn-danger class to confirm button for variant="danger"', () => {
    render(
      <ConfirmModal title="T" onClose={vi.fn()} onConfirm={vi.fn()} variant="danger">
        <span />
      </ConfirmModal>
    );
    const confirmBtn = screen.getByRole('button', { name: 'Confirmer' });
    expect(confirmBtn.className).toContain('btn-danger');
  });

  it('applies btn-primary class for default variant', () => {
    render(
      <ConfirmModal title="T" onClose={vi.fn()} onConfirm={vi.fn()}>
        <span />
      </ConfirmModal>
    );
    const confirmBtn = screen.getByRole('button', { name: 'Confirmer' });
    expect(confirmBtn.className).toContain('btn-primary');
  });
});

describe('Confirmations Atelier destructives et finales', () => {
  it.each(destructiveConfirmationCases)(
    '$name décrit l’incident, la conséquence et le caractère définitif avec deux choix explicites',
    ({ dialogName, primaryLabel, consequence, renderModal }) => {
      render(<MutationFeedbackProvider>{renderModal(vi.fn())}</MutationFeedbackProvider>);

      const dialog = screen.getByRole('dialog', { name: dialogName });
      expect(dialog).toHaveTextContent('L42 · M-7');
      expect(within(dialog).getByRole('button', { name: primaryLabel })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
      expect(dialog).toHaveTextContent(consequence);
      expect(dialog).toHaveTextContent(/définiti(?:f|ve)/i);
    }
  );

  it.each(destructiveConfirmationCases)(
    '$name place le focus sur une commande sûre puis le rend au déclencheur après abandon',
    async ({ dialogName, triggerLabel, primaryLabel, renderModal }) => {
      render(
        <DestructiveConfirmationHarness triggerLabel={triggerLabel} renderModal={renderModal} />
      );

      const trigger = screen.getByRole('button', { name: triggerLabel });
      trigger.focus();
      fireEvent.click(trigger);

      const dialog = screen.getByRole('dialog', { name: dialogName });
      const primary = within(dialog).getByRole('button', { name: primaryLabel });
      await waitFor(() => {
        expect(dialog.contains(document.activeElement)).toBe(true);
      });
      expect(primary).not.toHaveFocus();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));

      await waitFor(() => expect(screen.queryByRole('dialog', { name: dialogName })).toBeNull());
      expect(trigger).toHaveFocus();
    }
  );
});
