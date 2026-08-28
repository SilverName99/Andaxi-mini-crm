import { cn } from '../lib/cn';
import { formatMinutes } from '../lib/format';

/**
 * Cat a mai ramas din orele platite prin abonament. Rezervorul se consuma o
 * singura data: orele puse pe abonamentul asta scad din el, cele din afara
 * programului dublu.
 */
export function OreAbonament({
  paidHours,
  remainingMinutes,
  className,
}: {
  paidHours: number;
  remainingMinutes?: number;
  className?: string;
}) {
  if (!paidHours || paidHours <= 0) return null;

  const total = Math.round(paidHours * 60);
  const ramase = Math.max(0, Math.min(total, remainingMinutes ?? total));
  const folosite = total - ramase;
  const procent = total > 0 ? Math.round((folosite / total) * 100) : 0;
  const epuizat = ramase === 0;

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Ore plătite prin abonament
        </span>
        <span className={cn('text-sm font-bold', epuizat ? 'text-slate-400' : 'text-emerald-600')}>
          {epuizat ? 'consumate integral' : `${formatMinutes(ramase)} rămase`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full transition-all', epuizat ? 'bg-slate-300' : 'bg-emerald-500')}
          style={{ width: `${procent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {formatMinutes(folosite)} folosite din {paidHours} h
      </p>
    </div>
  );
}
