import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { workshopLogin } from '../api/workshopAuth';
import { ApiResponseError } from '../api/client';
import { useWorkshopAuth } from '../routes/WorkshopAuthContext';

export default function WorkshopLoginPage() {
  const [badgeNumber, setBadgeNumber] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requiresPasswordSetup, setRequiresPasswordSetup] = useState(false);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { user: sessionUser, setUser } = useWorkshopAuth();
  const navigate = useNavigate();

  if (sessionUser) {
    return <Navigate to="/workshop/dashboard" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!badgeNumber.trim()) {
      setError('Veuillez renseigner votre numéro de badge.');
      return;
    }
    if (requiresPassword && !password) {
      setError('Veuillez renseigner votre mot de passe.');
      return;
    }
    if (requiresPasswordSetup) {
      if (newPassword.length < 6) {
        setError('Le mot de passe doit contenir au moins 6 caractères.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('Les mots de passe ne correspondent pas.');
        return;
      }
    }

    setLoading(true);
    try {
      const response = await workshopLogin(
        badgeNumber.trim(),
        requiresPassword ? password : undefined,
        requiresPasswordSetup ? newPassword : undefined
      );

      if ('requiresPasswordSetup' in response) {
        setRequiresPasswordSetup(true);
        setRequiresPassword(false);
        setPassword('');
        return;
      }
      if ('requiresPassword' in response) {
        setRequiresPassword(true);
        setRequiresPasswordSetup(false);
        setPassword('');
        return;
      }

      setUser(response);
      navigate('/workshop/dashboard', { replace: true });
      setRequiresPasswordSetup(false);
      setRequiresPassword(false);
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : 'Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page workshop-login-page">
      <div className="login-card">
        <div className="login-title">
          <h1>Workshop Sentinel</h1>
          <p>
            {requiresPasswordSetup
              ? 'Choix du mot de passe'
              : requiresPassword ? 'Saisie du mot de passe' : 'Connexion par numéro de badge'}
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="workshopBadge">Numéro de badge</label>
              <input
                id="workshopBadge"
                className="form-input"
                type="text"
                value={badgeNumber}
                onChange={(e) => setBadgeNumber(e.target.value)}
                disabled={loading}
                autoFocus
                placeholder="B-0001"
                maxLength={40}
              />
            </div>
            {requiresPasswordSetup ? (
              <>
                <div className="notice">
                  Première connexion détectée. Choisissez votre mot de passe.
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="newWorkshopPassword">Nouveau mot de passe</label>
                  <input
                    id="newWorkshopPassword"
                    className="form-input"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="new-password"
                    placeholder="••••••••"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="confirmWorkshopPassword">Confirmer le mot de passe</label>
                  <input
                    id="confirmWorkshopPassword"
                    className="form-input"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="new-password"
                    placeholder="••••••••"
                  />
                </div>
              </>
            ) : requiresPassword ? (
              <div className="form-group">
                <label className="form-label" htmlFor="workshopPassword">Mot de passe</label>
                <input
                  id="workshopPassword"
                  className="form-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>
            ) : null}
            {(requiresPassword || requiresPasswordSetup) && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setRequiresPassword(false);
                  setRequiresPasswordSetup(false);
                  setPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setError('');
                }}
                disabled={loading}
              >
                Changer de badge
              </button>
            )}
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading
                ? <><span className="spinner" /> Connexion…</>
                : requiresPasswordSetup ? 'Créer le mot de passe' : requiresPassword ? 'Se connecter' : 'Continuer'}
            </button>
        </form>
      </div>
    </div>
  );
}
