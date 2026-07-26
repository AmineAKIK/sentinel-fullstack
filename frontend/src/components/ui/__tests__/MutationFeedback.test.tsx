import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  MutationFeedbackProvider,
  useMutationFeedback,
  useMutationRunner,
} from '../MutationFeedback';

// Bouton de test qui pilote une mutation via le runner global. Il expose le
// contrat des cinq états : idle → pending → success | failure, avec verrou
// anti-double-soumission et restauration du focus.
function ProbeButton({
  run,
  successMessage,
  label = 'Agir',
}: {
  run: () => Promise<unknown>;
  successMessage?: string;
  label?: string;
}) {
  const { pending, execute } = useMutationRunner();
  return (
    <button type="button" disabled={pending} onClick={() => void execute(run, { successMessage })}>
      {pending ? 'En cours…' : label}
    </button>
  );
}

function FeedbackLog() {
  const { message, kind } = useMutationFeedback();
  return <div data-testid="feedback-kind">{message ? `${kind}:${message}` : 'none'}</div>;
}

describe('MutationFeedback (contrat de retour d’action, lot 1 RC3)', () => {
  it('annonce le succès dans une zone polie', async () => {
    render(
      <MutationFeedbackProvider>
        <FeedbackLog />
        <ProbeButton run={() => Promise.resolve('ok')} successMessage="Incident signalé." />
      </MutationFeedbackProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Agir' }));

    await waitFor(() =>
      expect(screen.getByTestId('feedback-kind')).toHaveTextContent('success:Incident signalé.')
    );
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Incident signalé.');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('efface le succès après ~6 s (timers simulés)', async () => {
    vi.useFakeTimers();
    try {
      render(
        <MutationFeedbackProvider>
          <FeedbackLog />
          <ProbeButton run={() => Promise.resolve('ok')} successMessage="Traitement repris." />
        </MutationFeedbackProvider>
      );
      fireEvent.click(screen.getByRole('button', { name: 'Agir' }));
      // Laisse la microtâche de la promesse se vider sous timers simulés.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByTestId('feedback-kind')).toHaveTextContent('success:Traitement repris.');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6100);
      });
      expect(screen.getByTestId('feedback-kind')).toHaveTextContent('none');
    } finally {
      vi.useRealTimers();
    }
  });

  it('affiche une erreur persistante dans role="alert" et ne l’efface pas seule', async () => {
    vi.useFakeTimers();
    try {
      render(
        <MutationFeedbackProvider>
          <FeedbackLog />
          <ProbeButton run={() => Promise.reject(new Error('échec réseau'))} />
        </MutationFeedbackProvider>
      );
      fireEvent.click(screen.getByRole('button', { name: 'Agir' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByRole('alert')).toBeInTheDocument();
      // Une erreur ne disparaît jamais automatiquement.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      expect(screen.getByTestId('feedback-kind').textContent).toMatch(/^error:/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('empêche une double soumission pendant le pending', async () => {
    let calls = 0;
    let resolve!: (v: unknown) => void;
    const run = () => {
      calls += 1;
      return new Promise((r) => {
        resolve = r;
      });
    };
    render(
      <MutationFeedbackProvider>
        <ProbeButton run={run} />
      </MutationFeedbackProvider>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);
    // Pendant le pending, le bouton est désactivé et un second clic ne relance rien.
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);
    expect(calls).toBe(1);

    await act(async () => {
      resolve('ok');
      await Promise.resolve();
    });
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
