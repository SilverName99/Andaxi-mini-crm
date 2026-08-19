/** Utilitare pentru grila lunara a calendarului (saptamana incepe luni) */

export const LUNI_RO = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
];

export const ZILE_SCURTE = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];

export function isoDin(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "2026-08" -> prima zi a lunii */
export function inceputLuna(luna: string): string {
  return `${luna}-01`;
}

export function schimbaLuna(luna: string, delta: number): string {
  const [y, m] = luna.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function numeLuna(luna: string): string {
  const [y, m] = luna.split('-').map(Number);
  return `${LUNI_RO[m - 1]} ${y}`;
}

/**
 * Cele 42 de zile afisate pentru o luna (6 saptamani complete), ca grila sa nu
 * isi schimbe inaltimea de la o luna la alta.
 */
export function grilaLunii(luna: string): { iso: string; inLuna: boolean; weekend: boolean }[] {
  const [y, m] = luna.split('-').map(Number);
  const prima = new Date(Date.UTC(y, m - 1, 1));
  const offset = (prima.getUTCDay() + 6) % 7; // 0 = luni
  const start = new Date(Date.UTC(y, m - 1, 1 - offset));

  return Array.from({ length: 42 }, (_, index) => {
    const zi = new Date(start);
    zi.setUTCDate(start.getUTCDate() + index);
    const zsapt = (zi.getUTCDay() + 6) % 7;
    return {
      iso: zi.toISOString().slice(0, 10),
      inLuna: zi.getUTCMonth() === m - 1 && zi.getUTCFullYear() === y,
      weekend: zsapt >= 5,
    };
  });
}

/** Ziua din saptamana in cuvinte, pentru panoul cu detalii */
export function numeZi(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const zi = new Date(Date.UTC(y, m - 1, d));
  return ZILE_SCURTE[(zi.getUTCDay() + 6) % 7];
}
