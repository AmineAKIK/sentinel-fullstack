import * as fs from 'fs';
import * as path from 'path';
import logger from '../../logger';
import { z } from 'zod';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 1_000_000;

class SupportResponseTooLargeError extends Error {
  constructor() {
    super('DeepSeek response too large');
  }
}

class SupportAbortError extends Error {
  constructor() {
    super('DeepSeek request aborted');
    this.name = 'AbortError';
  }
}

const deepSeekResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().min(1).max(12_000) }),
      })
    )
    .min(1),
});

function supportTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.SUPPORT_API_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 30_000
    ? parsed
    : DEFAULT_TIMEOUT_MS;
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return;
  await body.cancel().catch(() => undefined);
}

async function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal
): Promise<{ done: boolean; value?: Uint8Array }> {
  if (signal.aborted) throw new SupportAbortError();

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(new SupportAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });

    void reader.read().then(
      (result) => {
        signal.removeEventListener('abort', onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error instanceof Error ? error : new Error('DeepSeek response stream failed'));
      }
    );
  });
}

async function readBoundedBody(
  response: Response,
  abortController: AbortController
): Promise<string> {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await readWithAbort(reader, abortController.signal);
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        abortController.abort();
        await reader.cancel().catch(() => undefined);
        throw new SupportResponseTooLargeError();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof SupportResponseTooLargeError) throw error;

    await reader.cancel().catch(() => undefined);
    if (abortController.signal.aborted) throw new SupportAbortError();

    abortController.abort();
    throw Object.assign(new Error('DeepSeek response stream failed'), { cause: error });
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes).toString('utf8');
}

// Loaded once at startup — never re-read from DB or any live source
let cachedDoc: string | null = null;

function loadFunctionalDoc(): string {
  if (cachedDoc !== null) return cachedDoc;

  // __dirname is dist/modules/support at runtime; backend root is three levels up.
  // Candidates cover both the compiled layout (prod/Docker) and ts-node (dev).
  const candidates = [
    path.resolve(__dirname, '../../..', 'docs', 'support-knowledge.md'),
    path.resolve(__dirname, '../../../..', 'docs', 'support-knowledge.md'),
  ];

  for (const docPath of candidates) {
    try {
      cachedDoc = fs.readFileSync(docPath, 'utf-8');
      return cachedDoc;
    } catch {
      // try next candidate
    }
  }

  cachedDoc = '(Documentation non disponible.)';
  logger.warn({ candidates }, 'Support knowledge file not found');
  return cachedDoc;
}

const SYSTEM_PROMPT = `Tu es l'assistant support de Sentinel, une application de pilotage de production industrielle.

RÈGLES ABSOLUES — tu ne peux jamais les enfreindre :
1. Tu réponds UNIQUEMENT à partir de la documentation fournie ci-dessous.
2. Tu n'as accès à aucune donnée du système : ni incidents, ni utilisateurs, ni lignes, ni historique, ni aucune information en temps réel. Ne prétends jamais le contraire.
3. Si une question porte sur des données réelles ("quels incidents sont ouverts", "combien d'utilisateurs", etc.), réponds clairement que tu n'as pas accès aux données et oriente vers l'interface Sentinel.
4. Tu réponds en français, de façon concise et directe.
5. Si la question sort du périmètre de la documentation, dis-le franchement plutôt que d'inventer.

---

DOCUMENTATION SENTINEL :

${loadFunctionalDoc()}`;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
}

export async function askSupport(
  history: ChatMessage[],
  userMessage: string
): Promise<ChatResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return {
      reply:
        "Le service d'assistance n'est pas configuré pour le moment. Contactez votre administrateur.",
    };
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-10), // cap conversation history to last 10 exchanges
    { role: 'user', content: userMessage },
  ];

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), supportTimeoutMs());
  timeout.unref();
  try {
    let response: Response;
    try {
      response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages,
          max_tokens: 768,
          temperature: 0.3,
        }),
        signal: abortController.signal,
      });
    } catch (error) {
      if (abortController.signal.aborted) throw new SupportAbortError();
      logger.error(
        { errorName: error instanceof Error ? error.name : 'UnknownError' },
        'DeepSeek API request failed'
      );
      throw Object.assign(new Error('DeepSeek API request failed'), { cause: error });
    }

    if (!response.ok) {
      abortController.abort();
      await cancelBody(response.body);
      logger.error({ status: response.status }, 'DeepSeek API error');
      throw new Error('DeepSeek API error');
    }

    const responseLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(responseLength) && responseLength > MAX_RESPONSE_BYTES) {
      abortController.abort();
      await cancelBody(response.body);
      throw new SupportResponseTooLargeError();
    }

    const rawBody = await readBoundedBody(response, abortController);

    let decoded: unknown;
    try {
      decoded = JSON.parse(rawBody);
    } catch {
      throw new Error('DeepSeek response is not valid JSON');
    }
    const parsed = deepSeekResponseSchema.safeParse(decoded);
    if (!parsed.success) throw new Error('DeepSeek response schema is invalid');

    const reply = parsed.data.choices[0].message.content.trim();
    if (!reply) throw new Error('DeepSeek response is empty');
    return { reply };
  } finally {
    clearTimeout(timeout);
  }
}
