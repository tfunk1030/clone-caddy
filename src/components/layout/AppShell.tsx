import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Map, Target, Crosshair, CloudSun, Wind, Trophy, Settings as SettingsIcon,
  Menu, X, LogOut, User,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/course', label: 'Prepare', icon: Map },
  { to: '/app/dispersion', label: 'Dispersion', icon: Target },
  { to: '/app/expected-strokes', label: 'Expected Strokes', icon: Crosshair },
  { to: '/app/conditions', label: 'Conditions', icon: CloudSun },
  { to: '/app/forecast', label: 'Wind & Forecast', icon: Wind },
  { to: '/app/rankings', label: 'Rankings', icon: Trophy },
  { to: '/app/settings', label: 'Settings', icon: SettingsIcon },
];

export function AppShell() {
  const [open, setOpen] = useState(false);
  const { user, signOut, demo } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => { await signOut(); navigate('/login'); };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-60 shrink-0 border-r border-border bg-card px-3 py-4 transition-transform md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="px-2 pb-5">
          <Logo />
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute inset-x-3 bottom-4">
          {demo && (
            <div className="mb-2 rounded-md border border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
              Demo mode — connect Supabase to enable real accounts.
            </div>
          )}
          <a
            href="https://decade.golf"
            target="_blank"
            rel="noopener"
            className="block rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to DECADE
          </a>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setOpen(false)} />}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen((o) => !o)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <div className="md:hidden"><Logo withText={false} /></div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="max-w-[140px] truncate">{user?.name || user?.email || 'Guest'}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
