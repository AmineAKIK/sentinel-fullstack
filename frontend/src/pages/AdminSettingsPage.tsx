import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { changeAdminPassword, getAdminEmail, updateAdminEmail } from '../api/adminSecurity';
import { getAdminNotifPrefs, patchAdminNotifPrefs, AdminNotifPrefs, getBoardSettings, patchBoardEnabled, patchBoardCode } from '../api/adminSettings';
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

const NOTIF_ITEMS: { key: keyof AdminNotifPrefs; label: string; description: string }[] = [
  {
    key: 'notif_admin',
    label: 'Alertes administrateur',
    description: 'Demandes de réinitialisation de mot de passe',
  },
  {
    key: 'notif_responsables',
    label: 'Responsables',
    description: "Demandes d'annulation et de correction",
  },
  {
    key: 'notif_techniciens',
    label: 'Techniciens',
    description: 'Incidents urgents, consignes et invalidations',
  },
  {
    key: 'notif_operateurs',
    label: 'Opérateurs',
    description: "Mises à jour d'incidents",
  },
];

export default function AdminSettingsPage() {
  usePageTitle('Paramètres — Administration');
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
    if (newPassword.length < MIN_PWD)
      return `Le nouveau mot de passe doit contenir au moins ${MIN_PWD} caractères.`;
    if (newPassword.length > MAX_PWD)
      return `Le mot de passe ne peut pas dépasser ${MAX_PWD} caractères.`;
    if (newPassword === currentPassword)
      return "Le nouveau mot de passe doit être différent de l'actuel.";
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
      setEmailError("Renseignez l'adresse email actuelle.");
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

  // ─── Board ────────────────────────────────────────────────────────────────
  const [boardEnabled, setBoardEnabled] = useState(true);
  const [savingBoardToggle, setSavingBoardToggle] = useState(false);
  const [boardHasCode, setBoardHasCode] = useState(false);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardNewCode, setBoardNewCode] = useState('');
  const [boardConfirmCode, setBoardConfirmCode] = useState('');
  const [boardPassword, setBoardPassword] = useState('');
  const [boardError, setBoardError] = useState('');
  const [boardSuccess, setBoardSuccess] = useState('');
  const [boardSubmitting, setBoardSubmitting] = useState(false);

  useEffect(() => {
    getBoardSettings()
      .then(({ board_enabled, hasCode }) => {
        setBoardEnabled(board_enabled);
        setBoardHasCode(hasCode);
      })
      .catch(() => {})
      .finally(() => setBoardLoading(false));
  }, []);

  async function handleBoardToggle(value: boolean) {
    setBoardEnabled(value);
    setSavingBoardToggle(true);
    try {
      await patchBoardEnabled(value);
    } catch {
      setBoardEnabled(!value);
    } finally {
      setSavingBoardToggle(false);
    }
  }

  function resetBoardForm() {
    setBoardNewCode('');
    setBoardConfirmCode('');
    setBoardPassword('');
    setBoardError('');
    setBoardSuccess('');
  }

  async function handleBoardCodeSubmit(e: FormEvent) {
    e.preventDefault();
    setBoardError('');
    setBoardSuccess('');
    if (boardNewCode.trim().length < 4) {
      setBoardError('Le code board doit contenir au moins 4 caractères.');
      return;
    }
    if (boardNewCode.trim() !== boardConfirmCode.trim()) {
      setBoardError('Les deux codes ne correspondent pas.');
      return;
    }
    if (!boardPassword) {
      setBoardError('Renseignez votre mot de passe.');
      return;
    }
    setBoardSubmitting(true);
    try {
      await patchBoardCode({
        newCode: boardNewCode.trim(),
        confirmCode: boardConfirmCode.trim(),
        currentPassword: boardPassword,
      });
      setBoardHasCode(true);
      resetBoardForm();
      setBoardSuccess('Code mis à jour. Sessions révoquées.');
      setTimeout(() => setBoardSuccess(''), 5000);
    } catch (err) {
      setBoardError(err instanceof ApiResponseError ? err.message : 'Une erreur est survenue.');
    } finally {
      setBoardSubmitting(false);
    }
  }

  return (
    <>
      <NavBar />
      <main id="main-content" className="page-container">
        <div className="page-header">
          <h1>Paramètres</h1>
        </div>

        <div className="settings-grid">

          {/* ── Card 1 : Mot de passe ── */}
          <div className="card">
            <div className="card-body">
              <p className="settings-section-title">Mot de passe</p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 20 }}>
                Minimum {MIN_PWD} caractères. Toutes vos sessions seront déconnectées.
              </p>
              <form onSubmit={handlePasswordSubmit} noValidate autoComplete="off">
                <div className="form-group">
                  <label className="form-label" htmlFor="currentPassword">Mot de passe actuel</label>
                  <input
                    id="currentPassword"
                    className="form-input"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => { setCurrentPassword(e.target.value); setPwdError(''); }}
                    disabled={pwdLoading}
                    autoComplete="off"
                    readOnly={!currentPassword && !pwdLoading}
                    onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
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
                    autoComplete="off"
                    readOnly={!newPassword && !pwdLoading}
                    onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
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
                    autoComplete="off"
                    readOnly={!confirmPassword && !pwdLoading}
                    onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
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
                    onClick={() => { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPwdError(''); }}
                    disabled={pwdLoading || (!currentPassword && !newPassword && !confirmPassword)}
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

          {/* ── Card 2 : Board atelier ── */}
          <div className="card">
            <div className="card-body">
              <p className="settings-section-title">Board atelier</p>

              {boardLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Chargement…</div>
              ) : (
                <>
                  <div className="notif-toggle-item" style={{ paddingTop: 0 }}>
                    <div className="notif-toggle-label">
                      <strong>Accès board</strong>
                      <span>Désactiver révoque toutes les sessions actives</span>
                    </div>
                    <label className="toggle-switch" aria-label="Activer le board atelier">
                      <input
                        type="checkbox"
                        checked={boardEnabled}
                        disabled={savingBoardToggle}
                        onChange={(e) => handleBoardToggle(e.target.checked)}
                      />
                      <span className="toggle-track" />
                    </label>
                  </div>

                  <div style={{ borderTop: '1px solid var(--color-border)', margin: '20px 0 20px' }} />

                  <p className="settings-section-title" style={{ marginBottom: 4 }}>Code d'accès</p>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 16 }}>
                    {boardHasCode
                      ? "Modifier le code révoque les sessions actives."
                      : <><strong style={{ color: 'var(--color-warning, #b45309)' }}>Aucun code configuré.</strong> Le board est inaccessible sans code.</>
                    }
                  </p>
                  <form onSubmit={handleBoardCodeSubmit} noValidate autoComplete="off">
                    <div className="form-group">
                      <label className="form-label" htmlFor="boardNewCode">
                        {boardHasCode ? 'Nouveau code' : "Code d'accès"}
                      </label>
                      <input
                        id="boardNewCode"
                        className="form-input"
                        type="password"
                        value={boardNewCode}
                        onChange={(e) => { setBoardNewCode(e.target.value); setBoardError(''); }}
                        disabled={boardSubmitting}
                        autoComplete="off"
                        readOnly={!boardNewCode && !boardSubmitting}
                        onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
                        maxLength={100}
                        placeholder="Minimum 4 caractères"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="boardConfirmCode">Confirmer le code</label>
                      <input
                        id="boardConfirmCode"
                        className="form-input"
                        type="password"
                        value={boardConfirmCode}
                        onChange={(e) => { setBoardConfirmCode(e.target.value); setBoardError(''); }}
                        disabled={boardSubmitting || !boardNewCode}
                        autoComplete="off"
                        readOnly={!boardConfirmCode && !boardSubmitting}
                        onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
                        maxLength={100}
                        placeholder="••••••••••••"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="boardPassword">Mot de passe administrateur</label>
                      <input
                        id="boardPassword"
                        className="form-input"
                        type="password"
                        value={boardPassword}
                        onChange={(e) => { setBoardPassword(e.target.value); setBoardError(''); }}
                        disabled={boardSubmitting}
                        autoComplete="off"
                        readOnly={!boardPassword && !boardSubmitting}
                        onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
                        maxLength={128}
                        placeholder="••••••••••••"
                      />
                    </div>
                    {boardError && <div className="error-message" role="alert">{boardError}</div>}
                    {boardSuccess && <div className="success-message" role="status">{boardSuccess}</div>}
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={resetBoardForm}
                        disabled={boardSubmitting || (!boardNewCode && !boardConfirmCode && !boardPassword)}
                      >
                        Annuler
                      </button>
                      <button type="submit" className="btn btn-primary btn-sm" disabled={boardSubmitting}>
                        {boardSubmitting
                          ? <><span className="spinner" aria-hidden="true" /> Enregistrement…</>
                          : 'Enregistrer'}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>

          {/* ── Card 3 : Email de notification ── */}
          <div className="card">
            <div className="card-body">
              <p className="settings-section-title">Email de notification</p>
              {emailHint ? (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 20 }}>
                  Adresse configurée : <strong>{emailHint}</strong>
                </p>
              ) : (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 20 }}>
                  Aucune adresse configurée. Laissez vide pour désactiver les notifications.
                </p>
              )}
              <form onSubmit={handleEmailSubmit} noValidate>
                {hasEmail && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="currentEmail">Adresse actuelle</label>
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
                    {hasEmail ? 'Nouvelle adresse' : 'Adresse email'}
                  </label>
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
                    placeholder="exemple@domaine.com"
                    aria-invalid={Boolean(emailError) || undefined}
                    aria-describedby={emailError ? 'email-error' : undefined}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="emailPassword">Mot de passe actuel</label>
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
                    placeholder="••••••••••••"
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

          {/* ── Card 4 : Notifications email ── */}
          <div className="card">
            <div className="card-body">
              <p className="settings-section-title">Notifications email</p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 20 }}>
                Activez ou désactivez les envois d'emails par canal. Sauvegarde immédiate.
              </p>
              {prefsLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Chargement…</div>
              ) : (
                <div className="notif-toggle-grid">
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

        </div>
      </main>
    </>
  );
}
