import { fireEvent, render as testingLibraryRender, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiResponseError } from '../../api/client';
import SupportChat from '../SupportChat';
import { MutationFeedbackProvider } from '../ui/MutationFeedback';

function render(ui: React.ReactNode) {
  return testingLibraryRender(<MutationFeedbackProvider>{ui}</MutationFeedbackProvider>);
}

describe('SupportChat', () => {
  it('sends the trimmed message and renders the assistant response', async () => {
    const onSend = vi.fn().mockResolvedValue('Réponse **utile**');
    render(<SupportChat onSend={onSend} />);

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: '  Comment traiter cet incident ?  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith(
      'Comment traiter cet incident ?',
      [],
      expect.any(AbortSignal)
    );
    expect(await screen.findByText('Réponse')).toBeInTheDocument();
    expect(screen.getByText('utile', { selector: 'strong' })).toBeInTheDocument();
  });

  it('prevents a duplicate submission while a response is pending', () => {
    const onSend = vi.fn(() => new Promise<string>(() => {}));
    render(<SupportChat onSend={onSend} />);

    const input = screen.getByLabelText('Message');
    fireEvent.change(input, { target: { value: 'Question' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(input).toBeDisabled();
  });

  it('displays the API business error', async () => {
    // Code RÉEL renvoyé par le backend d'assistance (503) ; le message serveur
    // brut ne doit jamais s'afficher — c'est la traduction du code qui apparaît.
    const onSend = vi
      .fn()
      .mockRejectedValue(
        new ApiResponseError('SERVICE_UNAVAILABLE', 'raw server text — do not show', 503)
      );
    render(<SupportChat onSend={onSend} />);

    const input = screen.getByLabelText<HTMLInputElement>('Message');
    fireEvent.change(input, { target: { value: '  Question byte-for-byte  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le service est momentanément indisponible. Réessayez plus tard.'
    );
    expect(document.body.textContent).not.toContain('raw server text');
    expect(input).toHaveValue('  Question byte-for-byte  ');
    expect(input).not.toBeDisabled();
    await waitFor(() => expect(input).toHaveFocus());
  });

  it('aborts the pending request when unmounted', () => {
    let requestSignal: AbortSignal | undefined;
    const onSend = vi.fn((_message, _history, signal: AbortSignal) => {
      requestSignal = signal;
      return new Promise<string>(() => {});
    });
    const { unmount } = render(<SupportChat onSend={onSend} />);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));
    unmount();

    expect(requestSignal?.aborted).toBe(true);
  });
});

describe('SupportChat — scroll confiné au transcript (RC5-9)', () => {
  it('affiche le titre avec une espace insécable avant le "?"', () => {
    render(<SupportChat onSend={vi.fn()} />);

    const title = screen.getByText(/Comment puis-je vous aider/);
    expect(title.textContent).toContain(' ?');
    expect(title.textContent).not.toMatch(/aider \?/);
  });

  it('ne fait défiler ni window ni document au montage (conversation vide)', () => {
    const windowScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<SupportChat onSend={vi.fn()} />);

    expect(windowScrollTo).not.toHaveBeenCalled();
    windowScrollTo.mockRestore();
  });

  it('fait défiler uniquement le conteneur des messages après un nouvel échange, jamais window', async () => {
    const onSend = vi.fn().mockResolvedValue('Réponse.');
    const windowScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<SupportChat onSend={onSend} />);

    // JSDOM ne définit pas Element.prototype.scrollTo : le composant l'appelle
    // en optional chaining (el.scrollTo?.(...)), on la fournit ici pour espionner
    // l'appel réel sans changer ce contrat défensif.
    const log = screen.getByRole('log');
    const elementScrollTo = vi.fn();
    (log as unknown as { scrollTo: typeof elementScrollTo }).scrollTo = elementScrollTo;

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));

    await waitFor(() => expect(elementScrollTo).toHaveBeenCalled());
    expect(windowScrollTo).not.toHaveBeenCalled();

    windowScrollTo.mockRestore();
  });
});
