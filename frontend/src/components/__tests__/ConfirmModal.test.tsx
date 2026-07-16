import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConfirmModal from '../../components/ConfirmModal';
import { ApiResponseError } from '../../api/client';

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

  it('displays the API business message when submission fails', async () => {
    const onConfirm = vi.fn(() =>
      Promise.reject(new ApiResponseError('INCIDENT_CONFLICT', 'Incident déjà traité.', 409))
    );
    render(
      <ConfirmModal title="T" onClose={vi.fn()} onConfirm={onConfirm}>
        <span />
      </ConfirmModal>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Incident déjà traité.')
    );
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
