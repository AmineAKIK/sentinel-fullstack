import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * Mécanisme global unique de retour d'action (contrat UX RC3, lot 1).
 *
 * Chaque mutation traverse cinq états : prêt (idle) → en cours (pending) →
 * succès | échec, avec récupération. Le succès est annoncé dans une zone
 * `aria-live="polite"` et s'efface après ~6 s ; l'échec est persistant dans une
 * zone `role="alert"` et ne disparaît jamais tout seul. Le verrou
 * anti-double-soumission vit dans le runner (`useMutationRunner`), au niveau du
 * déclencheur, de sorte qu'aucun bouton ne peut envoyer deux mutations
 * simultanées. La restauration du focus est de la responsabilité de l'appelant
 * (la modale ferme et rend le focus au déclencheur) ; le runner l'assiste via
 * l'option `restoreFocusTo`.
 *
 * Les erreurs de champ restent gérées localement dans les formulaires : ce canal
 * global ne porte que le résultat métier (succès) et les erreurs globales
 * (réseau, métier non liée à un champ précis).
 */

export type FeedbackKind = 'success' | 'error';

export const SUCCESS_AUTO_DISMISS_MS = 6000;

type FeedbackState = {
  kind: FeedbackKind | null;
  message: string | null;
};

type MutationFeedbackContextValue = FeedbackState & {
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
  dismiss: () => void;
};

const MutationFeedbackContext = createContext<MutationFeedbackContextValue | null>(null);

export function MutationFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FeedbackState>({ kind: null, message: null });
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (dismissTimer.current !== null) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setState({ kind: null, message: null });
  }, [clearTimer]);

  const notifySuccess = useCallback(
    (message: string) => {
      clearTimer();
      setState({ kind: 'success', message });
      // Un succès non critique reste affiché ~6 s puis s'efface.
      dismissTimer.current = setTimeout(() => {
        dismissTimer.current = null;
        setState({ kind: null, message: null });
      }, SUCCESS_AUTO_DISMISS_MS);
    },
    [clearTimer]
  );

  const notifyError = useCallback(
    (message: string) => {
      // Une erreur ne disparaît jamais automatiquement : aucun timer.
      clearTimer();
      setState({ kind: 'error', message });
    },
    [clearTimer]
  );

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo<MutationFeedbackContextValue>(
    () => ({ ...state, notifySuccess, notifyError, dismiss }),
    [state, notifySuccess, notifyError, dismiss]
  );

  return (
    <MutationFeedbackContext.Provider value={value}>
      {children}
      <GlobalFeedbackRegion />
    </MutationFeedbackContext.Provider>
  );
}

/**
 * Région vivante globale. Deux conteneurs distincts et toujours montés : la
 * zone polie (succès) et la zone d'alerte (erreur). Les garder montés permet aux
 * lecteurs d'écran d'annoncer le changement de contenu de façon fiable.
 */
function GlobalFeedbackRegion() {
  const ctx = useContext(MutationFeedbackContext);
  const success = ctx?.kind === 'success' ? ctx.message : null;
  const error = ctx?.kind === 'error' ? ctx.message : null;
  return (
    <div className="mutation-feedback-region">
      <div className="mutation-feedback-polite" role="status" aria-live="polite" aria-atomic="true">
        {success ? (
          <div className="success-message" data-feedback="success">
            {success}
            <button
              type="button"
              className="mutation-feedback-dismiss"
              aria-label="Fermer le message"
              onClick={() => ctx?.dismiss()}
            >
              ×
            </button>
          </div>
        ) : null}
      </div>
      <div className="mutation-feedback-alert" aria-live="assertive">
        {error ? (
          <div className="error-message" role="alert" data-feedback="error">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function useMutationFeedback(): MutationFeedbackContextValue {
  const ctx = useContext(MutationFeedbackContext);
  if (!ctx) {
    throw new Error('useMutationFeedback doit être utilisé dans un MutationFeedbackProvider.');
  }
  return ctx;
}

export type RunOptions = {
  /** Message de succès (résultat métier) ; si absent, aucun succès n'est annoncé globalement. */
  successMessage?: string;
  /** Traduit l'erreur capturée en message métier. Par défaut, un fallback générique. */
  toErrorMessage?: (error: unknown) => string;
  /** Élément à refocaliser après une exécution réussie (restauration du focus). */
  restoreFocusTo?: HTMLElement | null;
  /** Appelé après un succès (ex. fermer une modale). */
  onSuccess?: (result: unknown) => void;
  /** Appelé après un échec (ex. garder la modale ouverte, replacer le focus). */
  onError?: (error: unknown) => void;
};

const GENERIC_ERROR = 'Une erreur est survenue. Veuillez réessayer.';

/**
 * Runner de mutation lié à un déclencheur unique. `pending` vaut vrai pendant
 * l'exécution : le déclencheur s'en sert pour se désactiver (verrou
 * anti-double-soumission). Un second appel pendant le pending est ignoré.
 */
export function useMutationRunner() {
  const feedback = useMutationFeedback();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const execute = useCallback(
    async <T,>(run: () => Promise<T>, options: RunOptions = {}): Promise<T | undefined> => {
      if (inFlight.current) return undefined; // verrou anti-double soumission
      inFlight.current = true;
      setPending(true);
      try {
        const result = await run();
        if (options.successMessage) feedback.notifySuccess(options.successMessage);
        options.onSuccess?.(result);
        // Restauration du focus après succès (ex. retour au bouton déclencheur).
        if (options.restoreFocusTo) {
          // Laisser React refermer d'éventuelles modales avant de refocaliser.
          requestAnimationFrame(() => options.restoreFocusTo?.focus());
        }
        return result;
      } catch (error) {
        const message = options.toErrorMessage ? options.toErrorMessage(error) : GENERIC_ERROR;
        feedback.notifyError(message);
        options.onError?.(error);
        return undefined;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [feedback]
  );

  return { pending, execute } as const;
}
