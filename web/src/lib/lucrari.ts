import { PRODUCT } from './labels';
import type { Subscription } from './types';

/**
 * O intervenție poate intra pe mai multe lucrări. Le ținem în același câmp,
 * despărțite prin linie nouă — separator care nu apare în denumirile
 * abonamentelor, scrise mereu pe un singur rând.
 */
export function etichete(valoare: string | null | undefined): string[] {
  return (valoare ?? '')
    .split('\n')
    .map((e) => e.trim())
    .filter(Boolean);
}

/** Forma în care se salvează: fără duplicate, fără spații de prisos */
export function laEticheta(lista: string[]): string {
  return [...new Set(lista.map((e) => e.trim()).filter(Boolean))].join('\n');
}

/** Numele sub care apare un abonament in campul "Lucrare / proiect" */
export function numeAbonament(sub: Subscription): string {
  return (sub.label || PRODUCT[sub.product]?.text || '').trim();
}

/**
 * Optiunile campului "Lucrare / proiect": abonamentele clientului, in ordinea
 * activ -> suspendat -> anulat. Etichetele scrise cu mana inainte (si valoarea
 * salvata acum pe intervenție) raman in lista, ca sa nu se piarda istoricul.
 */
export function optiuniLucrare(
  abonamente: Subscription[] = [],
  etichetele: string[] = [],
  valoareCurenta = '',
): { value: string; label: string }[] {
  const ordine: Record<string, number> = { ACTIVE: 0, PAUSED: 1, CANCELLED: 2 };
  const optiuni = [{ value: '', label: '— fără lucrare —' }];
  const vazute = new Set(['']);

  const sortate = [...abonamente].sort(
    (a, b) => (ordine[a.status] ?? 3) - (ordine[b.status] ?? 3) || numeAbonament(a).localeCompare(numeAbonament(b), 'ro'),
  );

  for (const sub of sortate) {
    const nume = numeAbonament(sub);
    if (!nume || vazute.has(nume)) continue;
    vazute.add(nume);
    optiuni.push({
      value: nume,
      label: sub.status === 'ACTIVE' ? nume : `${nume} (${sub.status === 'PAUSED' ? 'suspendat' : 'anulat'})`,
    });
  }

  for (const eticheta of [...etichetele, ...etichete(valoareCurenta)]) {
    const nume = (eticheta ?? '').trim();
    if (!nume || vazute.has(nume)) continue;
    vazute.add(nume);
    optiuni.push({ value: nume, label: `${nume} (etichetă veche)` });
  }

  return optiuni;
}
