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
  /** Cate chei tine minte acum (pentru teste). */
  marime(): number;
}

/**
 * Limitare simpla, pe fereastra fixa: cel mult `max` cereri in `fereastraMs` pentru
 * aceeasi cheie (IP-ul sau site-ul). Harta se curata de cheile expirate cel mult o
 * data pe fereastra si nu trece niciodata de `maxChei`: plina fiind, cea mai veche
 * intrare iese (Map pastreaza ordinea inserarii), deci memoria ramane marginita
 * oricate adrese ar folosi cineva.
 */
export function creeazaFereastra(max: number, fereastraMs: number, maxChei = 10_000): Fereastra {
  const stari = new Map<string, { numar: number; din: number }>();
  let ultimaCuratare = 0;
  const curata = (acum: number) => {
    if (acum - ultimaCuratare < fereastraMs) return;
    ultimaCuratare = acum;
    for (const [k, s] of stari) if (acum - s.din >= fereastraMs) stari.delete(k);
  };
  const stare = (cheie: string, acum: number) => {
    const s = stari.get(cheie);
    if (!s || acum - s.din >= fereastraMs) return { numar: 0, din: acum };
    return s;
  };
  const asteapta = (s: { din: number }, acum: number) => Math.max(1, Math.ceil((s.din + fereastraMs - acum) / 1000));
  return {
    cerere(cheie, acum = Date.now()) {
      curata(acum);
      const s = stare(cheie, acum);
      if (s.numar >= max) return asteapta(s, acum);
      if (!stari.has(cheie)) {
        while (stari.size >= maxChei) stari.delete(stari.keys().next().value as string);
      }
      stari.set(cheie, { numar: s.numar + 1, din: s.din });
      return 0;
    },
    asteptare(cheie, acum = Date.now()) {
      const s = stare(cheie, acum);
      return s.numar >= max ? asteapta(s, acum) : 0;
    },
    reset() {
      stari.clear();
      ultimaCuratare = 0;
    },
    marime() {
      return stari.size;
    },
  };
}

/** Cele 8 grupuri de 16 biti ale unei adrese IPv6 (cu „::" si cu IPv4 la coada), sau null. */
function grupuriIpv6(adresa: string): number[] | null {
  let text = adresa.toLowerCase().replace(/%.*$/, '');
  const ipv4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (ipv4) {
    const o = ipv4.slice(1).map(Number);
    if (o.some((x) => x > 255)) return null;
    text = `${text.slice(0, ipv4.index)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const parti = text.split('::');
  if (parti.length > 2) return null;
  const stanga = parti[0] ? parti[0].split(':') : [];
  const dreapta = parti.length === 2 && parti[1] ? parti[1].split(':') : [];
  const lipsa = 8 - stanga.length - dreapta.length;
  if (parti.length === 1 ? lipsa !== 0 : lipsa < 1) return null;
  const toate = [...stanga, ...Array(parti.length === 2 ? lipsa : 0).fill('0'), ...dreapta];
  if (toate.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return toate.map((g) => parseInt(g, 16));
}

/**
 * Cheia de limitare a unui IP: IPv4 intreg; IPv6 dupa prefixul /64 (o singura retea
 * de client are de obicei un /64 intreg, deci altfel fiecare adresa ar avea limita ei).
 */
export function cheieIp(ip: string): string {
  if (!ip.includes(':')) return ip;
  const grupuri = grupuriIpv6(ip);
  if (!grupuri) return ip;
  return `${grupuri.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;
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
