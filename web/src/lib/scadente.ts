import { CYCLE } from './labels';
import type { Cycle } from './types';

/** Aceeași zi, peste `luni` luni; dacă luna nouă e mai scurtă, ultima ei zi */
export function adaugaLuni(iso: string, luni: number): string {
  const [an, luna, zi] = iso.split('-').map(Number);
  const total = an * 12 + (luna - 1) + luni;
  const anNou = Math.floor(total / 12);
  const lunaNoua = (total % 12) + 1;
  const ultimaZi = new Date(Date.UTC(anNou, lunaNoua, 0)).getUTCDate();
  return `${anNou}-${String(lunaNoua).padStart(2, '0')}-${String(Math.min(zi, ultimaZi)).padStart(2, '0')}`;
}

export interface ScadentaViitoare {
  id: string;
  label: string;
  dueDate: string;
  amountEur: number | null;
}

interface AbonamentScadent {
  id: string;
  label: string;
  cycle: string;
  status: string;
  nextDueDate: string;
  endDate?: string | null;
  amountEur: number | null;
}

/**
 * Reînnoirile care încă n-au poziție în scadențar: scadențarul generează
 * pozițiile doar cu două luni înainte, dar clientul vrea să vadă din timp când
 * urmează să plătească. Le calculăm din ciclul abonamentului, pornind de la
 * următoarea scadență, și le arătăm ca previziune — nu se salvează nimic.
 */
export function scadenteViitoare(abonamente: AbonamentScadent[], luna: string): ScadentaViitoare[] {
  const rezultat: ScadentaViitoare[] = [];

  for (const sub of abonamente) {
    if (sub.status !== 'ACTIVE') continue;
    const pas = CYCLE[sub.cycle as Cycle]?.months ?? 1;
    let scadenta = sub.nextDueDate;

    // ne oprim cand am depasit luna ceruta; limita e doar o plasa de siguranta
    for (let i = 0; i < 400 && scadenta.slice(0, 7) <= luna; i += 1) {
      if (sub.endDate && scadenta > sub.endDate) break;
      if (scadenta.startsWith(luna)) {
        rezultat.push({ id: `viitor-${sub.id}-${scadenta}`, label: sub.label, dueDate: scadenta, amountEur: sub.amountEur });
      }
      scadenta = adaugaLuni(scadenta, pas);
    }
  }

  return rezultat.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
