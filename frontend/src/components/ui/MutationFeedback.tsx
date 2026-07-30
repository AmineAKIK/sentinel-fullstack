import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import CloseIcon from '../icons/CloseIcon';

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

export type FeedbackKind = 'success' | 'error' | 'info';

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
  notifyInfo: (message: string, actionKey?: string) => void;
  dismiss: () => void;
  beginMutation: (owner: symbol, actionKey: string) => boolean;
  finishMutation: (owner: symbol) => void;
};

const MutationFeedbackContext = createContext<MutationFeedbackContextValue | null>(null);

const EMPTY_FEEDBACK: FeedbackState = {
  kind: null,
  message: null,
  actionKey: null,
  presentation: 'global',
};

const FEEDBACK_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function MutationFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FeedbackState>(EMPTY_FEEDBACK);
  const stateRef = useRef<FeedbackState>(EMPTY_FEEDBACK);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerStartedAt = useRef<number | null>(null);
  const remainingDismissMs = useRef(SUCCESS_AUTO_DISMISS_MS);
  const pauseReasons = useRef(new Set<'hover' | 'focus'>());
  const feedbackGeneration = useRef(0);
  const activeMutation = useRef<{ owner: symbol; actionKey: string } | null>(null);
  const mounted = useRef(true);
  const lastUsefulFocus = useRef<HTMLElement | null>(null);

  const clearTimer = useCallback(() => {
    if (dismissTimer.current !== null) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    timerStartedAt.current = null;
  }, []);

  const commitState = useCallback((next: FeedbackState) => {
    stateRef.current = next;
    if (mounted.current) setState(next);
  }, []);

  const restoreUsefulFocus = useCallback(() => {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !focused.closest('.mutation-feedback-region')) {
      return;
    }

    const firstUsefulFocusable = (container: Element | null) =>
      container
        ? Array.from(container.querySelectorAll<HTMLElement>(FEEDBACK_FOCUSABLE_SELECTOR)).find(
            (element) => !element.closest('.mutation-feedback-region')
          )
        : undefined;
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
    const activeDialog = dialogs[dialogs.length - 1];
    const dialogFallback = firstUsefulFocusable(activeDialog);
    const pageFallback =
      firstUsefulFocusable(document.getElementById('main-content')) ??
      firstUsefulFocusable(document.querySelector('.nav-bar'));
    const target = lastUsefulFocus.current?.isConnected
      ? lastUsefulFocus.current
      : (dialogFallback ?? pageFallback);
    target?.focus({ preventScroll: true });
  }, []);

  const expireFeedback = useCallback(
    (generation: number) => {
      if (
        !mounted.current ||
        feedbackGeneration.current !== generation ||
        stateRef.current.kind === 'error'
      ) {
        return;
      }
      clearTimer();
      feedbackGeneration.current += 1;
      remainingDismissMs.current = SUCCESS_AUTO_DISMISS_MS;
      pauseReasons.current.clear();
      restoreUsefulFocus();
      commitState(EMPTY_FEEDBACK);
    },
    [clearTimer, commitState, restoreUsefulFocus]
  );

  const startDismissTimer = useCallback(
    (delay: number, generation: number) => {
      clearTimer();
      if (pauseReasons.current.size > 0) return;
      timerStartedAt.current = Date.now();
      dismissTimer.current = setTimeout(() => expireFeedback(generation), Math.max(0, delay));
    },
    [clearTimer, expireFeedback]
  );

  const dismiss = useCallback(() => {
    feedbackGeneration.current += 1;
    clearTimer();
    remainingDismissMs.current = SUCCESS_AUTO_DISMISS_MS;
    pauseReasons.current.clear();
    restoreUsefulFocus();
    commitState(EMPTY_FEEDBACK);
  }, [clearTimer, commitState, restoreUsefulFocus]);

  const notifyAutoDismiss = useCallback(
    (kind: 'success' | 'info', message: string, actionKey: string) => {
      clearTimer();
      const generation = feedbackGeneration.current + 1;
      feedbackGeneration.current = generation;
      remainingDismissMs.current = SUCCESS_AUTO_DISMISS_MS;
      commitState({ kind, message, actionKey, presentation: 'global' });
      startDismissTimer(remainingDismissMs.current, generation);
    },
    [clearTimer, commitState, startDismissTimer]
  );

  const notifySuccess = useCallback(
    (message: string, actionKey = 'feedback') => {
      notifyAutoDismiss('success', message, actionKey);
    },
    [notifyAutoDismiss]
  );

  const notifyInfo = useCallback(
    (message: string, actionKey = 'feedback') => {
      notifyAutoDismiss('info', message, actionKey);
    },
    [notifyAutoDismiss]
  );

  const notifyError = useCallback(
    (message: string, actionKey = 'feedback', presentation: 'global' | 'local' = 'global') => {
      // Une erreur ne disparaît jamais automatiquement : aucun timer.
      feedbackGeneration.current += 1;
      clearTimer();
      remainingDismissMs.current = SUCCESS_AUTO_DISMISS_MS;
      commitState({ kind: 'error', message, actionKey, presentation });
    },
    [clearTimer, commitState]
  );

  const pauseAutoDismiss = useCallback(
    (reason: 'hover' | 'focus') => {
      pauseReasons.current.add(reason);
      if (dismissTimer.current === null || timerStartedAt.current === null) return;
      const elapsed = Math.max(0, Date.now() - timerStartedAt.current);
      remainingDismissMs.current = Math.max(0, remainingDismissMs.current - elapsed);
      clearTimer();
    },
    [clearTimer]
  );

  const resumeAutoDismiss = useCallback(
    (reason: 'hover' | 'focus') => {
      pauseReasons.current.delete(reason);
      if (
        pauseReasons.current.size > 0 ||
        stateRef.current.kind === null ||
        stateRef.current.kind === 'error' ||
        dismissTimer.current !== null
      ) {
        return;
      }
      startDismissTimer(remainingDismissMs.current, feedbackGeneration.current);
    },
    [startDismissTimer]
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
      feedbackGeneration.current += 1;
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
      notifyInfo,
      dismiss,
      beginMutation,
      finishMutation,
    }),
    [
      state,
      pendingKey,
      notifySuccess,
      notifyError,
      notifyInfo,
      dismiss,
      beginMutation,
      finishMutation,
    ]
  );

  return (
    <MutationFeedbackContext.Provider value={value}>
      {children}
      <GlobalFeedbackRegion onPause={pauseAutoDismiss} onResume={resumeAutoDismiss} />
    </MutationFeedbackContext.Provider>
  );
}

function useFeedbackTopOffset(visibleKey: string | null): number {
  const [topOffset, setTopOffset] = useState(16);

  useLayoutEffect(() => {
    let frame: number | null = null;
    const nav = document.querySelector<HTMLElement>('.nav-bar');

    const update = () => {
      frame = null;
      const viewportGap = window.innerWidth <= 700 ? 12 : 16;
      const navBottom = nav?.getBoundingClientRect().bottom ?? 0;
      setTopOffset(Math.max(viewportGap, Math.ceil(navBottom) + viewportGap));
    };
    const scheduleUpdate = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);
    let resizeObserver: ResizeObserver | null = null;
    if (nav && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleUpdate);
      resizeObserver.observe(nav);
    }

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
    };
  }, [visibleKey]);

  return topOffset;
}

type GlobalFeedbackRegionProps = {
  onPause: (reason: 'hover' | 'focus') => void;
  onResume: (reason: 'hover' | 'focus') => void;
};

function GlobalFeedbackRegion({ onPause, onResume }: GlobalFeedbackRegionProps) {
  const ctx = useContext(MutationFeedbackContext);
  const polite =
    ctx?.presentation === 'global' && (ctx.kind === 'success' || ctx.kind === 'info')
      ? ctx.message
      : null;
  const error = ctx?.kind === 'error' && ctx.presentation === 'global' ? ctx.message : null;
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
  // Une erreur globale doit appartenir à la modale encore ouverte (le #root est
  // alors inert). Un succès est porté par body afin de survivre à la fermeture
  // éventuelle de la modale dans le même commit React.
  const target = error ? (dialogs[dialogs.length - 1] ?? document.body) : document.body;
  const visibleKey = ctx?.message ? `${ctx.kind}:${ctx.actionKey}:${ctx.message}` : null;
  const topOffset = useFeedbackTopOffset(visibleKey);
  const kind = error ? 'error' : ctx?.kind === 'info' ? 'info' : 'success';
  const message = error ?? polite;
  const title =
    kind === 'error' ? 'Action impossible' : kind === 'info' ? 'Information' : 'Action réussie';
  const icon = kind === 'error' ? '!' : kind === 'info' ? 'i' : '✓';

  return createPortal(
    <div
      className="mutation-feedback-region"
      style={{ '--mutation-feedback-top': `${topOffset}px` } as React.CSSProperties}
      onMouseEnter={() => onPause('hover')}
      onMouseLeave={() => onResume('hover')}
      onFocusCapture={() => onPause('focus')}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onResume('focus');
        }
      }}
    >
      {message ? (
        <div
          className={`mutation-feedback-card mutation-feedback-card--${kind}`}
          data-feedback={kind}
        >
          <span className="mutation-feedback-icon" aria-hidden="true">
            {icon}
          </span>
          <div
            className="mutation-feedback-content"
            role={kind === 'error' ? 'alert' : 'status'}
            aria-live={kind === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
          >
            <strong className="mutation-feedback-title">{title}</strong>
            <p className="mutation-feedback-message">{message}</p>
          </div>
          <button
            type="button"
            className="mutation-feedback-dismiss"
            aria-label="Fermer la notification"
            onClick={() => ctx?.dismiss()}
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}
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
