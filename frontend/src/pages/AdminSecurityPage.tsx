import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { changeAdminPassword } from '../api/adminSecurity';
import { ApiResponseError } from '../api/client';
import { useAppAuth } from '../routes/AppAuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

const MIN_LENGTH = 12;
const MAX_LENGTH = 128;

export default function AdminSecurityPage() {
  usePageTitle('Sécurité — Administration');
  const navigate = useNavigate();
  const { logout } = useAppAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (!currentPassword) return 'Renseignez votre mot de passe actuel.';
    if (newPassword.length < MIN_LENGTH)
      return `Le nouveau mot de passe doit contenir au moins ${MIN_LENGTH} caractères.`;
    if (newPassword.length > MAX_LENGTH)
      return `Le mot de passe ne peut pas dépasser ${MAX_LENGTH} caractères.`;
    if (newPassword === currentPassword)
      return 'Le nouveau mot de passe doit être différent du mot de passe actuel.';
    if (newPassword !== confirmPassword)
      return 'Les mots de passe ne correspondent pas.';
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    try {
      await changeAdminPassword(currentPassword, newPassword);
      await logout();
      navigate('/admin/login', {
        replace: true,
        state: { reason: 'Mot de passe modifié. Reconnectez-vous avec votre nouveau mot de passe.' },
      });
    } catch (err) {
      setError(err instanceof ApiResponseError ? err.message : 'Une erreur est survenue. Réessayez.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <NavBar />
      <main id="main-content" className="page-container">
        <div className="page-header">
          <h1>Sécurité</h1>
        </div>

        <div className="card" style={{ maxWidth: 480 }}>
          <div className="card-body">
            <h2>Changer le mot de passe</h2>
            <p style={{ marginBottom: 24, color: 'var(--color-text-secondary)' }}>
              Le nouveau mot de passe doit contenir au moins {MIN_LENGTH} caractères.
              Toutes vos sessions actives seront déconnectées.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="currentPassword">Mot de passe actuel</label>
                <input
                  id="currentPassword"
                  className="form-input"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setError(''); }}
                  disabled={loading}
                  autoComplete="current-password"
                  maxLength={MAX_LENGTH}
                  placeholder="••••••••••••"
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? 'security-error' : undefined}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="newPassword">Nouveau mot de passe</label>
                <input
                  id="newPassword"
                  className="form-input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                  disabled={loading}
                  autoComplete="new-password"
                  maxLength={MAX_LENGTH}
                  placeholder="••••••••••••"
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? 'security-error' : undefined}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="confirmPassword">Confirmer le nouveau mot de passe</label>
                <input
                  id="confirmPassword"
                  className="form-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                  disabled={loading}
                  autoComplete="new-password"
                  maxLength={MAX_LENGTH}
                  placeholder="••••••••••••"
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? 'security-error' : undefined}
                />
              </div>

              {error && <div id="security-error" className="error-message" role="alert">{error}</div>}

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate('/admin/accueil')}
                  disabled={loading}
                >
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading
                    ? <><span className="spinner" aria-hidden="true" /> Modification...</>
                    : 'Changer le mot de passe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}
