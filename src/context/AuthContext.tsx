import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

type User = { id: string; email: string; name?: string };
type AuthState = {
  user: User | null;
  loading: boolean;
  demo: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | undefined>(undefined);
const DEMO_KEY = 'caddai.demoUser';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(({ data }) => {
        const u = data.session?.user;
        setUser(u ? { id: u.id, email: u.email!, name: u.user_metadata?.name } : null);
        setLoading(false);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        const u = session?.user;
        setUser(u ? { id: u.id, email: u.email!, name: u.user_metadata?.name } : null);
      });
      return () => sub.subscription.unsubscribe();
    }
    // Demo mode
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    setLoading(false);
  }, []);

  const setDemo = (u: User | null) => {
    setUser(u);
    try {
      if (u) localStorage.setItem(DEMO_KEY, JSON.stringify(u));
      else localStorage.removeItem(DEMO_KEY);
    } catch {}
  };

  const signIn: AuthState['signIn'] = async (email, password) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return;
    }
    if (!email) throw new Error('Enter an email');
    setDemo({ id: 'demo', email, name: email.split('@')[0] });
  };

  const signUp: AuthState['signUp'] = async (name, email, password) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
      if (error) throw error;
      return;
    }
    if (!email) throw new Error('Enter an email');
    setDemo({ id: 'demo', email, name: name || email.split('@')[0] });
  };

  const signOut: AuthState['signOut'] = async () => {
    if (isSupabaseConfigured && supabase) await supabase.auth.signOut();
    setDemo(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, demo: !isSupabaseConfigured, signIn, signUp, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
