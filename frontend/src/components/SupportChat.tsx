import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../api/errorMessages';
import type { ChatMessage } from '../api/support';
import { renderMarkdown } from '../utils/markdownParser';
import { useMutationRunner } from './ui/MutationFeedback';

interface Props {
  onSend: (message: string, history: ChatMessage[], signal: AbortSignal) => Promise<string>;
}

export default function SupportChat({ onSend }: Props) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const mutation = useMutationRunner();
  const loading = mutation.isPending('support:send');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [history, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = el.scrollHeight;
    const max = 156;
    el.style.height = `${Math.min(next, max)}px`;
    el.style.overflowY = next > max ? 'auto' : 'hidden';
  }, [input]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    const controller = new AbortController();
    requestRef.current = controller;

    await mutation.execute(() => onSend(message, history, controller.signal), {
      key: 'support:send',
      successMessage: 'Message envoyé.',
      toErrorMessage: (requestError) =>
        apiErrorMessage(
          requestError,
          'Une erreur est survenue. Vérifiez votre connexion et réessayez.'
        ),
      onSuccess: (reply) => {
        if (controller.signal.aborted) return;
        const userMsg: ChatMessage = { role: 'user', content: message };
        setHistory([...history, userMsg, { role: 'assistant', content: reply }]);
        setInput('');
      },
      onError: () => {
        requestAnimationFrame(() => textareaRef.current?.focus());
      },
    });
    if (requestRef.current === controller) requestRef.current = null;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <div className="support-layout" aria-busy={loading}>
      <div className="support-chat-header">
        <div className="support-agent">
          <div className="support-agent-mark" aria-hidden="true">
            SENTINEL
          </div>
          <div>
            <p className="support-agent-title">Assistant Sentinel</p>
            <p className="support-agent-subtitle">Aide sur l'utilisation de l'application</p>
          </div>
        </div>
        <span className="support-status">Disponible</span>
      </div>

      <div className="support-messages" role="log" aria-live="polite">
        {history.length === 0 && !loading && (
          <div className="support-empty">
            <div className="support-empty-copy">
              <span className="support-empty-kicker">Support Sentinel</span>
              <p className="support-empty-title">Comment puis-je vous aider ?</p>
              <p className="support-empty-sub">
                Posez une question précise sur les incidents, les rôles ou les workflows atelier.
              </p>
            </div>
          </div>
        )}

        {history.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={i} className="support-row support-row--user">
              <div className="support-bubble support-bubble--user">{msg.content}</div>
            </div>
          ) : (
            <div key={i} className="support-row support-row--assistant">
              <div className="support-avatar" aria-hidden="true">
                S
              </div>
              <div className="support-bubble support-bubble--assistant">
                {renderMarkdown(msg.content)}
              </div>
            </div>
          )
        )}

        {loading && (
          <div className="support-row support-row--assistant">
            <div className="support-avatar" aria-hidden="true">
              S
            </div>
            <div className="support-bubble support-bubble--assistant support-bubble--loading">
              <span className="support-typing" aria-label="En train d'écrire">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="support-composer">
        <form className="support-form" onSubmit={(e) => void handleSubmit(e)}>
          <textarea
            ref={textareaRef}
            className="support-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Écrivez votre question..."
            rows={1}
            maxLength={2000}
            disabled={loading}
            aria-label="Message"
          />
          <button
            type="submit"
            className="support-send"
            disabled={loading || !input.trim()}
            aria-label="Envoyer le message"
          >
            Envoyer
          </button>
        </form>
      </div>
    </div>
  );
}
