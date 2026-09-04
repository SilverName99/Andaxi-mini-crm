/**
 * Campul "Lucrare / proiect" poate tine mai multe lucrari deodata. Le pastram
 * in aceeasi coloana, despartite prin linie noua — un separator care nu apare
 * in denumirile abonamentelor, scrise mereu pe un singur rand.
 */
export function etichete(valoare: string | null | undefined): string[] {
  return (valoare ?? '')
    .split('\n')
    .map((e) => e.trim())
    .filter(Boolean);
}

/** Forma in care se salveaza: fara duplicate, fara spatii de prisos */
export function laEticheta(lista: string[]): string {
  return [...new Set(lista.map((e) => e.trim()).filter(Boolean))].join('\n');
}

/** Interventia are lucrarea ceruta printre etichetele ei? */
export function areEticheta(valoare: string | null | undefined, cautata: string): boolean {
  return etichete(valoare).includes(cautata.trim());
}
