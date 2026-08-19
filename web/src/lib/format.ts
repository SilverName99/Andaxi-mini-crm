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

/**
 * Paleta de accent a clientilor — toate nuantele sunt din familia calda
 * (portocaliu/chihlimbar/teracota), ca interfata sa ramana unitara.
 * Cheile sunt identificatorii salvati in baza de date; le pastram neschimbate
 * ca fisele existente sa nu-si piarda culoarea. Clasele sunt scrise complet,
 * altfel Tailwind le-ar elimina la build.
 */
export const ACCENT: Record<AccentColor, { chip: string; gradient: string; ring: string; dot: string }> = {
  violet:  { chip: 'bg-orange-100 text-orange-700', gradient: 'from-orange-500 to-amber-500',  ring: 'ring-orange-200', dot: 'bg-orange-500' },
  blue:    { chip: 'bg-amber-100 text-amber-700',   gradient: 'from-amber-500 to-yellow-500',  ring: 'ring-amber-200',  dot: 'bg-amber-500' },
  emerald: { chip: 'bg-orange-100 text-orange-800', gradient: 'from-orange-600 to-red-500',    ring: 'ring-orange-200', dot: 'bg-orange-600' },
  amber:   { chip: 'bg-amber-100 text-amber-800',   gradient: 'from-amber-400 to-orange-400',  ring: 'ring-amber-200',  dot: 'bg-amber-400' },
  rose:    { chip: 'bg-red-100 text-red-700',       gradient: 'from-red-500 to-orange-500',    ring: 'ring-red-200',    dot: 'bg-red-500' },
  cyan:    { chip: 'bg-yellow-100 text-yellow-800', gradient: 'from-yellow-500 to-amber-500',  ring: 'ring-yellow-200', dot: 'bg-yellow-500' },
  fuchsia: { chip: 'bg-orange-200 text-orange-900', gradient: 'from-orange-700 to-amber-600',  ring: 'ring-orange-300', dot: 'bg-orange-700' },
  lime:    { chip: 'bg-stone-200 text-stone-700',   gradient: 'from-stone-500 to-stone-700',   ring: 'ring-stone-300',  dot: 'bg-stone-500' },
};

export const ACCENT_COLORS: AccentColor[] = ['violet', 'blue', 'emerald', 'amber', 'rose', 'cyan', 'fuchsia', 'lime'];
