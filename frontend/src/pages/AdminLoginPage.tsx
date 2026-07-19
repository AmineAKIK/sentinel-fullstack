import { useState, FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { unifiedLogin } from '../api/unifiedAuth';
import { useAppAuth } from '../routes/AppAuthContext';
import { ApiResponseError } from '../api/client';
import { usePageTitle } from '../hooks/usePageTitle';
import { FIELD_LIMITS } from '../utils/fieldLimits';
import { isDigitsOnly } from '../utils/identifiers';

export default function AdminLoginPage() {
  usePageTitle('Connexion administration');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { setSession } = useAppAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reason = (location.state as { reason?: string } | null)?.reason;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!identifier.trim()) {
      setError('Renseignez votre identifiant.');
      return;
    }
    if (isDigitsOnly(identifier.trim())) {
      setError('Identifiant ou mot de passe incorrect.');
      return;
    }

    if (!showPassword) {
      setLoading(true);
      try {
        const response = await unifiedLogin(identifier.trim());
        if ('requiresPassword' in response) {
          setShowPassword(true);
          setPassword('');
        } else {
          setError('Identifiant ou mot de passe incorrect.');
        }
      } catch {
        setError('Identifiant ou mot de passe incorrect.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) {
      setError('Renseignez votre mot de passe.');
      return;
    }

    setLoading(true);
    try {
      const response = await unifiedLogin(identifier.trim(), password);

      if ('requiresPassword' in response || 'requiresPasswordSetup' in response) {
        setError('Identifiant ou mot de passe incorrect.');
        return;
      }
      if (!('accountType' in response)) return;
      if (response.accountType !== 'admin') {
        setError('Identifiant ou mot de passe incorrect.');
        return;
      }

      setSession({ accountType: 'admin', admin: { id: response.id, username: response.username } });
      navigate('/admin/accueil', { replace: true, state: null });
    } catch (err) {
      setError(
        err instanceof ApiResponseError ? err.message : 'Identifiant ou mot de passe incorrect.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="board-access-page" id="main-content">
      <section className="board-access-card board-access-card-locked">
        <Link to="/login" className="board-access-back">
          Retour
        </Link>

        <div className="board-access-title">
          <span>PILOTAGE SYSTÈME</span>
          <h1>Administration</h1>
          <p>Accès réservé aux administrateurs Sentinel.</p>
        </div>

        <form className="board-access-form" onSubmit={handleSubmit} noValidate>
          {reason && <div className="notice">{reason}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="identifier">
              Identifiant
            </label>
            <input
              id="identifier"
              className="form-input"
              type="text"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setShowPassword(false);
                setError('');
              }}
              disabled={loading}
              autoComplete="username"
              autoFocus
              maxLength={FIELD_LIMITS.IDENTIFIER}
              placeholder="Nom d'utilisateur"
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'admin-login-error' : undefined}
            />
          </div>

          {showPassword && (
            <div className="form-group">
              <label className="form-label" htmlFor="password">
                Mot de passe
              </label>
              <input
                id="password"
                className="form-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
                maxLength={FIELD_LIMITS.PASSWORD}
                autoFocus
                placeholder="••••••••"
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? 'admin-login-error' : undefined}
              />
            </div>
          )}

          {error && (
            <div id="admin-login-error" className="error-message" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" /> Vérification...
              </>
            ) : showPassword ? (
              'Se connecter'
            ) : (
              'Continuer'
            )}
          </button>
        </form>
      </section>
    </main>
  );
}
