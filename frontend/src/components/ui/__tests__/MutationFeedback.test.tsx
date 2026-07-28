import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  errorMessage,
  label = 'Agir',
}: {
  run: () => Promise<unknown>;
  successMessage?: string;
  errorMessage?: string;
  label?: string;
}) {
  const { pending, execute } = useMutationRunner();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        void execute(run, {
          successMessage,
          toErrorMessage: errorMessage ? () => errorMessage : undefined,
        })
      }
    >
      {pending ? 'En cours…' : label}
    </button>
  );
}

function SuccessEmitter({ message }: { message: string }) {
  const { notifySuccess } = useMutationFeedback();
  return (
    <button type="button" onClick={() => notifySuccess(message)}>
      Lancer l’action
    </button>
  );
}

function LateResolutionProbe({
  run,
  onSuccess,
  restoreFocusTo,
}: {
  run: () => Promise<unknown>;
  onSuccess: (result: unknown) => void;
  restoreFocusTo: HTMLElement;
}) {
  const { pending, execute } = useMutationRunner();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        void execute(run, {
          successMessage: 'Action tardive terminée.',
          onSuccess,
          restoreFocusTo,
        })
      }
    >
      {pending ? 'Action en cours…' : 'Lancer l’action tardive'}
    </button>
  );
}

function FeedbackLog() {
  const { message, kind } = useMutationFeedback();
  return <div data-testid="feedback-kind">{message ? `${kind}:${message}` : 'none'}</div>;
}

describe('MutationFeedback (notification globale Sentinel RC5)', () => {
  it('annonce le succès sans voler le focus, avec un titre et une fermeture explicites', async () => {
    render(
      <MutationFeedbackProvider>
        <FeedbackLog />
        <ProbeButton run={() => Promise.resolve('ok')} successMessage="Incident signalé." />
      </MutationFeedbackProvider>
    );

    const trigger = screen.getByRole('button', { name: 'Agir' });
    trigger.focus();
    fireEvent.click(trigger);

    await waitFor(() =>
      expect(screen.getByTestId('feedback-kind')).toHaveTextContent('success:Incident signalé.')
    );
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Action réussie');
    expect(region).toHaveTextContent('Incident signalé.');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: 'Fermer la notification' })).toBeInTheDocument();
    expect(trigger).toHaveFocus();
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
      expect(screen.getByRole('alert')).toHaveTextContent('Action impossible');
      expect(screen.getByRole('button', { name: 'Fermer la notification' })).toBeInTheDocument();
      // Une erreur ne disparaît jamais automatiquement.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      expect(screen.getByTestId('feedback-kind').textContent).toMatch(/^error:/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('suspend puis reprend le délai au survol sans repartir de zéro', async () => {
    vi.useFakeTimers();
    try {
      render(
        <MutationFeedbackProvider>
          <FeedbackLog />
          <SuccessEmitter message="Incident signalé." />
        </MutationFeedbackProvider>
      );

      fireEvent.click(screen.getByRole('button', { name: 'Lancer l’action' }));
      const notification = screen.getByText('Incident signalé.').closest('[data-feedback]');
      expect(notification).not.toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      fireEvent.mouseEnter(notification!);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(screen.getByText('Incident signalé.')).toBeInTheDocument();

      fireEvent.mouseLeave(notification!);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3999);
      });
      expect(screen.getByText('Incident signalé.')).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2);
      });
      expect(screen.queryByText('Incident signalé.')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('suspend puis reprend le délai tant que la notification contient le focus', async () => {
    vi.useFakeTimers();
    try {
      render(
        <MutationFeedbackProvider>
          <SuccessEmitter message="Consigne enregistrée." />
        </MutationFeedbackProvider>
      );

      const trigger = screen.getByRole('button', { name: 'Lancer l’action' });
      fireEvent.click(trigger);
      const dismiss = screen.getByRole('button', { name: 'Fermer la notification' });
      dismiss.focus();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(screen.getByText('Consigne enregistrée.')).toBeInTheDocument();

      trigger.focus();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6001);
      });
      expect(screen.queryByText('Consigne enregistrée.')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ferme une erreur persistante au clavier et restaure le focus utile', async () => {
    const user = userEvent.setup();
    render(
      <MutationFeedbackProvider>
        <ProbeButton
          run={() => Promise.reject(new TypeError('Failed to fetch private.internal'))}
          errorMessage="Connexion au service impossible. Réessayez."
        />
      </MutationFeedbackProvider>
    );

    const trigger = screen.getByRole('button', { name: 'Agir' });
    trigger.focus();
    await user.click(trigger);
    const dismiss = await screen.findByRole('button', { name: 'Fermer la notification' });
    dismiss.focus();
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('ne rend jamais le détail technique d’une erreur réseau', async () => {
    render(
      <MutationFeedbackProvider>
        <ProbeButton
          run={() => Promise.reject(new TypeError('Failed to fetch private.internal'))}
        />
      </MutationFeedbackProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Agir' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Une erreur est survenue. Veuillez réessayer.'
      )
    );
    expect(document.body).not.toHaveTextContent('Failed to fetch');
    expect(document.body).not.toHaveTextContent('private.internal');
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

  it("n'efface jamais l'erreur persistante de l'action B avec le timer du succès A", async () => {
    vi.useFakeTimers();
    try {
      render(
        <MutationFeedbackProvider>
          <FeedbackLog />
          <ProbeButton
            label="Action A"
            run={() => Promise.resolve('ok-a')}
            successMessage="Action A terminée."
          />
          <ProbeButton
            label="Action B"
            run={() => Promise.reject(new Error('échec-b'))}
            errorMessage="Action B impossible. Réessayez."
          />
        </MutationFeedbackProvider>
      );

      fireEvent.click(screen.getByRole('button', { name: 'Action A' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByTestId('feedback-kind')).toHaveTextContent('success:Action A terminée.');

      fireEvent.click(screen.getByRole('button', { name: 'Action B' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole('alert')).toHaveTextContent('Action B impossible. Réessayez.');

      // Le timer créé par A arrive à échéance après l'échec de B : il ne doit
      // jamais effacer ni remplacer cette erreur persistante.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6100);
      });
      expect(screen.getByRole('alert')).toHaveTextContent('Action B impossible. Réessayez.');
      expect(screen.getByTestId('feedback-kind')).toHaveTextContent(
        'error:Action B impossible. Réessayez.'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignore la résolution tardive après démontage sans callback ni déplacement de focus', async () => {
    let resolveRun!: (value: unknown) => void;
    const run = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveRun = resolve;
        })
    );
    const onSuccess = vi.fn();
    const staleFocusTarget = document.createElement('button');
    staleFocusTarget.textContent = 'Ancienne surface';
    const safeFocusTarget = document.createElement('button');
    safeFocusTarget.textContent = 'Surface courante';
    document.body.append(staleFocusTarget, safeFocusTarget);
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });

    try {
      const { unmount } = render(
        <MutationFeedbackProvider>
          <LateResolutionProbe run={run} onSuccess={onSuccess} restoreFocusTo={staleFocusTarget} />
        </MutationFeedbackProvider>
      );

      fireEvent.click(screen.getByRole('button', { name: 'Lancer l’action tardive' }));
      expect(run).toHaveBeenCalledTimes(1);

      unmount();
      safeFocusTarget.focus();
      expect(safeFocusTarget).toHaveFocus();

      await act(async () => {
        resolveRun('résultat tardif');
        await Promise.resolve();
      });

      expect(onSuccess).not.toHaveBeenCalled();
      expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
      expect(safeFocusTarget).toHaveFocus();
    } finally {
      requestAnimationFrameSpy.mockRestore();
      staleFocusTarget.remove();
      safeFocusTarget.remove();
    }
  });

  it('conserve le succès focalisé puis reprend le délai et garde le focus utile', async () => {
    vi.useFakeTimers();
    try {
      render(
        <MutationFeedbackProvider>
          <SuccessEmitter message="Consigne enregistrée." />
        </MutationFeedbackProvider>
      );

      const trigger = screen.getByRole('button', { name: 'Lancer l’action' });
      trigger.focus();
      fireEvent.click(trigger);
      expect(screen.getByRole('status')).toHaveTextContent('Consigne enregistrée.');

      const dismiss = screen.getByRole('button', { name: 'Fermer la notification' });
      dismiss.focus();
      expect(dismiss).toHaveFocus();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6100);
      });
      expect(screen.getByRole('button', { name: 'Fermer la notification' })).toBeInTheDocument();

      trigger.focus();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6100);
      });
      expect(
        screen.queryByRole('button', { name: 'Fermer la notification' })
      ).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it('annule le timer de succès au démontage du provider', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(
        <MutationFeedbackProvider>
          <SuccessEmitter message="Suivi activé." />
        </MutationFeedbackProvider>
      );

      fireEvent.click(screen.getByRole('button', { name: 'Lancer l’action' }));
      expect(screen.getByRole('status')).toHaveTextContent('Suivi activé.');
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      unmount();

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
