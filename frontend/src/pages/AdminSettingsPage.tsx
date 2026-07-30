import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { changeAdminPassword, getAdminEmail, updateAdminEmail } from '../api/adminSecurity';
import {
  getAdminNotifPrefs,
  patchAdminNotifPrefs,
  AdminNotifPrefs,
  getBoardSettings,
  patchBoardEnabled,
  patchBoardCode,
  getAppSettings,
  patchAppSettings,
  AppSettings,
  AppSettingsPatch,
} from '../api/adminSettings';
import { apiErrorMessage, translateApiError, fieldInError } from '../api/errorMessages';
import { useAppAuth } from '../routes/AppAuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import ErrorBanner from '../components/ui/ErrorBanner';
import BoardToggleConfirmModal from '../components/BoardToggleConfirmModal';
import RevokeSessionsConfirmModal from '../components/RevokeSessionsConfirmModal';
import ConfirmModal from '../components/ConfirmModal';
import { useMutationRunner } from '../components/ui/MutationFeedback';
import {
  hasMinimumPasswordLength,
  isWithinBcryptByteLimit,
  MAX_PASSWORD_BYTES,
  MIN_BOARD_CODE_LENGTH,
  MIN_PASSWORD_LENGTH_ADMIN,
} from '../utils/passwordPolicy';

function normalizeAppSettings(raw: AppSettings): AppSettings {
  return {
    session_duration_hours: Number(raw.session_duration_hours),
    workshop_session_hours: Number(raw.workshop_session_hours),
    board_session_ttl_hours: Number(raw.board_session_ttl_hours),
    login_max_attempts: Number(raw.login_max_attempts),
    setup_code_ttl_hours: Number(raw.setup_code_ttl_hours),
    board_label: raw.board_label,
  };
}

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

// Champ public (details.field renvoyé par l'API) → id DOM de l'input concerné,
// pour ramener le focus sur une erreur de validation identifiable.
const APP_SETTING_FIELD_DOM_ID: Record<string, string> = {
  adminSessionDuration: 'sessionDuration',
  workshopSessionDuration: 'workshopSessionHours',
  boardSessionDuration: 'boardSessionTtl',
  loginMaxAttempts: 'loginMaxAttempts',
  setupCodeDuration: 'setupCodeTtl',
  boardLabel: 'boardLabel',
};

const NOTIF_ITEMS: { key: keyof AdminNotifPrefs; label: string; description: string }[] = [
  {
    key: 'notif_admin',
    label: 'Vous (administrateur)',
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
  const mutation = useMutationRunner();
  // ─── Mot de passe ─────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const pwdLoading = mutation.isPending('admin:security:password');

  function validatePassword(): string | null {
    if (!currentPassword) return 'Renseignez votre mot de passe actuel.';
    if (!isWithinBcryptByteLimit(currentPassword))
      return `Le mot de passe actuel ne peut pas dépasser ${MAX_PASSWORD_BYTES} octets UTF-8.`;
    if (!hasMinimumPasswordLength(newPassword, MIN_PASSWORD_LENGTH_ADMIN))
      return `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH_ADMIN} caractères.`;
    if (!isWithinBcryptByteLimit(newPassword))
      return `Le nouveau mot de passe ne peut pas dépasser ${MAX_PASSWORD_BYTES} octets UTF-8.`;
    if (newPassword === currentPassword)
      return "Le nouveau mot de passe doit être différent de l'actuel.";
    if (newPassword !== confirmPassword) return 'Les mots de passe ne correspondent pas.';
    return null;
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPwdError('');
    const err = validatePassword();
    if (err) {
      setPwdError(err);
      return;
    }
    const result = await mutation.execute(() => changeAdminPassword(currentPassword, newPassword), {
      key: 'admin:security:password',
      errorPresentation: 'local',
      toErrorMessage: (requestError) => apiErrorMessage(requestError, 'Une erreur est survenue.'),
      onError: (_requestError, safeMessage) => setPwdError(safeMessage),
    });
    if (result.status === 'success') {
      await logout();
      void navigate('/admin/login', {
        replace: true,
        state: { reason: 'Mot de passe modifié. Reconnectez-vous.' },
      });
    }
  }

  // ─── Email ────────────────────────────────────────────────────────────────
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [hasEmail, setHasEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const emailLoading = mutation.isPending('admin:security:email');
  const [emailError, setEmailError] = useState('');
  const [emailInitialLoading, setEmailInitialLoading] = useState(true);
  const [emailLoadError, setEmailLoadError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void getAdminEmail(controller.signal)
      .then(({ hasEmail: has, hint }) => {
        if (controller.signal.aborted) return;
        setHasEmail(has);
        setEmailHint(hint);
        setEmailLoadError('');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEmailLoadError("Impossible de charger la configuration de l'email.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setEmailInitialLoading(false);
      });
    return () => controller.abort();
  }, []);

  function resetEmailForm() {
    setNewEmail('');
    setCurrentEmail('');
    setEmailPassword('');
    setEmailError('');
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setEmailError('');
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
    if (!isWithinBcryptByteLimit(emailPassword)) {
      setEmailError(`Le mot de passe ne peut pas dépasser ${MAX_PASSWORD_BYTES} octets UTF-8.`);
      return;
    }
    await mutation.execute(
      async () => {
        await updateAdminEmail({
          email: normalized || null,
          ...(hasEmail ? { currentEmail: currentEmail.trim().toLowerCase() } : {}),
          currentPassword: emailPassword,
        });
        return getAdminEmail();
      },
      {
        key: 'admin:security:email',
        successMessage: 'Adresse email mise à jour.',
        errorPresentation: 'local',
        toErrorMessage: (requestError) => apiErrorMessage(requestError, 'Une erreur est survenue.'),
        onSuccess: (updated) => {
          setHasEmail(updated.hasEmail);
          setEmailHint(updated.hint);
          resetEmailForm();
        },
        onError: (_requestError, safeMessage) => setEmailError(safeMessage),
      }
    );
  }

  // ─── Préférences notifications ────────────────────────────────────────────
  const [prefs, setPrefs] = useState<AdminNotifPrefs>(DEFAULT_PREFS);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsLoadError, setPrefsLoadError] = useState('');
  const [prefsError, setPrefsError] = useState('');
  const [savingPref, setSavingPref] = useState<keyof AdminNotifPrefs | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getAdminNotifPrefs(controller.signal)
      .then((loadedPrefs) => {
        if (!controller.signal.aborted) setPrefs(loadedPrefs);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPrefsLoadError('Impossible de charger les préférences de notification.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPrefsLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function handleToggle(key: keyof AdminNotifPrefs, value: boolean) {
    setPrefsError('');
    setPrefs((p) => ({ ...p, [key]: value }));
    setSavingPref(key);
    await mutation.execute(() => patchAdminNotifPrefs({ [key]: value }), {
      key: `admin:notifications:${key}`,
      successMessage: 'Préférence de notification enregistrée.',
      errorPresentation: 'local',
      toErrorMessage: () => "Impossible d'enregistrer la préférence. Réessayez.",
      onSuccess: (updated) => {
        setPrefs(updated);
        setSavingPref(null);
      },
      onError: (_requestError, safeMessage) => {
        setPrefs((p) => ({ ...p, [key]: !value }));
        setPrefsError(safeMessage);
        setSavingPref(null);
        requestAnimationFrame(() => document.getElementById(key)?.focus());
      },
    });
  }

  // ─── Board ────────────────────────────────────────────────────────────────
  const [boardEnabled, setBoardEnabled] = useState(true);
  const [boardHasCode, setBoardHasCode] = useState(false);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardLoadError, setBoardLoadError] = useState('');
  const [boardNewCode, setBoardNewCode] = useState('');
  const [boardConfirmCode, setBoardConfirmCode] = useState('');
  const [boardPassword, setBoardPassword] = useState('');
  const [boardError, setBoardError] = useState('');
  const boardSubmitting = mutation.isPending('admin:board:code');
  const [boardTogglePending, setBoardTogglePending] = useState<boolean | null>(null);
  const [showBoardCodeConfirm, setShowBoardCodeConfirm] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getBoardSettings(controller.signal)
      .then(({ board_enabled, hasCode }) => {
        if (controller.signal.aborted) return;
        setBoardEnabled(board_enabled);
        setBoardHasCode(hasCode);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setBoardLoadError('Impossible de charger la configuration du board.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBoardLoading(false);
      });
    return () => controller.abort();
  }, []);

  function handleBoardToggle(value: boolean) {
    setBoardTogglePending(value);
  }

  async function confirmBoardToggle(password: string) {
    if (boardTogglePending === null) return;
    const value = boardTogglePending;
    await patchBoardEnabled(value, password);
    setBoardEnabled(value);
    setBoardTogglePending(null);
  }

  function resetBoardForm() {
    setBoardNewCode('');
    setBoardConfirmCode('');
    setBoardPassword('');
    setBoardError('');
  }

  function handleBoardCodeSubmit(e: FormEvent) {
    e.preventDefault();
    setBoardError('');
    if (!hasMinimumPasswordLength(boardNewCode.trim(), MIN_BOARD_CODE_LENGTH)) {
      setBoardError(`Le code board doit contenir au moins ${MIN_BOARD_CODE_LENGTH} caractères.`);
      return;
    }
    if (!isWithinBcryptByteLimit(boardNewCode.trim())) {
      setBoardError(`Le code board ne peut pas dépasser ${MAX_PASSWORD_BYTES} octets UTF-8.`);
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
    if (!isWithinBcryptByteLimit(boardPassword)) {
      setBoardError(`Le mot de passe ne peut pas dépasser ${MAX_PASSWORD_BYTES} octets UTF-8.`);
      return;
    }
    setShowBoardCodeConfirm(true);
  }

  async function confirmBoardCodeChange() {
    await mutation.execute(
      () =>
        patchBoardCode({
          newCode: boardNewCode.trim(),
          confirmCode: boardConfirmCode.trim(),
          currentPassword: boardPassword,
        }),
      {
        key: 'admin:board:code',
        successMessage: 'Code Board mis à jour. Sessions Board révoquées.',
        toErrorMessage: (requestError) => apiErrorMessage(requestError, 'Une erreur est survenue.'),
        onSuccess: () => {
          setBoardHasCode(true);
          resetBoardForm();
          setShowBoardCodeConfirm(false);
        },
      }
    );
  }

  // ─── App settings ─────────────────────────────────────────────────────────
  const [appSettings, setAppSettings] = useState<AppSettings>({
    session_duration_hours: 8,
    workshop_session_hours: 8,
    board_session_ttl_hours: 12,
    login_max_attempts: 10,
    setup_code_ttl_hours: 24,
    board_label: 'Board atelier',
  });
  const [appSettingsLoading, setAppSettingsLoading] = useState(true);
  const [appSettingsLoadError, setAppSettingsLoadError] = useState('');
  const [appSettingsDraft, setAppSettingsDraft] = useState<AppSettings | null>(null);
  const appSettingsSaving = mutation.isPending('admin:settings:save');
  const [appSettingsError, setAppSettingsError] = useState('');
  const [revokeAdmin, setRevokeAdmin] = useState(false);
  const [revokeWorkshop, setRevokeWorkshop] = useState(false);
  const [revokeBoard, setRevokeBoard] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getAppSettings(controller.signal)
      .then((raw) => {
        if (controller.signal.aborted) return;
        const normalized = normalizeAppSettings(raw);
        setAppSettings(normalized);
        setAppSettingsDraft(normalized);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAppSettingsLoadError("Impossible de charger les paramètres de l'application.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setAppSettingsLoading(false);
      });
    return () => controller.abort();
  }, []);

  function appSettingsDraftValue<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return (appSettingsDraft ?? appSettings)[key];
  }

  function setAppSettingsDraftField<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setAppSettingsDraft((d) => ({ ...(d ?? appSettings), [key]: value }));
    setAppSettingsError('');
  }

  function resetAppSettings() {
    setAppSettingsDraft(appSettings);
    setRevokeAdmin(false);
    setRevokeWorkshop(false);
    setRevokeBoard(false);
    setAppSettingsError('');
  }

  const appSettingsDirty =
    (appSettingsDraft !== null &&
      JSON.stringify(appSettingsDraft) !== JSON.stringify(appSettings)) ||
    revokeAdmin ||
    revokeWorkshop ||
    revokeBoard;

  async function handleAppSettingsSubmit(e: FormEvent, confirmPassword?: string) {
    e.preventDefault();
    // Toute révocation passe par le modal de confirmation par mot de passe —
    // couvre aussi la soumission par touche Entrée qui contourne le bouton.
    if ((revokeAdmin || revokeWorkshop || revokeBoard) && !confirmPassword) {
      setShowRevokeConfirm(true);
      return;
    }
    setAppSettingsError('');
    const didRevokeAdmin = revokeAdmin;
    const didRevokeWorkshop = revokeWorkshop;
    const didRevokeBoard = revokeBoard;

    const buildPatch = (): AppSettingsPatch => {
      const patch: AppSettingsPatch = {};
      if (appSettingsDraft) {
        (Object.keys(appSettingsDraft) as (keyof AppSettings)[]).forEach((key) => {
          if (appSettingsDraft[key] !== appSettings[key]) {
            (patch as Record<string, unknown>)[key] = appSettingsDraft[key];
          }
        });
      }
      if (didRevokeAdmin) patch.revokeAdminSessions = true;
      if (didRevokeWorkshop) patch.revokeWorkshopSessions = true;
      if (didRevokeBoard) patch.revokeBoardSessions = true;
      if (confirmPassword) patch.currentPassword = confirmPassword;
      return patch;
    };

    const applyUpdatedSettings = (raw: AppSettings) => {
      const updated = normalizeAppSettings(raw);
      setAppSettings(updated);
      setAppSettingsDraft(updated);
      setRevokeAdmin(false);
      setRevokeWorkshop(false);
      setRevokeBoard(false);
    };

    const afterSuccess = () => {
      if (didRevokeAdmin) {
        window.setTimeout(() => {
          void logout().then(() => {
            void navigate('/login', {
              replace: true,
              state: { reason: 'Sessions administrateur révoquées. Reconnectez-vous.' },
            });
          });
        }, 0);
      }
    };

    const handleError = (err: unknown, safeMessage = translateApiError(err)) => {
      setAppSettingsError(safeMessage);
      const field = fieldInError(err);
      const domId = field ? APP_SETTING_FIELD_DOM_ID[field] : undefined;
      if (domId) {
        requestAnimationFrame(() => {
          document.getElementById(domId)?.focus();
        });
      }
    };

    if (confirmPassword) {
      try {
        const raw = await patchAppSettings(buildPatch());
        applyUpdatedSettings(raw);
        afterSuccess();
      } catch (err) {
        handleError(err);
        throw err;
      }
      return;
    }

    await mutation.execute(() => patchAppSettings(buildPatch()), {
      key: 'admin:settings:save',
      successMessage: 'Paramètres enregistrés.',
      errorPresentation: 'local',
      toErrorMessage: translateApiError,
      onSuccess: (raw) => {
        applyUpdatedSettings(raw);
        afterSuccess();
      },
      onError: (err, safeMessage) => handleError(err, safeMessage),
    });
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
          <div className="card settings-full">
            <div className="card-body">
              <p className="settings-section-title">Mot de passe</p>
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                  marginBottom: 20,
                }}
              >
                Minimum {MIN_PASSWORD_LENGTH_ADMIN} caractères, maximum {MAX_PASSWORD_BYTES} octets
                UTF-8. Vous serez reconnecté après la modification.
              </p>
              <form onSubmit={handlePasswordSubmit} noValidate autoComplete="off">
                <div className="form-group">
                  <label className="form-label" htmlFor="currentPassword">
                    Mot de passe actuel
                  </label>
                  <input
                    id="currentPassword"
                    className="form-input"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      setPwdError('');
                    }}
                    disabled={pwdLoading}
                    autoComplete="off"
                    readOnly={!currentPassword && !pwdLoading}
                    onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
                    maxLength={MAX_PASSWORD_BYTES}
                    placeholder="••••••••••••"
                    aria-invalid={Boolean(pwdError) || undefined}
                    aria-describedby={pwdError ? 'pwd-error' : undefined}
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
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setPwdError('');
                    }}
                    disabled={pwdLoading}
                    autoComplete="off"
                    readOnly={!newPassword && !pwdLoading}
                    onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
                    maxLength={MAX_PASSWORD_BYTES}
                    placeholder="••••••••••••"
                    aria-invalid={Boolean(pwdError) || undefined}
                    aria-describedby={pwdError ? 'pwd-error' : undefined}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="confirmPassword">
                    Confirmer le nouveau mot de passe
                  </label>
                  <input
                    id="confirmPassword"
                    className="form-input"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setPwdError('');
                    }}
                    disabled={pwdLoading}
                    autoComplete="off"
                    readOnly={!confirmPassword && !pwdLoading}
                    onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
                    maxLength={MAX_PASSWORD_BYTES}
                    placeholder="••••••••••••"
                    aria-invalid={Boolean(pwdError) || undefined}
                    aria-describedby={pwdError ? 'pwd-error' : undefined}
                  />
                </div>
                {pwdError && (
                  <div id="pwd-error" className="error-message" role="alert">
                    {pwdError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setPwdError('');
                    }}
                    disabled={pwdLoading || (!currentPassword && !newPassword && !confirmPassword)}
                  >
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={pwdLoading}>
                    {pwdLoading ? (
                      <>
                        <span className="spinner" aria-hidden="true" /> Modification…
                      </>
                    ) : (
                      'Changer le mot de passe'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ── Card 2 : Board atelier ── */}
          <div className="card settings-full">
            <div className="card-body">
              <p className="settings-section-title">Board atelier</p>

              {boardLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                  Chargement…
                </div>
              ) : boardLoadError ? (
                <ErrorBanner>{boardLoadError}</ErrorBanner>
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
                        disabled={boardTogglePending !== null}
                        onChange={(e) => handleBoardToggle(e.target.checked)}
                      />
                      <span className="toggle-track" />
                    </label>
                  </div>

                  <div
                    style={{ borderTop: '1px solid var(--color-border)', margin: '20px 0 20px' }}
                  />

                  <p className="settings-section-title" style={{ marginBottom: 4 }}>
                    Code d'accès
                  </p>
                  <p
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-muted)',
                      marginBottom: 16,
                    }}
                  >
                    {boardHasCode ? (
                      <>Modifier le code révoque immédiatement toutes les sessions board actives.</>
                    ) : (
                      <>
                        <strong style={{ color: 'var(--color-warning, #b45309)' }}>
                          Aucun code configuré.
                        </strong>{' '}
                        Le board est inaccessible sans code.
                      </>
                    )}
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
                        onChange={(e) => {
                          setBoardNewCode(e.target.value);
                          setBoardError('');
                        }}
                        disabled={boardSubmitting}
                        autoComplete="off"
                        readOnly={!boardNewCode && !boardSubmitting}
                        onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
                        maxLength={MAX_PASSWORD_BYTES}
                        placeholder={`Minimum ${MIN_BOARD_CODE_LENGTH} caractères`}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="boardConfirmCode">
                        Confirmer le code
                      </label>
                      <input
                        id="boardConfirmCode"
                        className="form-input"
                        type="password"
                        value={boardConfirmCode}
                        onChange={(e) => {
                          setBoardConfirmCode(e.target.value);
                          setBoardError('');
                        }}
                        disabled={boardSubmitting || !boardNewCode}
                        autoComplete="off"
                        readOnly={!boardConfirmCode && !boardSubmitting}
                        onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
                        maxLength={MAX_PASSWORD_BYTES}
                        placeholder="••••••••••••"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="boardPassword">
                        Mot de passe administrateur
                      </label>
                      <input
                        id="boardPassword"
                        className="form-input"
                        type="password"
                        value={boardPassword}
                        onChange={(e) => {
                          setBoardPassword(e.target.value);
                          setBoardError('');
                        }}
                        disabled={boardSubmitting}
                        autoComplete="off"
                        readOnly={!boardPassword && !boardSubmitting}
                        onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
                        maxLength={MAX_PASSWORD_BYTES}
                        placeholder="••••••••••••"
                      />
                    </div>
                    {boardError && (
                      <div className="error-message" role="alert">
                        {boardError}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={resetBoardForm}
                        disabled={
                          boardSubmitting || (!boardNewCode && !boardConfirmCode && !boardPassword)
                        }
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={boardSubmitting}
                      >
                        {boardSubmitting ? (
                          <>
                            <span className="spinner" aria-hidden="true" /> Enregistrement…
                          </>
                        ) : (
                          'Enregistrer'
                        )}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>

          {/* ── Card 3 : Email de notification ── */}
          <div className="card settings-full">
            <div className="card-body">
              <p className="settings-section-title">Email de notification</p>
              {emailInitialLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                  Chargement…
                </div>
              ) : emailLoadError ? (
                <ErrorBanner>{emailLoadError}</ErrorBanner>
              ) : (
                <>
                  {emailHint ? (
                    <p
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-muted)',
                        marginBottom: 20,
                      }}
                    >
                      Adresse configurée : <strong>{emailHint}</strong>. Laissez le champ "Nouvelle
                      adresse" vide pour la supprimer.
                    </p>
                  ) : (
                    <p
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-muted)',
                        marginBottom: 20,
                      }}
                    >
                      Aucune adresse configurée — les notifications par email sont désactivées.
                    </p>
                  )}
                  <form onSubmit={handleEmailSubmit} noValidate>
                    {hasEmail && (
                      <div className="form-group">
                        <label className="form-label" htmlFor="currentEmail">
                          Confirmer l'adresse actuelle
                        </label>
                        <input
                          id="currentEmail"
                          className="form-input"
                          type="text"
                          value={currentEmail}
                          onChange={(e) => {
                            setCurrentEmail(e.target.value);
                            setEmailError('');
                          }}
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
                        onChange={(e) => {
                          setNewEmail(e.target.value);
                          setEmailError('');
                        }}
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
                      <label className="form-label" htmlFor="emailPassword">
                        Mot de passe actuel
                      </label>
                      <input
                        id="emailPassword"
                        className="form-input"
                        type="password"
                        value={emailPassword}
                        onChange={(e) => {
                          setEmailPassword(e.target.value);
                          setEmailError('');
                        }}
                        disabled={emailLoading}
                        autoComplete="off"
                        readOnly={!emailPassword && !emailLoading}
                        onFocus={(e) => e.currentTarget.removeAttribute('readonly')}
                        maxLength={MAX_PASSWORD_BYTES}
                        placeholder="••••••••••••"
                        aria-invalid={Boolean(emailError) || undefined}
                        aria-describedby={emailError ? 'email-error' : undefined}
                      />
                    </div>
                    {emailError && (
                      <div id="email-error" className="error-message" role="alert">
                        {emailError}
                      </div>
                    )}
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
                        {emailLoading ? (
                          <>
                            <span className="spinner" aria-hidden="true" /> Enregistrement…
                          </>
                        ) : (
                          'Enregistrer'
                        )}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>

          {/* ── Card 4 : Notifications email ── */}
          <div className="card settings-full">
            <div className="card-body">
              <p className="settings-section-title">Notifications email</p>
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                  marginBottom: 20,
                }}
              >
                Activez ou désactivez les envois d'emails par canal. Sauvegarde immédiate, sans
                bouton Enregistrer.
              </p>
              {prefsLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                  Chargement…
                </div>
              ) : prefsLoadError ? (
                <ErrorBanner>{prefsLoadError}</ErrorBanner>
              ) : (
                <>
                  {prefsError && <ErrorBanner>{prefsError}</ErrorBanner>}
                  <div className="notif-toggle-grid">
                    {NOTIF_ITEMS.map(({ key, label, description }) => (
                      <NotifToggle
                        key={key}
                        id={key}
                        label={label}
                        description={description}
                        checked={prefs[key]}
                        disabled={savingPref !== null}
                        onChange={(val) => void handleToggle(key, val)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Card 5 : Comportement ── */}
          <div className="card settings-full">
            <div className="card-body">
              <p className="settings-section-title">Comportement</p>
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                  marginBottom: 20,
                }}
              >
                Ces paramètres s'appliquent aux nouvelles sessions uniquement. Les sessions actives
                conservent leur configuration d'origine. Pour une application immédiate, utilisez la
                révocation ci-dessous.
              </p>
              {appSettingsLoading ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                  Chargement…
                </div>
              ) : appSettingsLoadError ? (
                <ErrorBanner>{appSettingsLoadError}</ErrorBanner>
              ) : (
                <form onSubmit={handleAppSettingsSubmit} noValidate>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="sessionDuration">
                        Durée de session — Administration
                      </label>
                      <input
                        id="sessionDuration"
                        className="form-input"
                        type="number"
                        min={1}
                        max={168}
                        value={appSettingsDraftValue('session_duration_hours')}
                        onChange={(e) =>
                          setAppSettingsDraftField(
                            'session_duration_hours',
                            Math.max(1, Math.min(168, parseInt(e.target.value) || 1))
                          )
                        }
                        disabled={appSettingsSaving}
                      />
                      <span
                        style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}
                      >
                        En heures — entre 1 et 168
                      </span>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="workshopSessionHours">
                        Durée de session — Atelier
                      </label>
                      <input
                        id="workshopSessionHours"
                        className="form-input"
                        type="number"
                        min={1}
                        max={168}
                        value={appSettingsDraftValue('workshop_session_hours')}
                        onChange={(e) =>
                          setAppSettingsDraftField(
                            'workshop_session_hours',
                            Math.max(1, Math.min(168, parseInt(e.target.value) || 1))
                          )
                        }
                        disabled={appSettingsSaving}
                      />
                      <span
                        style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}
                      >
                        En heures — entre 1 et 168
                      </span>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="boardSessionTtl">
                        Durée de session — Board atelier
                      </label>
                      {appSettingsDraftValue('board_session_ttl_hours') === 0 ? (
                        <input
                          id="boardSessionTtl"
                          className="form-input"
                          type="text"
                          value=""
                          placeholder="Désactivez « sans expiration automatique » pour choisir une durée"
                          disabled
                          readOnly
                        />
                      ) : (
                        <input
                          id="boardSessionTtl"
                          className="form-input"
                          type="number"
                          min={1}
                          max={168}
                          value={appSettingsDraftValue('board_session_ttl_hours')}
                          onChange={(e) =>
                            setAppSettingsDraftField(
                              'board_session_ttl_hours',
                              Math.max(1, Math.min(168, parseInt(e.target.value) || 1))
                            )
                          }
                          disabled={appSettingsSaving}
                        />
                      )}
                      <span
                        style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}
                      >
                        En heures — entre 1 et 168
                      </span>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="loginMaxAttempts">
                        Tentatives de connexion avant blocage
                      </label>
                      <input
                        id="loginMaxAttempts"
                        className="form-input"
                        type="number"
                        min={3}
                        max={50}
                        value={appSettingsDraftValue('login_max_attempts')}
                        onChange={(e) =>
                          setAppSettingsDraftField(
                            'login_max_attempts',
                            Math.max(3, Math.min(50, parseInt(e.target.value) || 3))
                          )
                        }
                        disabled={appSettingsSaving}
                      />
                      <span
                        style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}
                      >
                        Blocage temporaire de 5 minutes — entre 3 et 50
                      </span>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="setupCodeTtl">
                        Validité des codes de création de mot de passe
                      </label>
                      <input
                        id="setupCodeTtl"
                        className="form-input"
                        type="number"
                        min={1}
                        max={72}
                        value={appSettingsDraftValue('setup_code_ttl_hours')}
                        onChange={(e) =>
                          setAppSettingsDraftField(
                            'setup_code_ttl_hours',
                            Math.max(1, Math.min(72, parseInt(e.target.value) || 1))
                          )
                        }
                        disabled={appSettingsSaving}
                      />
                      <span
                        style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}
                      >
                        En heures — entre 1 et 72
                      </span>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="boardLabel">
                        Nom affiché du board atelier
                      </label>
                      <input
                        id="boardLabel"
                        className="form-input"
                        type="text"
                        maxLength={64}
                        value={appSettingsDraftValue('board_label')}
                        onChange={(e) => setAppSettingsDraftField('board_label', e.target.value)}
                        disabled={appSettingsSaving}
                        placeholder="Board atelier"
                      />
                    </div>
                  </div>

                  <div className="notif-toggle-item" style={{ margin: '8px 0 4px' }}>
                    <div className="notif-toggle-label">
                      <strong>Session Board sans expiration automatique</strong>
                      <span>
                        Reste active tant que le navigateur conserve sa session. Elle peut être
                        révoquée immédiatement depuis cette page.
                      </span>
                    </div>
                    <label
                      className="toggle-switch"
                      aria-label="Session Board sans expiration automatique"
                    >
                      <input
                        type="checkbox"
                        checked={appSettingsDraftValue('board_session_ttl_hours') === 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAppSettingsDraftField('board_session_ttl_hours', 0);
                          } else {
                            const prev = appSettings.board_session_ttl_hours;
                            setAppSettingsDraftField(
                              'board_session_ttl_hours',
                              prev > 0 ? prev : 12
                            );
                          }
                        }}
                        disabled={appSettingsSaving}
                      />
                      <span className="toggle-track" />
                    </label>
                  </div>

                  <div
                    style={{ borderTop: '1px solid var(--color-border)', margin: '20px 0 16px' }}
                  />
                  <p className="settings-section-title" style={{ marginBottom: 4 }}>
                    Révoquer les sessions
                  </p>
                  <p
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-muted)',
                      marginBottom: 12,
                    }}
                  >
                    Cochez les sessions à révoquer lors de l'enregistrement. Action irréversible —
                    les utilisateurs concernés seront déconnectés immédiatement à leur prochaine
                    requête.
                  </p>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 'var(--text-sm)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={revokeAdmin}
                        onChange={(e) => setRevokeAdmin(e.target.checked)}
                        disabled={appSettingsSaving}
                      />
                      Sessions administrateur
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 'var(--text-sm)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={revokeWorkshop}
                        onChange={(e) => setRevokeWorkshop(e.target.checked)}
                        disabled={appSettingsSaving}
                      />
                      Sessions atelier (tous les utilisateurs)
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 'var(--text-sm)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={revokeBoard}
                        onChange={(e) => setRevokeBoard(e.target.checked)}
                        disabled={appSettingsSaving}
                      />
                      Sessions board atelier
                    </label>
                  </div>

                  {appSettingsError && (
                    <div className="error-message" role="alert">
                      {appSettingsError}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={resetAppSettings}
                      disabled={appSettingsSaving || !appSettingsDirty}
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={appSettingsSaving || !appSettingsDirty}
                      onClick={
                        revokeAdmin || revokeWorkshop || revokeBoard
                          ? (e) => {
                              e.preventDefault();
                              setShowRevokeConfirm(true);
                            }
                          : undefined
                      }
                    >
                      {appSettingsSaving ? (
                        <>
                          <span className="spinner" aria-hidden="true" /> Enregistrement…
                        </>
                      ) : (
                        'Enregistrer'
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      {boardTogglePending !== null && (
        <BoardToggleConfirmModal
          enabling={boardTogglePending}
          onClose={() => setBoardTogglePending(null)}
          onConfirm={confirmBoardToggle}
        />
      )}

      {showRevokeConfirm && (
        <RevokeSessionsConfirmModal
          revokeAdmin={revokeAdmin}
          revokeWorkshop={revokeWorkshop}
          revokeBoard={revokeBoard}
          onClose={() => setShowRevokeConfirm(false)}
          onConfirm={async (password) => {
            const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
            await handleAppSettingsSubmit(fakeEvent, password);
            setShowRevokeConfirm(false);
          }}
        />
      )}

      {showBoardCodeConfirm && (
        <ConfirmModal
          title="Confirmer le changement du code Board"
          onClose={() => setShowBoardCodeConfirm(false)}
          onConfirm={confirmBoardCodeChange}
          mutationKey="admin:board:code"
          confirmLabel="Changer le code et révoquer les sessions"
          loadingLabel="Modification…"
          variant="danger"
        >
          <p>
            Le nouveau code remplacera immédiatement l’ancien. Toutes les sessions Board seront
            déconnectées et devront saisir le nouveau code. Cette action est définitive pour les
            sessions actuelles.
          </p>
        </ConfirmModal>
      )}
    </>
  );
}
