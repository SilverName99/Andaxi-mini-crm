import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn';

/** Rândul de paginare de sub o listă lungă */
export function Paginare({
  pagina,
  pagini,
  total,
  numeElemente,
  onSchimba,
  className,
}: {
  /** Pagina curentă, de la 1 */
  pagina: number;
  pagini: number;
  total: number;
  /** Cum se numesc elementele la plural, ex. „intervenții" */
  numeElemente: string;
  onSchimba: (pagina: number) => void;
  className?: string;
}) {
  if (pagini <= 1) return null;

  // arătăm cel mult 5 numere în jurul paginii curente
  const prima = Math.max(1, Math.min(pagina - 2, pagini - 4));
  const numere = Array.from({ length: Math.min(5, pagini) }, (_, i) => prima + i).filter((n) => n <= pagini);

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-xs text-slate-400">
        Pagina {pagina} din {pagini} · {total} {numeElemente}
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onSchimba(pagina - 1)}
          disabled={pagina <= 1}
          aria-label="Pagina anterioară"
          className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {numere.map((numar) => (
          <button
            key={numar}
            onClick={() => onSchimba(numar)}
            aria-current={numar === pagina ? 'page' : undefined}
            className={cn(
              'h-9 min-w-[2.25rem] rounded-xl px-2 text-sm font-semibold transition',
              numar === pagina
                ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-glow'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {numar}
          </button>
        ))}

        <button
          onClick={() => onSchimba(pagina + 1)}
          disabled={pagina >= pagini}
          aria-label="Pagina următoare"
          className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
