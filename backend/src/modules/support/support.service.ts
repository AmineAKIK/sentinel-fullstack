import * as fs from 'fs';
import * as path from 'path';
import logger from '../../logger';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

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

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    await response.text();
    logger.error({ status: response.status }, 'DeepSeek API error');
    throw new Error('DeepSeek API error');
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  const reply = data.choices?.[0]?.message?.content?.trim() ?? '';
  return { reply };
}
