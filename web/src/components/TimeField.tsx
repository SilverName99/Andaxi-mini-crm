import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '../lib/cn';

/** Normalizeaza ce se tasteaza catre "HH:MM": "930" → "09:30", "2100" → "21:00" */
function autoFormat(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function esteValid(text: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!m) return false;
  const ore = Number(m[1]);
  const minute = Number(m[2]);
  return ore >= 0 && ore <= 23 && minute >= 0 && minute <= 59;
}

function normalizeaza(text: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text)!;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/**
 * Camp de ora in format 24h. Nu foloseste <input type="time"> pentru ca acela
 * afiseaza AM/PM cand browserul e pe engleza.
 */
export function TimeField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(value);

  useEffect(() => setText(value), [value]);

  return (
    <div className={cn('relative', className)}>
      <Clock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        inputMode="numeric"
        value={text}
        placeholder="hh:mm"
        onChange={(e) => {
          const formatat = autoFormat(e.target.value);
          setText(formatat);
          if (esteValid(formatat)) onChange(normalizeaza(formatat));
        }}
        onBlur={() => {
          if (esteValid(text)) {
            const normalizat = normalizeaza(text);
            setText(normalizat);
            onChange(normalizat);
          } else {
            setText(value); // text invalid → revenim la ultima ora buna
          }
        }}
        className="input-base pl-10"
      />
    </div>
  );
}
