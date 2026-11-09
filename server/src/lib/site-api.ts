/**
 * Preluarea automata a licentei de catre un site CMS (GET /api/site/licenta).
 *
 * Fiecare site are o cheie a lui, `<id site>.<43 de caractere base64url>` (32 de
 * octeti aleatori). Cheia se arata o singura data, la generare; in baza ramane doar
 * SHA-256 al ei (o cheie cu 256 de biti aleatori nu are nevoie de bcrypt). Site-ul o
 * pune in `.env` ca LICENTA_CHEIE si o trimite ca `Authorization: Bearer <cheie>`.
 *
 * Cheia nu e ancora de incredere: licenta e semnata Ed25519 si site-ul verifica
 * semnatura. O cheie furata lasa pe cineva doar sa citeasca licenta acelui site
 * (care nici nu e secreta). Cheia nu se scrie niciodata in jurnal.
 */
import crypto from 'node:crypto';

const FORMA_CHEIE = /^([a-z0-9]{8,40})\.([A-Za-z0-9_-]{43})$/;

/** O cheie noua pentru site; `hash` intra in baza, `cheie` se arata o data. */
export function genereazaCheieSite(siteId: string): { cheie: string; hash: string } {
  const cheie = `${siteId}.${crypto.randomBytes(32).toString('base64url')}`;
  return { cheie, hash: hashCheie(cheie) };
}

export function hashCheie(cheie: string): string {
  return crypto.createHash('sha256').update(cheie, 'utf8').digest('hex');
}

/** Cheia din antetul Authorization (Bearer), desfacuta; null daca nu are forma. */
export function citesteCheie(antet: string | undefined): { siteId: string; cheie: string } | null {
  if (!antet) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(antet);
  if (!m) return null;
  const forma = FORMA_CHEIE.exec(m[1]);
  if (!forma) return null;
  return { siteId: forma[1], cheie: m[1] };
}

/** Hash-ul unui site fara cheie: comparatia se face oricum, ca timpul sa nu spuna nimic. */
const HASH_GOL = hashCheie('fara-cheie');

/**
 * Cheia se potriveste cu hash-ul din baza? Comparatie in timp constant, si cand
 * site-ul nu exista sau n-are cheie (atunci se compara cu un hash fix si iese false).
 */
export function cheiaSePotriveste(cheie: string, hashSalvat: string | null | undefined): boolean {
  const asteptat = hashSalvat && /^[0-9a-f]{64}$/.test(hashSalvat) ? hashSalvat : HASH_GOL;
  const egal = crypto.timingSafeEqual(Buffer.from(hashCheie(cheie), 'hex'), Buffer.from(asteptat, 'hex'));
  return egal && asteptat !== HASH_GOL;
}

export interface Fereastra {
  /** Inregistreaza o cerere; intoarce cate secunde mai are de asteptat (0 = are voie). */
  cerere(cheie: string, acum?: number): number;
  /** Doar numara (fara sa adauge o cerere): cate secunde mai are de asteptat. */
  asteptare(cheie: string, acum?: number): number;
  reset(): void;
}

/**
 * Limitare simpla, pe fereastra fixa: cel mult `max` cereri in `fereastraMs` pentru
 * aceeasi cheie (IP-ul, de exemplu). Tine minte doar cheile din fereastra curenta.
 */
export function creeazaFereastra(max: number, fereastraMs: number): Fereastra {
  const stari = new Map<string, { numar: number; din: number }>();
  const curata = (acum: number) => {
    if (stari.size < 10_000) return;
    for (const [k, s] of stari) if (acum - s.din >= fereastraMs) stari.delete(k);
  };
  const stare = (cheie: string, acum: number) => {
    const s = stari.get(cheie);
    if (!s || acum - s.din >= fereastraMs) return { numar: 0, din: acum };
    return s;
  };
  return {
    cerere(cheie, acum = Date.now()) {
      curata(acum);
      const s = stare(cheie, acum);
      if (s.numar >= max) return Math.max(1, Math.ceil((s.din + fereastraMs - acum) / 1000));
      stari.set(cheie, { numar: s.numar + 1, din: s.din });
      return 0;
    },
    asteptare(cheie, acum = Date.now()) {
      const s = stare(cheie, acum);
      return s.numar >= max ? Math.max(1, Math.ceil((s.din + fereastraMs - acum) / 1000)) : 0;
    },
    reset() {
      stari.clear();
    },
  };
}

/**
 * IP-ul clientului: in productie Node sta in spatele nginx (127.0.0.1), care pune
 * X-Real-IP. Antetul se crede doar cand cererea vine chiar de pe masina (proxy-ul);
 * altfel conteaza adresa conexiunii.
 */
export function ipClient(adresaConexiune: string | undefined, xRealIp: string | string[] | undefined): string {
  const adresa = (adresaConexiune ?? '').replace(/^::ffff:/, '');
  const local = adresa === '127.0.0.1' || adresa === '::1';
  const antet = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
  if (local && antet && /^[0-9a-fA-F:.]{2,45}$/.test(antet.trim())) return antet.trim();
  return adresa || 'necunoscut';
}

/** Pluginurile (doar cele care nu sunt oprite) in forma canonica, pentru comparatie. */
export function pluginuriCanonice(plugins: Record<string, string>): string {
  return JSON.stringify(
    Object.entries(plugins)
      .filter(([, stare]) => stare !== 'oprit')
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}
