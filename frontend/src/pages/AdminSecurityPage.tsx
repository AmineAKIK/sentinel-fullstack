import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { changeAdminPassword, getAdminEmail, updateAdminEmail } from '../api/adminSecurity';
import { ApiResponseError } from '../api/client';
import { useAppAuth } from '../routes/AppAuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

const MIN_LENGTH = 12;
const MAX_LENGTH = 128;

export default function AdminSecurityPage() {
  usePageTitle('Sécurité — Administration');
  const navigate = useNavigate();
  const { logout } = useAppAuth();

  // ─── Mot de passe ─────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  function validatePassword(): string | null {
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

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPwdError('');
    const err = validatePassword();
    if (err) { setPwdError(err); return; }
    setPwdLoading(true);
    try {
      await changeAdminPassword(currentPassword, newPassword);
      await logout();
      navigate('/admin/login', {
        replace: true,
        state: { reason: 'Mot de passe modifié. Reconnectez-vous avec votre nouveau mot de passe.' },
      });
    } catch (err) {
      setPwdError(err instanceof ApiResponseError ? err.message : 'Une erreur est survenue. Réessayez.');
    } finally {
      setPwdLoading(false);
    }
  }

  // ─── Email de notification ─────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [emailInitial, setEmailInitial] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');

  useEffect(() => {
    getAdminEmail().then(({ email: e }) => {
      setEmail(e ?? '');
      setEmailInitial(e ?? '');
    }).catch(() => {});
  }, []);

  const emailDirty = email.trim() !== emailInitial;

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');
    const normalized = email.trim().toLowerCase();
    if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setEmailError('Adresse email invalide.');
      return;
    }
    setEmailLoading(true);
    try {
      const { email: saved } = await updateAdminEmail(normalized || null);
      setEmail(saved ?? '');
      setEmailInitial(saved ?? '');
      setEmailSuccess('Email de notification mis à jour.');
      setTimeout(() => setEmailSuccess(''), 4000);
    } catch (err) {
      setEmailError(err instanceof ApiResponseError ? err.message : 'Une erreur est survenue.');
    } finally {
      setEmailLoading(false);
    }
  }

  return (
    <>
      <NavBar />
      <main id="main-content" className="page-container">
        <div className="page-header">
          <h1>Sécurité</h1>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 480 }}>

          {/* ── Email de notification ── */}
          <div className="card">
            <div className="card-body">
              <h2>Email de notification</h2>
              <p style={{ marginBottom: 20, color: 'var(--color-text-secondary)' }}>
                Adresse qui reçoit les alertes Sentinel (demandes de réinitialisation, etc.).
                Laissez vide pour désactiver les notifications.
              </p>
              <form onSubmit={handleEmailSubmit} noValidate>
                <div className="form-group">
                  <label className="form-label" htmlFor="adminEmail">Adresse email</label>
                  <input
                    id="adminEmail"
                    className="form-input"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailError(''); setEmailSuccess(''); }}
                    disabled={emailLoading}
                    autoComplete="email"
                    maxLength={254}
                    placeholder="contact@akiksystems.com"
                    aria-invalid={Boolean(emailError) || undefined}
                    aria-describedby={emailError ? 'email-error' : undefined}
                  />
                </div>
                {emailError && <div id="email-error" className="error-message" role="alert">{emailError}</div>}
                {emailSuccess && <div className="success-message" role="status">{emailSuccess}</div>}
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => { setEmail(emailInitial); setEmailError(''); setEmailSuccess(''); }}
                    disabled={emailLoading || !emailDirty}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={emailLoading || !emailDirty}
                  >
                    {emailLoading
                      ? <><span className="spinner" aria-hidden="true" /> Enregistrement...</>
                      : 'Enregistrer'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ── Mot de passe ── */}
          <div className="card">
            <div className="card-body">
              <h2>Changer le mot de passe</h2>
              <p style={{ marginBottom: 24, color: 'var(--color-text-secondary)' }}>
                Le nouveau mot de passe doit contenir au moins {MIN_LENGTH} caractères.
                Toutes vos sessions actives seront déconnectées.
              </p>
              <form onSubmit={handlePasswordSubmit} noValidate>
                <div className="form-group">
                  <label className="form-label" htmlFor="currentPassword">Mot de passe actuel</label>
                  <input
                    id="currentPassword"
                    className="form-input"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => { setCurrentPassword(e.target.value); setPwdError(''); }}
                    disabled={pwdLoading}
                    autoComplete="current-password"
                    maxLength={MAX_LENGTH}
                    placeholder="••••••••••••"
                    aria-invalid={Boolean(pwdError) || undefined}
                    aria-describedby={pwdError ? 'pwd-error' : undefined}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="newPassword">Nouveau mot de passe</label>
                  <input
                    id="newPassword"
                    className="form-input"
                    type="password"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPwdError(''); }}
                    disabled={pwdLoading}
                    autoComplete="new-password"
                    maxLength={MAX_LENGTH}
                    placeholder="••••••••••••"
                    aria-invalid={Boolean(pwdError) || undefined}
                    aria-describedby={pwdError ? 'pwd-error' : undefined}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="confirmPassword">Confirmer le nouveau mot de passe</label>
                  <input
                    id="confirmPassword"
                    className="form-input"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setPwdError(''); }}
                    disabled={pwdLoading}
                    autoComplete="new-password"
                    maxLength={MAX_LENGTH}
                    placeholder="••••••••••••"
                    aria-invalid={Boolean(pwdError) || undefined}
                    aria-describedby={pwdError ? 'pwd-error' : undefined}
                  />
                </div>
                {pwdError && <div id="pwd-error" className="error-message" role="alert">{pwdError}</div>}
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => navigate('/admin/accueil')}
                    disabled={pwdLoading}
                  >
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={pwdLoading}>
                    {pwdLoading
                      ? <><span className="spinner" aria-hidden="true" /> Modification...</>
                      : 'Changer le mot de passe'}
                  </button>
                </div>
              </form>
            </div>
          </div>

        </div>
      </main>
    </>
  );
}
