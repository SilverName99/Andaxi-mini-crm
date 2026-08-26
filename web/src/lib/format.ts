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

/** "2026-03-04T18:05:00.000Z" -> "4 mar. 2026, 20:05" (ora locala, 24h) */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  const ora = `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`;
  return `${data.getDate()} ${MONTHS_RO[data.getMonth()]} ${data.getFullYear()}, ${ora}`;
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
 * Paleta de accent a clientilor — nuante reci, din aceeasi familie cu interfata
 * (indigo/violet/albastru), ca fisele sa se distinga fara sa strige.
 * Cheile sunt identificatorii salvati in baza de date; le pastram neschimbate
 * ca fisele existente sa nu-si piarda culoarea. Clasele sunt scrise complet,
 * altfel Tailwind le-ar elimina la build.
 */
export const ACCENT: Record<AccentColor, { chip: string; gradient: string; ring: string; dot: string }> = {
  violet:  { chip: 'bg-indigo-100 text-indigo-700',   gradient: 'from-indigo-500 to-violet-500',  ring: 'ring-indigo-200',  dot: 'bg-indigo-500' },
  blue:    { chip: 'bg-blue-100 text-blue-700',       gradient: 'from-blue-500 to-indigo-500',    ring: 'ring-blue-200',    dot: 'bg-blue-500' },
  emerald: { chip: 'bg-sky-100 text-sky-700',         gradient: 'from-sky-500 to-blue-500',       ring: 'ring-sky-200',     dot: 'bg-sky-500' },
  amber:   { chip: 'bg-violet-100 text-violet-700',   gradient: 'from-violet-500 to-purple-500',  ring: 'ring-violet-200',  dot: 'bg-violet-500' },
  rose:    { chip: 'bg-fuchsia-100 text-fuchsia-700', gradient: 'from-fuchsia-500 to-pink-500',   ring: 'ring-fuchsia-200', dot: 'bg-fuchsia-500' },
  cyan:    { chip: 'bg-cyan-100 text-cyan-700',       gradient: 'from-cyan-500 to-sky-500',       ring: 'ring-cyan-200',    dot: 'bg-cyan-500' },
  fuchsia: { chip: 'bg-purple-100 text-purple-700',   gradient: 'from-purple-600 to-indigo-600',  ring: 'ring-purple-200',  dot: 'bg-purple-600' },
  lime:    { chip: 'bg-slate-200 text-slate-700',     gradient: 'from-slate-500 to-slate-700',    ring: 'ring-slate-300',   dot: 'bg-slate-500' },
};

export const ACCENT_COLORS: AccentColor[] = ['violet', 'blue', 'emerald', 'amber', 'rose', 'cyan', 'fuchsia', 'lime'];

/** 1536 -> "1,5 KB" */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
