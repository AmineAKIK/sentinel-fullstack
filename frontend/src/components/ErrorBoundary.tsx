import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export const PRODUCTION_ERROR_MESSAGE =
  "L'application a rencontré un problème. Rechargez la page pour continuer.";

export function errorBoundaryMessage(error: Error | null, production: boolean): string {
  return production ? PRODUCTION_ERROR_MESSAGE : (error?.message ?? 'Erreur inconnue');
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    if (import.meta.env.DEV) console.error('[ErrorBoundary]', error, info.componentStack);
    else console.error('[ErrorBoundary] Unexpected render failure.');
  }

  override render() {
    if (this.state.hasError) {
      return (
        <main
          id="main-content"
          className="page-container"
          style={{ textAlign: 'center', paddingTop: '4rem' }}
        >
          <h1>Une erreur inattendue est survenue</h1>
          <p style={{ color: 'var(--color-danger, #c0392b)', marginBottom: '1.5rem' }}>
            {errorBoundaryMessage(this.state.error, import.meta.env.PROD)}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.assign('/login')}
          >
            Recharger l'application
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
