import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';

export default function Login() {
  const { signIn, signUp, demo } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'in') await signIn(email, password);
      else await signUp(name, email, password);
      navigate('/app');
    } catch (e: any) {
      setErr(e.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="topo-bg grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center"><Logo /></div>
          <h1 className="font-display text-3xl font-bold tracking-wide">SMARTER GOLF STARTS HERE</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Professional course analysis — map every hole, center your dispersion, and play the percentages.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
            {(['in', 'up'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setErr(''); }}
                className={`rounded px-3 py-1.5 text-sm font-semibold transition-colors ${
                  mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {m === 'in' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'up' && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'in' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" onClick={() => { signIn('decade@demo.golf', ''); navigate('/app'); }}>
            Continue with DECADE
          </Button>

          {demo && (
            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              Demo mode — any email signs you in. Configure Supabase for real accounts.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
