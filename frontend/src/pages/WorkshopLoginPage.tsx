import { useState, FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { unifiedLogin, requestPasswordReset } from '../api/unifiedAuth';
import { useAppAuth } from '../routes/AppAuthContext';
import { ApiResponseError } from '../api/client';
import { usePageTitle } from '../hooks/usePageTitle';
import { FIELD_LIMITS } from '../utils/fieldLimits';
import ConfirmModal from '../components/ConfirmModal';

type Mode = 'identifier' | 'password' | 'setup';

export default function WorkshopLoginPage() {
  usePageTitle('Connexion atelier');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<Mode>('identifier');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const { setSession } = useAppAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reason = (location.state as { reason?: string } | null)?.reason;

  async function handleForgotPassword() {
    setResetSent(false);
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(identifier.trim());
    } finally {
      setLoading(false);
      setConfirmingReset(false);
      setResetSent(true);
    }
  }

  function resetToIdentifier() {
    setMode('identifier');
    setPassword('');
    setSetupCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setWarning('');
    setConfirmingReset(false);
    setResetSent(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setWarning('');

    if (!identifier.trim()) {
      setError('Renseignez votre identifiant.');
      return;
    }

    if (mode === 'identifier') {
      setLoading(true);
      try {
        const response = await unifiedLogin(identifier.trim());
        if ('requiresPasswordSetup' in response) {
          setMode('setup');
        } else if ('requiresPassword' in response) {
          setMode('password');
          setPassword('');
        } else {
          setError('Identifiant ou mot de passe incorrect.');
        }
      } catch (err) {
        if (err instanceof ApiResponseError && err.status === 403) {
          setWarning(err.message);
        } else {
          setError('Identifiant ou mot de passe incorrect.');
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'password') {
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
        if (!('accountType' in response) || response.accountType !== 'workshop') {
          setError('Identifiant ou mot de passe incorrect.');
          return;
        }

        setSession({
          accountType: 'workshop',
          user: {
            id: response.id,
            first_name: response.first_name,
            last_name: response.last_name,
            badge_number: response.badge_number,
            role: response.role,
          },
        });
        navigate('/workshop/dashboard', { replace: true });
      } catch (err) {
        if (err instanceof ApiResponseError && err.status === 403) {
          setWarning(err.message);
        } else {
          setError(
            err instanceof ApiResponseError ? err.message : 'Identifiant ou mot de passe incorrect.'
          );
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'setup') {
      if (!setupCode.trim()) {
        setError('Renseignez le code temporaire.');
        return;
      }
      if (newPassword.length < 6) {
        setError('Le mot de passe doit contenir au moins 6 caractères.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('Les mots de passe ne correspondent pas.');
        return;
      }
      setLoading(true);
      try {
        const response = await unifiedLogin(identifier.trim(), undefined, newPassword, setupCode);
        if (!('accountType' in response) || response.accountType !== 'workshop') {
          setError('Code temporaire incorrect.');
          return;
        }
        setSession({
          accountType: 'workshop',
          user: {
            id: response.id,
            first_name: response.first_name,
            last_name: response.last_name,
            badge_number: response.badge_number,
            role: response.role,
          },
        });
        navigate('/workshop/dashboard', { replace: true });
      } catch (err) {
        setError(err instanceof ApiResponseError ? err.message : 'Code temporaire incorrect.');
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <main className="board-access-page" id="main-content">
      <section className="board-access-card board-access-card-locked">
        {mode !== 'identifier' ? (
          <button type="button" className="board-access-back" onClick={resetToIdentifier}>
            Retour
          </button>
        ) : (
          <Link to="/login" className="board-access-back">
            Retour
          </Link>
        )}

        <div className="board-access-title">
          <span>ACCÈS ATELIER</span>
          <h1>{mode === 'setup' ? 'Première connexion' : 'Flux atelier'}</h1>
          {mode === 'identifier' && <p>Identifiez-vous pour accéder à votre espace.</p>}
          {mode === 'setup' && <p>Activez votre compte avec le code reçu.</p>}
        </div>

        <form className="board-access-form" onSubmit={handleSubmit} noValidate>
          {reason && <div className="notice">{reason}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="identifier">
              Numéro de badge
            </label>
            <input
              id="identifier"
              className="form-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value.replace(/\D/g, ''));
                resetToIdentifier();
              }}
              disabled={loading}
              autoComplete="username"
              autoFocus={mode === 'identifier'}
              maxLength={FIELD_LIMITS.IDENTIFIER}
              placeholder="0001"
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'workshop-login-error' : undefined}
            />
          </div>

          {mode === 'password' && (
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
                maxLength={FIELD_LIMITS.PASSWORD}
                autoComplete="current-password"
                autoFocus
                placeholder="••••••••"
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? 'workshop-login-error' : undefined}
              />
              {resetSent ? (
                <div className="notice" style={{ marginTop: 8 }} role="status">
                  Demande envoyée. L'administrateur vous contactera par voie interne.
                </div>
              ) : (
                <button
                  type="button"
                  className="inline-link-button"
                  style={{ marginTop: 6, fontSize: 13 }}
                  onClick={() => setConfirmingReset(true)}
                  disabled={loading}
                >
                  Mot de passe oublié ?
                </button>
              )}
            </div>
          )}

          {mode === 'setup' && (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="setupCode">
                  Code temporaire
                </label>
                <input
                  id="setupCode"
                  className="form-input"
                  type="text"
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value)}
                  disabled={loading}
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="ABC123DEF4"
                  maxLength={20}
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? 'workshop-login-error' : undefined}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="newPassword">
                  Nouveau mot de passe
                </label>
                <input
                  id="newPassword"
                  className="form-input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                  maxLength={FIELD_LIMITS.PASSWORD}
                  placeholder="••••••••"
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? 'workshop-login-error' : undefined}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="confirmPassword">
                  Confirmer le mot de passe
                </label>
                <input
                  id="confirmPassword"
                  className="form-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                  maxLength={FIELD_LIMITS.PASSWORD}
                  placeholder="••••••••"
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? 'workshop-login-error' : undefined}
                />
              </div>
            </>
          )}

          {warning && (
            <div id="workshop-login-warning" className="notice" role="alert">
              {warning}
            </div>
          )}
          {error && (
            <div id="workshop-login-error" className="error-message" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" /> Vérification…
              </>
            ) : mode === 'setup' ? (
              'Activer mon compte'
            ) : mode === 'password' ? (
              'Se connecter'
            ) : (
              'Continuer'
            )}
          </button>
        </form>
      </section>

      {confirmingReset && (
        <ConfirmModal
          title="Demande de réinitialisation"
          onClose={() => setConfirmingReset(false)}
          onConfirm={handleForgotPassword}
          confirmLabel="Envoyer la demande"
          loadingLabel="Envoi…"
          loading={loading}
        >
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.6,
            }}
          >
            Une demande de réinitialisation sera envoyée à l'administrateur, qui vous contactera par
            voie interne pour vous communiquer un nouveau code d'accès.
          </p>
        </ConfirmModal>
      )}
    </main>
  );
}
