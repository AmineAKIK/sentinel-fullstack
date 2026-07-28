import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

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
  actionKey: string | null;
  presentation: 'global' | 'local';
};

type MutationFeedbackContextValue = FeedbackState & {
  pendingKey: string | null;
  notifySuccess: (message: string, actionKey?: string) => void;
  notifyError: (message: string, actionKey?: string, presentation?: 'global' | 'local') => void;
  dismiss: () => void;
  beginMutation: (owner: symbol, actionKey: string) => boolean;
  finishMutation: (owner: symbol) => void;
};

const MutationFeedbackContext = createContext<MutationFeedbackContextValue | null>(null);

export function MutationFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FeedbackState>({
    kind: null,
    message: null,
    actionKey: null,
    presentation: 'global',
  });
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeMutation = useRef<{ owner: symbol; actionKey: string } | null>(null);
  const mounted = useRef(true);
  const lastUsefulFocus = useRef<HTMLElement | null>(null);

  const clearTimer = useCallback(() => {
    if (dismissTimer.current !== null) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      focused.closest('.mutation-feedback-region') &&
      lastUsefulFocus.current?.isConnected
    ) {
      lastUsefulFocus.current.focus({ preventScroll: true });
    }
    setState({
      kind: null,
      message: null,
      actionKey: null,
      presentation: 'global',
    });
  }, [clearTimer]);

  const notifySuccess = useCallback(
    (message: string, actionKey = 'feedback') => {
      clearTimer();
      setState({ kind: 'success', message, actionKey, presentation: 'global' });
      // Un succès non critique reste affiché ~6 s puis s'efface.
      dismissTimer.current = setTimeout(() => {
        dismissTimer.current = null;
        const focused = document.activeElement;
        if (
          focused instanceof HTMLElement &&
          focused.closest('.mutation-feedback-region') &&
          lastUsefulFocus.current?.isConnected
        ) {
          lastUsefulFocus.current.focus({ preventScroll: true });
        }
        if (mounted.current) {
          setState({
            kind: null,
            message: null,
            actionKey: null,
            presentation: 'global',
          });
        }
      }, SUCCESS_AUTO_DISMISS_MS);
    },
    [clearTimer]
  );

  const notifyError = useCallback(
    (message: string, actionKey = 'feedback', presentation: 'global' | 'local' = 'global') => {
      // Une erreur ne disparaît jamais automatiquement : aucun timer.
      clearTimer();
      setState({ kind: 'error', message, actionKey, presentation });
    },
    [clearTimer]
  );

  const beginMutation = useCallback((owner: symbol, actionKey: string): boolean => {
    // Le ref rend le verrou synchrone : deux activations dans le même tour
    // d'événement ne peuvent pas précéder la mise à jour React.
    if (activeMutation.current !== null) return false;
    activeMutation.current = { owner, actionKey };
    if (mounted.current) setPendingKey(actionKey);
    return true;
  }, []);

  const finishMutation = useCallback((owner: symbol): void => {
    if (activeMutation.current?.owner !== owner) return;
    activeMutation.current = null;
    if (mounted.current) setPendingKey(null);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const rememberUsefulFocus = (event: FocusEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        !target.closest('.mutation-feedback-region') &&
        target.isConnected
      ) {
        lastUsefulFocus.current = target;
      }
    };
    document.addEventListener('focusin', rememberUsefulFocus);
    return () => {
      mounted.current = false;
      clearTimer();
      activeMutation.current = null;
      document.removeEventListener('focusin', rememberUsefulFocus);
    };
  }, [clearTimer]);

  const value = useMemo<MutationFeedbackContextValue>(
    () => ({
      ...state,
      pendingKey,
      notifySuccess,
      notifyError,
      dismiss,
      beginMutation,
      finishMutation,
    }),
    [state, pendingKey, notifySuccess, notifyError, dismiss, beginMutation, finishMutation]
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
  const error = ctx?.kind === 'error' && ctx.presentation === 'global' ? ctx.message : null;
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
  // Une erreur globale doit appartenir à la modale encore ouverte (le #root est
  // alors inert). Un succès ferme souvent cette modale dans le même rendu :
  // son statut est donc toujours porté par body afin de survivre à la fermeture.
  const target = error ? (dialogs[dialogs.length - 1] ?? document.body) : document.body;
  return createPortal(
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
    </div>,
    target
  );
}

export function useMutationFeedback(): MutationFeedbackContextValue {
  const ctx = useContext(MutationFeedbackContext);
  if (!ctx) {
    throw new Error('useMutationFeedback doit être utilisé dans un MutationFeedbackProvider.');
  }
  return ctx;
}

export type RunOptions<T = unknown> = {
  /** Identifiant stable de l'action, utilisé pour le pending et la récupération locale. */
  key?: string;
  /** Message de succès (résultat métier) ; si absent, aucun succès n'est annoncé globalement. */
  successMessage?: string;
  /** Traduit l'erreur capturée en message métier. Par défaut, un fallback générique. */
  toErrorMessage?: (error: unknown) => string;
  /** Une erreur locale reste gérée par le runner mais est rendue près de son champ. */
  errorPresentation?: 'global' | 'local';
  /** Élément à refocaliser après une exécution réussie (restauration du focus). */
  restoreFocusTo?: HTMLElement | null | (() => HTMLElement | null);
  /** Appelé après un succès (ex. fermer une modale). */
  onSuccess?: (result: T) => void;
  /** Appelé après un échec (ex. garder la modale ouverte, replacer le focus). */
  onError?: (error: unknown, safeMessage: string) => void;
};

const GENERIC_ERROR = 'Une erreur est survenue. Veuillez réessayer.';

export type MutationResult<T> =
  | { status: 'success'; value: T }
  | { status: 'error'; error: unknown }
  | { status: 'blocked' }
  | { status: 'aborted' };

/**
 * Runner de mutation lié à un déclencheur unique. `pending` vaut vrai pendant
 * l'exécution : le déclencheur s'en sert pour se désactiver (verrou
 * anti-double-soumission). Un second appel pendant le pending est ignoré.
 */
export function useMutationRunner() {
  const feedback = useMutationFeedback();
  const finishMutation = feedback.finishMutation;
  const owner = useRef(Symbol('mutation-runner'));
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const currentOwner = owner.current;
    return () => {
      mounted.current = false;
      finishMutation(currentOwner);
    };
  }, [finishMutation]);

  const execute = useCallback(
    async <T,>(run: () => Promise<T>, options: RunOptions<T> = {}): Promise<MutationResult<T>> => {
      const actionKey = options.key ?? 'mutation';
      const currentOwner = owner.current;
      if (!feedback.beginMutation(currentOwner, actionKey)) {
        return { status: 'blocked' };
      }
      try {
        const result = await run();
        if (!mounted.current) return { status: 'aborted' };
        if (options.successMessage) {
          feedback.notifySuccess(options.successMessage, actionKey);
        }
        options.onSuccess?.(result);
        // Restauration du focus après succès (ex. retour au bouton déclencheur).
        if (options.restoreFocusTo) {
          const resolveFocusTarget = options.restoreFocusTo;
          // Laisser React refermer d'éventuelles modales avant de refocaliser.
          requestAnimationFrame(() => {
            if (!mounted.current) return;
            const target =
              typeof resolveFocusTarget === 'function' ? resolveFocusTarget() : resolveFocusTarget;
            if (target?.isConnected) target.focus({ preventScroll: true });
          });
        }
        return { status: 'success', value: result };
      } catch (error) {
        if (!mounted.current) return { status: 'aborted' };
        const message = options.toErrorMessage ? options.toErrorMessage(error) : GENERIC_ERROR;
        feedback.notifyError(message, actionKey, options.errorPresentation ?? 'global');
        options.onError?.(error, message);
        return { status: 'error', error };
      } finally {
        feedback.finishMutation(currentOwner);
      }
    },
    [feedback]
  );

  return {
    pending: feedback.pendingKey !== null,
    pendingKey: feedback.pendingKey,
    errorKey: feedback.kind === 'error' ? feedback.actionKey : null,
    isPending: (key: string) => feedback.pendingKey === key,
    execute,
  } as const;
}
