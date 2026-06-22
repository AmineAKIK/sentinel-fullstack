import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createBoardSession, getBoardAccess } from '../api/board';
import { ApiResponseError } from '../api/client';
import WorkshopBoardPage from './WorkshopBoardPage';
import { usePageTitle } from '../hooks/usePageTitle';
import { FIELD_LIMITS } from '../utils/fieldLimits';

type AccessState = 'checking' | 'locked' | 'ready';

export default function BoardAccessPage() {
  usePageTitle("Tableau d'atelier");
  const [state, setState] = useState<AccessState>('checking');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getBoardAccess()
      .then(() => setState('ready'))
      .catch(() => setState('locked'));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!code.trim()) {
      setError('Saisissez le code du tableau.');
      return;
    }

    setLoading(true);
    try {
      await createBoardSession(code.trim());
      setCode('');
      setState('ready');
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : 'Accès au tableau impossible.');
    } finally {
      setLoading(false);
    }
  }

  if (state === 'checking') {
    return (
      <main className="board-access-page" id="main-content">
        <section className="board-access-card" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Vérification de l’accès au tableau...</p>
        </section>
      </main>
    );
  }

  if (state === 'ready') return <WorkshopBoardPage />;

  return (
    <main className="board-access-page" id="main-content">
      <section className="board-access-card board-access-card-locked">
        <button type="button" className="board-access-back" onClick={() => navigate('/login')}>
          Retour
        </button>
        <div className="board-access-title">
          <span>SENTINEL</span>
          <h1>Tableau d’atelier</h1>
          <p>Saisissez le code pour ouvrir le tableau.</p>
        </div>

        <form className="board-access-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="board-code">Code du tableau</label>
            <input
              id="board-code"
              className="form-input"
              type="password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              autoFocus
              disabled={loading}
              maxLength={FIELD_LIMITS.CODE}
              placeholder="Code du tableau"
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'board-access-error' : undefined}
            />
          </div>

          {error && <div id="board-access-error" className="error-message" role="alert">{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <><span className="spinner" aria-hidden="true" /> Ouverture…</> : 'Ouvrir le tableau'}
          </button>
        </form>
      </section>
    </main>
  );
}
