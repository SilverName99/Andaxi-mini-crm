import type { AccentColor } from './types';

const MONTHS_RO = [
  'ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.',
  'iul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.',
];

/** "2026-03-04" -> "4 mar. 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_RO[m - 1]} ${y}`;
}

/** "2026-03" -> "mar. 2026" */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_RO[m - 1]} ${y}`;
}

export function formatEur(value: number): string {
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function formatRon(valueEur: number, rate: number): string {
  return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 }).format(
    valueEur * rate,
  );
}

/** 150 -> "2h 30m" */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatHours(minutes: number): string {
  return `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)} h`;
}

/** 570 -> "09:30" */
export function minutesToHhMm(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function startOfMonthIso(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Clase Tailwind pentru fiecare culoare de accent (scrise complet, ca sa nu fie eliminate la build) */
export const ACCENT: Record<AccentColor, { chip: string; gradient: string; ring: string; dot: string }> = {
  violet: { chip: 'bg-violet-100 text-violet-700', gradient: 'from-violet-500 to-fuchsia-500', ring: 'ring-violet-200', dot: 'bg-violet-500' },
  blue: { chip: 'bg-blue-100 text-blue-700', gradient: 'from-blue-500 to-indigo-500', ring: 'ring-blue-200', dot: 'bg-blue-500' },
  emerald: { chip: 'bg-emerald-100 text-emerald-700', gradient: 'from-emerald-500 to-teal-500', ring: 'ring-emerald-200', dot: 'bg-emerald-500' },
  amber: { chip: 'bg-amber-100 text-amber-700', gradient: 'from-amber-500 to-orange-500', ring: 'ring-amber-200', dot: 'bg-amber-500' },
  rose: { chip: 'bg-rose-100 text-rose-700', gradient: 'from-rose-500 to-pink-500', ring: 'ring-rose-200', dot: 'bg-rose-500' },
  cyan: { chip: 'bg-cyan-100 text-cyan-700', gradient: 'from-cyan-500 to-sky-500', ring: 'ring-cyan-200', dot: 'bg-cyan-500' },
  fuchsia: { chip: 'bg-fuchsia-100 text-fuchsia-700', gradient: 'from-fuchsia-500 to-purple-500', ring: 'ring-fuchsia-200', dot: 'bg-fuchsia-500' },
  lime: { chip: 'bg-lime-100 text-lime-700', gradient: 'from-lime-500 to-green-500', ring: 'ring-lime-200', dot: 'bg-lime-500' },
};

export const ACCENT_COLORS: AccentColor[] = ['violet', 'blue', 'emerald', 'amber', 'rose', 'cyan', 'fuchsia', 'lime'];
