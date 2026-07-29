jest.mock('../../../logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { askSupport } from '../support.service';

const originalFetch = global.fetch;
const originalApiKey = process.env.DEEPSEEK_API_KEY;
const originalTimeout = process.env.SUPPORT_API_TIMEOUT_MS;
const encoder = new TextEncoder();

type TrackedResponse = {
  response: Response;
  cancel: jest.Mock;
  pullCount: () => number;
};

function trackedResponse(chunks: Uint8Array[]): TrackedResponse {
  let nextChunk = 0;
  let pulls = 0;
  const cancel = jest.fn();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      const chunk = chunks[nextChunk];
      nextChunk += 1;
      if (chunk) {
        controller.enqueue(chunk);
        return;
      }
      controller.close();
    },
    cancel,
  });

  return {
    response: new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
    cancel,
    pullCount: () => pulls,
  };
}

function validBody(content = 'Réponse vérifiée.'): Uint8Array {
  return encoder.encode(JSON.stringify({ choices: [{ message: { content } }] }));
}

function observe<T>(promise: Promise<T>): {
  outcome: () => 'pending' | { value: T } | { error: unknown };
} {
  let outcome: 'pending' | { value: T } | { error: unknown } = 'pending';
  void promise.then(
    (value) => {
      outcome = { value };
    },
    (error: unknown) => {
      outcome = { error };
    }
  );
  return { outcome: () => outcome };
}

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
    expect(body.messages[body.messages.length - 1]?.content).toBe('Question finale');
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

  it('interrompt le fournisseur lorsque les en-têtes dépassent le délai configuré', async () => {
    jest.useFakeTimers();
    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.SUPPORT_API_TIMEOUT_MS = '1000';
    let requestSignal: AbortSignal | undefined;
    global.fetch = jest.fn((_url, init) => {
      requestSignal = init?.signal ?? undefined;
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
    expect(requestSignal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('garde le délai actif pendant le corps, annule le flux et libère son verrou', async () => {
    jest.useFakeTimers();
    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.SUPPORT_API_TIMEOUT_MS = '1000';
    let requestSignal: AbortSignal | undefined;
    const cancel = jest.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"choices":'));
      },
      pull() {
        return new Promise<void>(() => undefined);
      },
      cancel,
    });
    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    global.fetch = jest.fn((_url, init) => {
      requestSignal = init?.signal ?? undefined;
      return Promise.resolve(response);
    });

    const request = askSupport([], 'Question');
    const observed = observe(request);
    await jest.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    expect(observed.outcome()).toMatchObject({
      error: expect.objectContaining({ name: 'AbortError' }),
    });
    expect(requestSignal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.body?.locked).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('borne un corps sans content-length et arrête sa lecture dès le dépassement', async () => {
    jest.useFakeTimers();
    process.env.DEEPSEEK_API_KEY = 'test-key';
    const chunks = Array.from({ length: 12 }, () => new Uint8Array(300_000).fill(0x61));
    const tracked = trackedResponse(chunks);
    let requestSignal: AbortSignal | undefined;
    global.fetch = jest.fn((_url, init) => {
      requestSignal = init?.signal ?? undefined;
      return Promise.resolve(tracked.response);
    });

    await expect(askSupport([], 'Question')).rejects.toThrow('response too large');

    expect(requestSignal?.aborted).toBe(true);
    expect(tracked.cancel).toHaveBeenCalledTimes(1);
    expect(tracked.pullCount()).toBeLessThan(chunks.length);
    expect(tracked.response.body?.locked).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('lit un corps normal, ferme proprement le lecteur et nettoie le timer', async () => {
    jest.useFakeTimers();
    process.env.DEEPSEEK_API_KEY = 'test-key';
    const payload = validBody();
    const midpoint = Math.floor(payload.byteLength / 2);
    const tracked = trackedResponse([payload.slice(0, midpoint), payload.slice(midpoint)]);
    global.fetch = jest.fn().mockResolvedValue(tracked.response);

    await expect(askSupport([], 'Question')).resolves.toEqual({
      reply: 'Réponse vérifiée.',
    });

    expect(tracked.cancel).not.toHaveBeenCalled();
    expect(tracked.response.body?.locked).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('annule et libère le flux sur une erreur HTTP du fournisseur', async () => {
    jest.useFakeTimers();
    process.env.DEEPSEEK_API_KEY = 'test-key';
    const cancel = jest.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encoder.encode('provider-internal-detail'));
      },
      cancel,
    });
    const response = new Response(body, { status: 502 });
    global.fetch = jest.fn().mockResolvedValue(response);

    await expect(askSupport([], 'Question')).rejects.toThrow('DeepSeek API error');

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.body?.locked).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('masque une erreur interne du flux et libère le lecteur', async () => {
    jest.useFakeTimers();
    process.env.DEEPSEEK_API_KEY = 'test-key';
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull() {
          throw new Error('provider-internal-detail');
        },
      }),
      { status: 200 }
    );
    global.fetch = jest.fn().mockResolvedValue(response);

    const error = await askSupport([], 'Question').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('DeepSeek response stream failed');
    expect((error as Error).message).not.toContain('provider-internal-detail');
    expect(response.body?.locked).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });
});
