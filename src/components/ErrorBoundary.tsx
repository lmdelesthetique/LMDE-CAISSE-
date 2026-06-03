'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('=== CRASH DETAILS ===');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    console.error('Component Stack:', info.componentStack);
    console.error('===================');
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center' }}>
          <h2 style={{ color: '#dc2626' }}>Une erreur est survenue</h2>
          <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
            {this.state.error?.message ?? 'Erreur inconnue'}
          </p>
          <button
            style={{ marginTop: '1rem', padding: '0.5rem 1.5rem', background: '#ec4899', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
