import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Shared player profile (dispersion + strategy) used across Dispersion,
// Expected Strokes, and per-hole strategy. Persisted to localStorage.
export type Profile = { offlineSD: number; depthSD: number; drivingDistance: number; preset: string };

const DEFAULT: Profile = { offlineSD: 8, depthSD: 7, drivingDistance: 260, preset: 'Standard' };
const KEY = 'caddai.profile';

type Ctx = { profile: Profile; setProfile: (p: Partial<Profile>) => void };
const ProfileCtx = createContext<Ctx | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setState] = useState<Profile>(() => {
    try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEFAULT; }
  });
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch {} }, [profile]);
  const setProfile = (p: Partial<Profile>) => setState((prev) => ({ ...prev, ...p }));
  return <ProfileCtx.Provider value={{ profile, setProfile }}>{children}</ProfileCtx.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileCtx);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
