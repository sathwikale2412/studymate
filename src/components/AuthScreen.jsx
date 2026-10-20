import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthScreen() {
  const { signIn, signUp, continueAsGuest } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        const hint = await signUp(email.trim(), password, name.trim());
        setNotice(hint || 'Account ready. You are signed in.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: '1.25rem' }}>
          <div className="brand-mark">S</div>
          <div>
            <h1 style={{ fontSize: '1rem', color: '#1c2520' }}>StudyMate</h1>
            <p style={{ fontSize: '0.75rem', color: '#5b6660' }}>Sign in to keep your questions and answers</p>
          </div>
        </div>

        <div className="tabs">
          <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError(''); setNotice(''); }}>
            Sign in
          </button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); setNotice(''); }}>
            Create account
          </button>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="field">
              <label htmlFor="sm-name">Name</label>
              <input id="sm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Farmer or field officer" autoComplete="name" />
            </div>
          )}

          <div className="field">
            <label htmlFor="sm-email">Email</label>
            <input id="sm-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </div>

          <div className="field">
            <label htmlFor="sm-password">Password</label>
            <input
              id="sm-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <p className="error" style={{ marginTop: 0 }}>{error}</p>}
          {notice && <p className="notice" style={{ marginTop: 0 }}>{notice}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create my account'}
          </button>
        </form>

        <div className="divider">
          <button type="button" className="btn btn-block" style={{ marginTop: 0 }} onClick={continueAsGuest}>
            Continue as guest (nothing is saved)
          </button>
        </div>
      </div>
    </div>
  );
}
