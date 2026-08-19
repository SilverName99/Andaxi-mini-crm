/**
 * Utilitare pentru date in format "YYYY-MM-DD".
 * Lucram cu string-uri si UTC ca sa evitam complet problemele de fus orar:
 * o zi de lucru inregistrata pe 3 martie ramane 3 martie oriunde ar rula serverul.
 */

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = parseIso(value);
  return toIso(d) === value;
}

export function parseIso(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function today(now: Date = new Date()): string {
  return toIso(now);
}

export function addDays(value: string, days: number): string {
  const d = parseIso(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/**
 * Adauga luni pastrand ziua din luna, cu "clamp" la ultima zi a lunii tinta:
 * 2025-01-31 + 1 luna = 2025-02-28 (nu 2025-03-03).
 */
export function addMonths(value: string, months: number): string {
  const d = parseIso(value);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toIso(target);
}

export function diffDays(from: string, to: string): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000);
}

/** 0 = duminica ... 6 = sambata */
export function weekday(value: string): number {
  return parseIso(value).getUTCDay();
}

export function isWeekend(value: string): boolean {
  const day = weekday(value);
  return day === 0 || day === 6;
}

/** Prima zi a lunii, ex. "2025-03-17" -> "2025-03-01" */
export function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export function endOfMonth(value: string): string {
  const d = parseIso(value);
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** Lista de luni "YYYY-MM", de la cea mai veche la cea mai noua, inclusiv capetele */
export function monthRange(fromIso: string, toIso_: string): string[] {
  const out: string[] = [];
  let cursor = startOfMonth(fromIso);
  const end = startOfMonth(toIso_);
  while (cursor <= end) {
    out.push(cursor.slice(0, 7));
    cursor = addMonths(cursor, 1);
  }
  return out;
}

/** "540" -> "09:00" */
export function minutesToHhMm(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "09:30" -> 570; arunca eroare daca formatul e invalid */
export function hhMmToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Ora invalida: "${value}" (format asteptat HH:MM)`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59 || (h === 24 && m > 0)) throw new Error(`Ora invalida: "${value}"`);
  return h * 60 + m;
}
