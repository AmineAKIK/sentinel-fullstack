import { useState, FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { login } from '../api/auth';
import { useAuth } from '../routes/AuthContext';
import { ApiResponseError } from '../api/client';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reason = (location.state as { reason?: string } | null)?.reason;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Veuillez renseigner votre identifiant et votre mot de passe.');
      return;
    }

    setLoading(true);
    try {
      const admin = await login(username.trim(), password);
      setAdmin(admin);
      navigate('/admin/accueil', { replace: true, state: null });
    } catch (err) {
      if (err instanceof ApiResponseError) {
        setError(err.message);
      } else {
        setError('Une erreur inattendue est survenue.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-title">
          <h1>Administration Sentinel</h1>
          <p>Gestion des comptes utilisateurs</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {reason && (
            <div className="notice" style={{ marginBottom: 12 }}>
              {reason}
            </div>
          )}
          <div className="form-group">
            <label className="form-label" htmlFor="username">Identifiant</label>
            <input
              id="username"
              className="form-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoComplete="username"
              autoFocus
              placeholder="admin"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="password">Mot de passe</label>
            <input
              id="password"
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <><span className="spinner" /> Connexion…</> : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
