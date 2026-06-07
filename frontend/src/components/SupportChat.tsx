import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../api/support';

interface Props {
  onSend: (message: string, history: ChatMessage[]) => Promise<string>;
}

function renderContent(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      nodes.push(<h3 key={i} className="support-msg-h3">{line.slice(4)}</h3>);
    } else if (line.startsWith('## ')) {
      nodes.push(<h2 key={i} className="support-msg-h2">{line.slice(3)}</h2>);
    } else if (line.startsWith('# ')) {
      nodes.push(<h2 key={i} className="support-msg-h2">{line.slice(2)}</h2>);
    } else if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="support-msg-list">
          {items.map((item, j) => (
            <li key={j}>{inlineFormat(item)}</li>
          ))}
        </ul>
      );
      continue;
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`} className="support-msg-list support-msg-list--ordered">
          {items.map((item, j) => (
            <li key={j}>{inlineFormat(item)}</li>
          ))}
        </ol>
      );
      continue;
    } else if (line.startsWith('> ')) {
      nodes.push(
        <blockquote key={i} className="support-msg-blockquote">
          {inlineFormat(line.slice(2))}
        </blockquote>
      );
    } else if (line.trim() === '' || line.trim() === '---') {
      // skip empty lines and hr
    } else {
      nodes.push(<p key={i} className="support-msg-p">{inlineFormat(line)}</p>);
    }
    i++;
  }

  return nodes;
}

function inlineFormat(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="support-msg-code">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}


export default function SupportChat({ onSend }: Props) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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

    const userMsg: ChatMessage = { role: 'user', content: message };
    const nextHistory = [...history, userMsg];

    setHistory(nextHistory);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const reply = await onSend(message, history);
      setHistory([...nextHistory, { role: 'assistant', content: reply }]);
    } catch {
      setError('Une erreur est survenue. Vérifiez votre connexion et réessayez.');
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <div className="support-layout">
      <div className="support-chat-header">
        <div className="support-agent">
          <div className="support-agent-mark" aria-hidden="true">SENTINEL</div>
          <div>
            <p className="support-agent-title">Assistant Sentinel</p>
            <p className="support-agent-subtitle">Réponses contextualisées sur l'application</p>
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
              <div className="support-bubble support-bubble--user">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={i} className="support-row support-row--assistant">
              <div className="support-avatar" aria-hidden="true">S</div>
              <div className="support-bubble support-bubble--assistant">
                {renderContent(msg.content)}
              </div>
            </div>
          )
        )}

        {loading && (
          <div className="support-row support-row--assistant">
            <div className="support-avatar" aria-hidden="true">S</div>
            <div className="support-bubble support-bubble--assistant support-bubble--loading">
              <span className="support-typing" aria-label="En train d'écrire">
                <span /><span /><span />
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="support-error" role="alert">{error}</div>
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
