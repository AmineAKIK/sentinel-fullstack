jest.mock('../../../logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { askSupport } from '../support.service';

const originalFetch = global.fetch;
const originalApiKey = process.env.DEEPSEEK_API_KEY;
const originalTimeout = process.env.SUPPORT_API_TIMEOUT_MS;

describe('support service', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    process.env.DEEPSEEK_API_KEY = originalApiKey;
    process.env.SUPPORT_API_TIMEOUT_MS = originalTimeout;
    jest.useRealTimers();
  });

  it('se dégrade proprement lorsque le fournisseur n’est pas configuré', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    global.fetch = jest.fn();

    const result = await askSupport([], 'Comment créer un incident ?');

    expect(result.reply).toContain("n'est pas configuré");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('borne l’historique envoyé et valide la réponse du fournisseur', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: '  Réponse vérifiée.  ' } }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    const history = Array.from({ length: 14 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `message-${index}`,
    }));

    await expect(askSupport(history, 'Question finale')).resolves.toEqual({
      reply: 'Réponse vérifiée.',
    });

    const request = jest.mocked(global.fetch).mock.calls[0][1];
    const body = JSON.parse(String(request?.body)) as { messages: Array<{ content: string }> };
    expect(body.messages).toHaveLength(12);
    expect(body.messages[1].content).toBe('message-4');
    expect(body.messages.at(-1)?.content).toBe('Question finale');
  });

  it('refuse une réponse 200 dont le contrat JSON est invalide', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    await expect(askSupport([], 'Question')).rejects.toThrow('schema is invalid');
  });

  it('interrompt un fournisseur qui dépasse le délai configuré', async () => {
    jest.useFakeTimers();
    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.SUPPORT_API_TIMEOUT_MS = '1000';
    global.fetch = jest.fn((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        );
      });
    });

    const assertion = expect(askSupport([], 'Question')).rejects.toMatchObject({
      name: 'AbortError',
    });
    await jest.advanceTimersByTimeAsync(1000);

    await assertion;
  });
});
