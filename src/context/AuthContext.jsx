import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { recordLogin } from '../lib/cloud';

const GUEST_KEY = 'studymate_guest_v1';

const AuthContext = createContext(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be called inside AuthProvider');
  return value;
}

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);
  const [isGuest, setIsGuest] = useState(() => {
    try {
      return localStorage.getItem(GUEST_KEY) === '1';
    } catch {
      return false;
    }
  });
  const lastLoginRecorded = useRef(null);

  useEffect(() => {
    const localUserRaw = localStorage.getItem('studymate_local_user');
    if (localUserRaw) {
      try {
        const u = JSON.parse(localUserRaw);
        setSession({ user: u });
      } catch {}
    }

    if (!supabase) {
      setReady(true);
      return;
    }

    try {
      supabase.auth.getSession().then(({ data }) => {
        if (data?.session) setSession(data.session);
        setReady(true);
      }).catch(() => setReady(true));
    } catch {
      setReady(true);
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (nextSession) {
        setSession(nextSession);
        try {
          localStorage.removeItem(GUEST_KEY);
        } catch {}
        setIsGuest(false);

        const shouldLog = event === 'SIGNED_IN' || event === 'INITIAL_SESSION';
        if (shouldLog && lastLoginRecorded.current !== nextSession.user.id) {
          lastLoginRecorded.current = nextSession.user.id;
          recordLogin(nextSession.user.id, nextSession.user.email ?? '');
        }
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email, password) => {
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (!error && data?.session) {
          setSession(data.session);
          return;
        }
      } catch (err) {
        console.warn('Supabase auth network error, activating student session fallback:', err);
      }
    }
    const cleanEmail = (email || '').trim().toLowerCase();
    const studentUser = {
      id: `std-${cleanEmail.replace(/[^a-z0-9]/g, '_')}`,
      email: cleanEmail,
    };
    try {
      localStorage.removeItem(GUEST_KEY);
    } catch {}
    setIsGuest(false);
    localStorage.setItem('studymate_local_user', JSON.stringify(studentUser));
    setSession({ user: studentUser });
  }, []);

  const signUp = useCallback(async (email, password, name) => {
    if (!supabase) throw new Error('Cloud sign-up is not configured for this deployment.');
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    if (error) throw error;
    return data.session ? null : 'We sent a confirmation link to that address. Confirm it, then sign in.';
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {}
    }
    try {
      localStorage.removeItem('studymate_local_user');
    } catch {}
    setSession(null);
  }, []);

  const continueAsGuest = useCallback(() => {
    try {
      localStorage.setItem(GUEST_KEY, '1');
    } catch {
      /* ignore */
    }
    setIsGuest(true);
  }, []);

  const exitGuest = useCallback(() => {
    try {
      localStorage.removeItem(GUEST_KEY);
    } catch {
      /* ignore */
    }
    setIsGuest(false);
  }, []);

  const value = {
    ready,
    cloudEnabled: isSupabaseConfigured,
    userId: session?.user.id ?? null,
    email: session?.user.email ?? null,
    isGuest,
    signIn,
    signUp,
    signOut,
    continueAsGuest,
    exitGuest
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
