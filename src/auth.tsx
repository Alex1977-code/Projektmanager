import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { api } from './api';
import type { SessionUser } from './types';

type Mode = 'none' | 'ldap' | 'header';
interface AuthState { mode: Mode; user: SessionUser | null; logout: () => Promise<void> }
interface MeResponse { mode: Mode; user: SessionUser | null; error: string | null; adminLogin: boolean }

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMe(await api.get<MeResponse>('/api/auth/me'));
      setFailed(null);
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onUnauthorized = () => setMe((m) => (m && m.mode !== 'none' ? { ...m, user: null } : m));
    window.addEventListener('pm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('pm:unauthorized', onUnauthorized);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout', {});
    setMe((m) => (m ? { ...m, user: null } : m));
  }, []);

  if (failed) {
    return (
      <div className="boot-screen">
        <div className="boot-card">
          <h1>Server nicht erreichbar</h1>
          <p>{failed}</p>
          <button className="btn btn-primary" onClick={load}>Erneut versuchen</button>
        </div>
      </div>
    );
  }
  if (!me) return <div className="boot-screen"><div className="spinner" aria-label="Lädt" /></div>;
  if (me.mode !== 'none' && !me.user) return <LoginPage mode={me.mode} error={me.error} onLogin={(user) => setMe({ ...me, user, error: null })} />;
  return <AuthCtx.Provider value={{ mode: me.mode, user: me.user, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth außerhalb des AuthProvider');
  return c;
}

function LoginPage({ mode, error, onLogin }: { mode: Mode; error: string | null; onLogin: (u: SessionUser) => void }) {
  const [username, setUsername] = useState(() => {
    try { return localStorage.getItem('pm.lastLogin') || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(error);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ user: SessionUser }>('/api/auth/login', { username, password });
      try { localStorage.setItem('pm.lastLogin', username); } catch { /* ohne Speicher */ }
      onLogin(res.user);
    } catch (err) {
      setMsg((err as Error).message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <svg viewBox="0 0 32 32" width="44" height="44" aria-hidden><rect width="32" height="32" rx="8" fill="#0b1f3a" /><path d="M5 21h22M8 21V12m16 9V12M8 12l8-5 8 5" stroke="#38bdf8" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 25.5c3 0 3-1.6 5.5-1.6S13 25.5 16 25.5s3-1.6 5.5-1.6 2.5 1.6 5.5 1.6" stroke="#7dd3fc" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
          <div>
            <h1>Projektsteuerung</h1>
            <p>Stahlwasserbau &amp; Bewegliche Brücken</p>
          </div>
        </div>
        {mode === 'header' ? (
          <p className="login-hint"><ShieldCheck size={16} /> <span>Die Anmeldung erfolgt automatisch mit Ihrem Windows-Konto. Für den Notfallzugang melden Sie sich als <code>admin</code> an.</span></p>
        ) : (
          <p className="login-hint"><ShieldCheck size={16} /> <span>Melden Sie sich mit Ihrem Windows-Benutzernamen und Kennwort an.</span></p>
        )}
        <label className="field">
          <span className="field-label">Benutzername</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="z. B. s.hartmann" autoFocus={!username} required />
        </label>
        <label className="field">
          <span className="field-label">Kennwort</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus={!!username} required />
        </label>
        {msg && <div className="login-error" role="alert"><KeyRound size={15} /> {msg}</div>}
        <button className="btn btn-primary login-btn" type="submit" disabled={busy}><LogIn size={16} /> {busy ? 'Anmeldung läuft …' : 'Anmelden'}</button>
      </form>
    </div>
  );
}
