import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn';
import { todayIso } from '../lib/format';

const LUNI = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
];
const ZILE = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];
/** inaltimea aproximativa a calendarului, folosita ca sa decidem in ce parte se deschide */
const CALENDAR_H = 350;

/** "2026-08-19" → "19.08.2026" */
function isoToRo(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** "19.08.2026", "19/8/2026" sau "19082026" → "2026-08-19" (sau null daca data nu exista) */
function roToIso(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  let d: number, m: number, y: number;
  if (digits.length === 8) {
    d = Number(digits.slice(0, 2));
    m = Number(digits.slice(2, 4));
    y = Number(digits.slice(4));
  } else {
    const parts = text.split(/[^\d]+/).filter(Boolean);
    if (parts.length !== 3) return null;
    [d, m, y] = parts.map(Number);
  }
  if (!y || y < 1900 || y > 2999 || !m || m < 1 || m > 12 || !d || d < 1) return null;
  const zileInLuna = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > zileInLuna) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Adauga punctele pe masura ce se scrie: "1908" → "19.08" */
function autoFormat(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join('.');
}

function gridLuni(anchorIso: string): (string | null)[] {
  const [y, m] = anchorIso.split('-').map(Number);
  const prima = new Date(Date.UTC(y, m - 1, 1));
  const zile = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // getUTCDay(): 0 = duminica; noi vrem saptamana care incepe luni
  const offset = (prima.getUTCDay() + 6) % 7;
  const celule: (string | null)[] = Array(offset).fill(null);
  for (let zi = 1; zi <= zile; zi += 1) {
    celule.push(`${y}-${String(m).padStart(2, '0')}-${String(zi).padStart(2, '0')}`);
  }
  return celule;
}

function schimbaLuna(anchorIso: string, delta: number): string {
  const [y, m] = anchorIso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Camp de data in format romanesc (zi.luna.an), cu calendar propriu.
 * Nu foloseste <input type="date"> pentru ca acela isi ia formatul si prima zi
 * a saptamanii din limba browserului (in engleza iese luna/zi/an, cu duminica prima).
 * Valoarea transmisa mai departe ramane ISO ("2026-08-19").
 */
export function DateField({
  value,
  onChange,
  placeholder = 'zz.ll.aaaa',
  className,
  allowEmpty = true,
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  className?: string;
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(() => isoToRo(value));
  const [open, setOpen] = useState(false);
  // calendarul se deschide in sus daca nu are loc dedesubt (ex. ultimul camp dintr-un dialog)
  const [inSus, setInSus] = useState(false);
  const [anchor, setAnchor] = useState(() => `${(value || todayIso()).slice(0, 7)}-01`);
  const wrapper = useRef<HTMLDivElement>(null);

  // sincronizam cu valoarea din exterior (ex. resetarea formularului)
  useEffect(() => {
    setText(isoToRo(value));
    if (value) setAnchor(`${value.slice(0, 7)}-01`);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const rect = wrapper.current?.getBoundingClientRect();
    if (rect) setInSus(window.innerHeight - rect.bottom < CALENDAR_H && rect.top > CALENDAR_H);
    const laClick = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    // ascultam in faza de capturare si oprim propagarea, altfel Escape ar inchide
    // si dialogul in care se afla campul, nu doar calendarul
    const laTasta = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', laClick);
    document.addEventListener('keydown', laTasta, true);
    return () => {
      document.removeEventListener('mousedown', laClick);
      document.removeEventListener('keydown', laTasta, true);
    };
  }, [open]);

  const celule = useMemo(() => gridLuni(anchor), [anchor]);
  const azi = todayIso();
  const [anchorY, anchorM] = anchor.split('-').map(Number);

  function scrie(brut: string) {
    const formatat = autoFormat(brut);
    setText(formatat);
    if (!formatat && allowEmpty) {
      onChange('');
      return;
    }
    const iso = roToIso(formatat);
    if (iso) onChange(iso);
  }

  function laIesire() {
    if (!text) {
      if (allowEmpty) onChange('');
      else setText(isoToRo(value));
      return;
    }
    const iso = roToIso(text);
    if (iso) {
      onChange(iso);
      setText(isoToRo(iso));
    } else {
      setText(isoToRo(value)); // text invalid → revenim la ultima valoare buna
    }
  }

  return (
    <div ref={wrapper} className={cn('relative', className)}>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => scrie(e.target.value)}
        onBlur={laIesire}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="input-base pr-11"
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xl p-2 text-stone-400 transition hover:bg-orange-50 hover:text-orange-600"
        aria-label="Deschide calendarul"
      >
        <Calendar className="h-4 w-4" />
      </button>

      {open && (
        <div
          className={cn(
            'animate-fade-up absolute z-30 w-72 rounded-3xl border border-stone-200 bg-white p-3 shadow-soft',
            inSus ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setAnchor(schimbaLuna(anchor, -1))}
              className="rounded-xl p-1.5 text-stone-500 transition hover:bg-stone-100"
              aria-label="Luna anterioară"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold capitalize text-stone-800">
              {LUNI[anchorM - 1]} {anchorY}
            </span>
            <button
              type="button"
              onClick={() => setAnchor(schimbaLuna(anchor, 1))}
              className="rounded-xl p-1.5 text-stone-500 transition hover:bg-stone-100"
              aria-label="Luna următoare"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {ZILE.map((zi) => (
              <span key={zi} className="py-1 text-[11px] font-semibold uppercase text-stone-400">
                {zi}
              </span>
            ))}
            {celule.map((iso, index) => {
              if (!iso) return <span key={`gol-${index}`} />;
              const selectat = iso === value;
              const esteAzi = iso === azi;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    onChange(iso);
                    setText(isoToRo(iso));
                    setOpen(false);
                  }}
                  className={cn(
                    'rounded-xl py-1.5 text-sm font-medium transition',
                    selectat
                      ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-glow'
                      : esteAzi
                        ? 'bg-orange-50 font-bold text-orange-700'
                        : 'text-stone-700 hover:bg-stone-100',
                  )}
                >
                  {Number(iso.slice(8))}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex justify-between border-t border-stone-100 pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(azi);
                setText(isoToRo(azi));
                setAnchor(`${azi.slice(0, 7)}-01`);
                setOpen(false);
              }}
              className="rounded-xl px-2.5 py-1 text-xs font-semibold text-orange-600 transition hover:bg-orange-50"
            >
              Azi
            </button>
            {allowEmpty && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setText('');
                  setOpen(false);
                }}
                className="rounded-xl px-2.5 py-1 text-xs font-semibold text-stone-400 transition hover:bg-stone-100"
              >
                Șterge
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
