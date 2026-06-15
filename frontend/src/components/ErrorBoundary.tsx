import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
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
    console.error('[ErrorBoundary]', error, info.componentStack);
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
            {this.state.error?.message ?? 'Erreur inconnue'}
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
