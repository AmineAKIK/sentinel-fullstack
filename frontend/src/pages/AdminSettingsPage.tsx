import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { changeAdminPassword, getAdminEmail, updateAdminEmail } from '../api/adminSecurity';
import { getAdminNotifPrefs, patchAdminNotifPrefs, AdminNotifPrefs } from '../api/adminSettings';
import { ApiResponseError } from '../api/client';
import { useAppAuth } from '../routes/AppAuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

const MIN_PWD = 12;
const MAX_PWD = 128;

interface NotifToggleProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (val: boolean) => void;
}

function NotifToggle({ id, label, description, checked, disabled, onChange }: NotifToggleProps) {
  return (
    <div className="notif-toggle-item">
      <div className="notif-toggle-label">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <label className="toggle-switch" aria-label={label}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-track" />
      </label>
    </div>
  );
}

const DEFAULT_PREFS: AdminNotifPrefs = {
  notif_admin: true,
  notif_responsables: true,
  notif_techniciens: true,
  notif_operateurs: true,
};

const NOTIF_ITEMS: {
  key: keyof AdminNotifPrefs;
  label: string;
  description: string;
}[] = [
  {
    key: 'notif_admin',
    label: 'Alertes administrateur',
    description: 'Demandes de réinitialisation de mot de passe',
  },
  {
    key: 'notif_responsables',
    label: 'Responsables',
    description: 'Demandes d\'annulation et de correction d\'incidents',
  },
  {
    key: 'notif_techniciens',
    label: 'Techniciens',
    description: 'Incidents urgents, consignes et invalidations',
  },
  {
    key: 'notif_operateurs',
    label: 'Opérateurs',
    description: 'Mises à jour d\'incidents (prise en charge, clôture, annulation…)',
  },
];

export default function AdminSettingsPage() {
  usePageTitle('Paramètres — Administration');
  const navigate = useNavigate();
  const { logout } = useAppAuth();

  // ─── Email ────────────────────────────────────────────────────────────────
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [hasEmail, setHasEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');

  useEffect(() => {
    getAdminEmail().then(({ hasEmail: has, hint }) => {
      setHasEmail(has);
      setEmailHint(hint);
    }).catch(() => {});
  }, []);

  function resetEmailForm() {
    setNewEmail('');
    setCurrentEmail('');
    setEmailPassword('');
    setEmailError('');
    setEmailSuccess('');
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');
    const normalized = newEmail.trim().toLowerCase();
    if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setEmailError('Nouvelle adresse email invalide.');
      return;
    }
    if (hasEmail && !currentEmail.trim()) {
      setEmailError('Renseignez l\'adresse email actuelle.');
      return;
    }
    if (!emailPassword) {
      setEmailError('Renseignez votre mot de passe.');
      return;
    }
    setEmailLoading(true);
    try {
      await updateAdminEmail({
        email: normalized || null,
        ...(hasEmail ? { currentEmail: currentEmail.trim().toLowerCase() } : {}),
        currentPassword: emailPassword,
      });
      const updated = await getAdminEmail();
      setHasEmail(updated.hasEmail);
      setEmailHint(updated.hint);
      resetEmailForm();
      setEmailSuccess('Email mis à jour.');
      setTimeout(() => setEmailSuccess(''), 4000);
    } catch (err) {
      setEmailError(err instanceof ApiResponseError ? err.message : 'Une erreur est survenue.');
    } finally {
      setEmailLoading(false);
    }
  }

  // ─── Préférences notifications ────────────────────────────────────────────
  const [prefs, setPrefs] = useState<AdminNotifPrefs>(DEFAULT_PREFS);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [savingPref, setSavingPref] = useState<keyof AdminNotifPrefs | null>(null);

  useEffect(() => {
    getAdminNotifPrefs()
      .then(setPrefs)
      .catch(() => {})
      .finally(() => setPrefsLoading(false));
  }, []);

  async function handleToggle(key: keyof AdminNotifPrefs, value: boolean) {
    setPrefs((p) => ({ ...p, [key]: value }));
    setSavingPref(key);
    try {
      const updated = await patchAdminNotifPrefs({ [key]: value });
      setPrefs(updated);
    } catch {
      setPrefs((p) => ({ ...p, [key]: !value }));
    } finally {
      setSavingPref(null);
    }
  }

  // ─── Mot de passe ─────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  function validatePassword(): string | null {
    if (!currentPassword) return 'Renseignez votre mot de passe actuel.';
    if (newPassword.length < MIN_PWD)
      return `Le nouveau mot de passe doit contenir au moins ${MIN_PWD} caractères.`;
    if (newPassword.length > MAX_PWD)
      return `Le mot de passe ne peut pas dépasser ${MAX_PWD} caractères.`;
    if (newPassword === currentPassword)
      return 'Le nouveau mot de passe doit être différent de l\'actuel.';
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
        state: { reason: 'Mot de passe modifié. Reconnectez-vous.' },
      });
    } catch (err) {
      setPwdError(err instanceof ApiResponseError ? err.message : 'Une erreur est survenue.');
    } finally {
      setPwdLoading(false);
    }
  }

  return (
    <>
      <NavBar />
      <main id="main-content" className="page-container">
        <div className="page-header">
          <h1>Paramètres</h1>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 520 }}>

          {/* ── Compte ── */}
          <div className="card">
            <div className="card-body">
              <p className="settings-section-title">Compte</p>
              <form onSubmit={handleEmailSubmit} noValidate>
                {hasEmail && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="currentEmail">
                      Adresse email actuelle
                    </label>
                    {emailHint && (
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 6 }}>
                        Adresse configurée : <strong>{emailHint}</strong>
                      </p>
                    )}
                    <input
                      id="currentEmail"
                      className="form-input"
                      type="text"
                      value={currentEmail}
                      onChange={(e) => { setCurrentEmail(e.target.value); setEmailError(''); }}
                      disabled={emailLoading}
                      autoComplete="off"
                      readOnly={!currentEmail && !emailLoading}
                      onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
                      maxLength={254}
                      placeholder="Saisir l'adresse actuelle"
                      aria-invalid={Boolean(emailError) || undefined}
                      aria-describedby={emailError ? 'email-error' : undefined}
                    />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label" htmlFor="newEmail">
                    {hasEmail ? 'Nouvelle adresse email' : 'Adresse email de notification'}
                  </label>
                  {!hasEmail && (
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 6 }}>
                      Aucune adresse configurée. Laissez vide pour désactiver les notifications.
                    </p>
                  )}
                  <input
                    id="newEmail"
                    className="form-input"
                    type="text"
                    value={newEmail}
                    onChange={(e) => { setNewEmail(e.target.value); setEmailError(''); }}
                    disabled={emailLoading}
                    autoComplete="off"
                    readOnly={!newEmail && !emailLoading}
                    onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
                    maxLength={254}
                    placeholder="Saisir la nouvelle adresse"
                    aria-invalid={Boolean(emailError) || undefined}
                    aria-describedby={emailError ? 'email-error' : undefined}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="emailPassword">
                    Mot de passe actuel
                  </label>
                  <input
                    id="emailPassword"
                    className="form-input"
                    type="password"
                    value={emailPassword}
                    onChange={(e) => { setEmailPassword(e.target.value); setEmailError(''); }}
                    disabled={emailLoading}
                    autoComplete="off"
                    readOnly={!emailPassword && !emailLoading}
                    onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
                    maxLength={MAX_PWD}
                    placeholder="Saisir le mot de passe"
                    aria-invalid={Boolean(emailError) || undefined}
                    aria-describedby={emailError ? 'email-error' : undefined}
                  />
                </div>
                {emailError && <div id="email-error" className="error-message" role="alert">{emailError}</div>}
                {emailSuccess && <div className="success-message" role="status">{emailSuccess}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={resetEmailForm}
                    disabled={emailLoading || (!newEmail && !currentEmail && !emailPassword)}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={emailLoading}
                  >
                    {emailLoading ? <><span className="spinner" aria-hidden="true" /> Enregistrement…</> : 'Enregistrer'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ── Notifications ── */}
          <div className="card">
            <div className="card-body">
              <p className="settings-section-title">Notifications email</p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 20 }}>
                Activez ou désactivez les envois d'emails par canal. Les modifications sont sauvegardées immédiatement.
              </p>
              {prefsLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Chargement…</div>
              ) : (
                <div className="notif-toggle-list">
                  {NOTIF_ITEMS.map(({ key, label, description }) => (
                    <NotifToggle
                      key={key}
                      id={key}
                      label={label}
                      description={description}
                      checked={prefs[key]}
                      disabled={savingPref === key}
                      onChange={(val) => handleToggle(key, val)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Mot de passe ── */}
          <div className="card">
            <div className="card-body">
              <p className="settings-section-title">Mot de passe</p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 20 }}>
                Minimum {MIN_PWD} caractères. Toutes vos sessions actives seront déconnectées.
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
                    maxLength={MAX_PWD}
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
                    maxLength={MAX_PWD}
                    placeholder="••••••••••••"
                    aria-invalid={Boolean(pwdError) || undefined}
                    aria-describedby={pwdError ? 'pwd-error' : undefined}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="confirmPassword">Confirmer</label>
                  <input
                    id="confirmPassword"
                    className="form-input"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setPwdError(''); }}
                    disabled={pwdLoading}
                    autoComplete="new-password"
                    maxLength={MAX_PWD}
                    placeholder="••••••••••••"
                    aria-invalid={Boolean(pwdError) || undefined}
                    aria-describedby={pwdError ? 'pwd-error' : undefined}
                  />
                </div>
                {pwdError && <div id="pwd-error" className="error-message" role="alert">{pwdError}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => navigate('/admin/accueil')}
                    disabled={pwdLoading}
                  >
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={pwdLoading}>
                    {pwdLoading ? <><span className="spinner" aria-hidden="true" /> Modification…</> : 'Changer le mot de passe'}
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
