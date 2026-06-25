import { Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useTheme } from '@/components/theme-provider';
import { isMapboxConfigured } from '@/lib/mapbox';
import { isSupabaseConfigured } from '@/lib/supabase';

function StatusRow({ label, ok, hint }: { label: string; ok: boolean; hint: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 last:border-0">
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <span className={`flex items-center gap-1.5 text-sm font-semibold ${ok ? 'text-primary' : 'text-muted-foreground'}`}>
        {ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
        {ok ? 'Configured' : 'Not set'}
      </span>
    </div>
  );
}

export default function Settings() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide">Settings</h1>
        <p className="text-muted-foreground">Appearance and integration status.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Appearance</CardTitle><CardDescription>Theme preference.</CardDescription></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {(['dark', 'light', 'system'] as const).map((t) => (
              <button key={t} onClick={() => setTheme(t)}
                className={`rounded-md border px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  theme === t ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Integrations</CardTitle><CardDescription>Set these as environment variables (Vercel project settings or local .env).</CardDescription></CardHeader>
        <CardContent>
          <StatusRow label="Mapbox GL" ok={isMapboxConfigured} hint="VITE_MAPBOX_TOKEN — 3D course maps" />
          <StatusRow label="Supabase" ok={isSupabaseConfigured} hint="VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY — accounts & data" />
        </CardContent>
      </Card>
    </div>
  );
}
