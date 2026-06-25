import { cn } from '@/lib/utils';

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="7" className="fill-card" />
        <g fill="none" stroke="hsl(159 88% 45%)" strokeWidth="1.5">
          <circle cx="16" cy="16" r="3.5" />
          <circle cx="16" cy="16" r="7" />
          <circle cx="16" cy="16" r="10.5" />
        </g>
      </svg>
      {withText && (
        <div className="leading-none">
          <div className="font-display text-lg font-bold tracking-wider">CADD-AI</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Course Analysis</div>
        </div>
      )}
    </div>
  );
}
