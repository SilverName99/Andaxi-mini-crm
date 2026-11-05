/**
 * Licența unui site CMS (andaxi-cms): lista semnată cu starea fiecărui plugin.
 *
 * Formatul și semnătura sunt cele din andaxi-cms `src/Support/Licenta.php`:
 *
 *     {"site":"biovitality","emisa_la":"2026-11-05T21:00:00Z","versiune":1,
 *      "pluginuri":{"catalog":"pornit","magazin":"pornit"},
 *      "semnatura":"<Ed25519, base64>"}
 *
 *  - `site` = LICENTA_SITE din `.env`-ul site-ului (slug-ul); o licență pentru alt
 *    site e respinsă. CMS-ul nu are câmp de domeniu și nici de expirare: legătura
 *    cu site-ul e doar prin `site`;
 *  - `versiune`: întreg ≥ 1; site-ul respinge o licență mai veche decât ultima bună;
 *  - `pluginuri`: doar ce NU e oprit (o cheie lipsă = oprit);
 *  - `redirectionari` (opțional): {"<plugin>": "/cale"} pentru adresele unui plugin oprit;
 *  - semnătura: Ed25519 detașată peste `"andaxi-licenta-v1\n"` + JSON-ul canonic al
 *    tuturor câmpurilor în afară de `semnatura` (chei sortate după octeți UTF-8,
 *    fără spații, fără escape la „/”, la diacritice și la U+2028/U+2029, numerele
 *    doar întregi). Exact `JSON.stringify` cu cheile sortate.
 *
 * Testul `licenta.test.ts` verifică vectorul din docs/PLUGINURI.md al CMS-ului și
 * trece licențele prin codul PHP al CMS-ului însuși.
 */
import crypto, { type KeyObject } from 'node:crypto';

export const PREFIX_SEMNATURA = 'andaxi-licenta-v1\n';
export const STARI = ['pornit', 'se_opreste', 'oprit'] as const;
export type StarePlugin = (typeof STARI)[number];

/** Slug-ul site-ului, ca în CMS (tools/dev/licenta.php: site=<slug>) */
export const SLUG_SITE = /^[a-z0-9][a-z0-9-]{0,40}$/;
/** Calea unei redirecționări: doar în același site, ca în Licenta::verifica */
export const CALE_REDIRECT = /^\/(?!\/)[^\s\\]*$/;

export interface ContinutLicenta {
  site: string;
  emisa_la: string;
  versiune: number;
  pluginuri: Record<string, Exclude<StarePlugin, 'oprit'>>;
  redirectionari?: Record<string, string>;
}

function comparaOcteti(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/** JSON canonic, identic cu Licenta::jsonCanonic din CMS. */
export function jsonCanonic(valoare: unknown): string {
  if (valoare === null || typeof valoare === 'boolean' || typeof valoare === 'string') {
    return JSON.stringify(valoare);
  }
  if (typeof valoare === 'number') {
    if (!Number.isSafeInteger(valoare)) throw new Error('Licența acceptă doar numere întregi.');
    return JSON.stringify(valoare);
  }
  if (Array.isArray(valoare)) {
    return `[${valoare.map((v) => jsonCanonic(v)).join(',')}]`;
  }
  if (typeof valoare === 'object') {
    const chei = Object.keys(valoare as object).sort(comparaOcteti);
    const bucati = chei
      .filter((cheie) => (valoare as Record<string, unknown>)[cheie] !== undefined)
      .map((cheie) => `${JSON.stringify(cheie)}:${jsonCanonic((valoare as Record<string, unknown>)[cheie])}`);
    return `{${bucati.join(',')}}`;
  }
  throw new Error(`Valoare care nu poate intra în licență: ${typeof valoare}`);
}

/** Exact octeții peste care se face semnătura (fără câmpul „semnatura”). */
export function mesajDeSemnat(continut: object): Buffer {
  const { semnatura: _ignorat, ...rest } = continut as Record<string, unknown>;
  return Buffer.from(PREFIX_SEMNATURA + jsonCanonic(rest), 'utf8');
}

/** Data ISO-8601 fără milisecunde, în UTC (ca gmdate('Y-m-d\TH:i:s\Z')) */
export function dataIso(data: Date): string {
  return data.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Conținutul licenței dintr-o listă de stări. Pluginurile oprite nu intră;
 * ordinea pluginurilor urmează `ordine` (catalogul), ca fișierul să se citească ușor.
 */
export function construiesteLicenta(input: {
  site: string;
  versiune: number;
  emisaLa: Date;
  stari: Record<string, StarePlugin>;
  ordine?: string[];
  redirectionari?: Record<string, string>;
}): ContinutLicenta {
  if (!SLUG_SITE.test(input.site)) throw new Error(`Slug de site invalid: „${input.site}”.`);
  if (!Number.isSafeInteger(input.versiune) || input.versiune < 1) {
    throw new Error('Versiunea licenței trebuie să fie un număr întreg pozitiv.');
  }
  const chei = Object.keys(input.stari);
  const ordine = input.ordine ?? [];
  chei.sort((a, b) => {
    const ia = ordine.indexOf(a);
    const ib = ordine.indexOf(b);
    return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib) || comparaOcteti(a, b);
  });

  const pluginuri: ContinutLicenta['pluginuri'] = {};
  for (const cheie of chei) {
    const stare = input.stari[cheie];
    if (!STARI.includes(stare)) throw new Error(`Starea „${stare}” nu există (pornit, se_opreste, oprit).`);
    if (stare !== 'oprit') pluginuri[cheie] = stare;
  }

  const continut: ContinutLicenta = {
    site: input.site,
    emisa_la: dataIso(input.emisaLa),
    versiune: input.versiune,
    pluginuri,
  };
  const redirectionari = Object.entries(input.redirectionari ?? {});
  if (redirectionari.length > 0) {
    continut.redirectionari = {};
    for (const [cheie, cale] of redirectionari) {
      if (!CALE_REDIRECT.test(cale)) throw new Error(`Redirecționarea pentru „${cheie}” trebuie să fie o cale „/…” din site.`);
      continut.redirectionari[cheie] = cale;
    }
  }
  return continut;
}

/**
 * Semnează conținutul și întoarce textul fișierului licenta.json (ca
 * Licenta::semneaza: JSON indentat cu 4 spații, „semnatura” la final, rând nou).
 */
export function semneazaLicenta(continut: ContinutLicenta, cheiePrivata: KeyObject): string {
  const semnatura = crypto.sign(null, mesajDeSemnat(continut), cheiePrivata).toString('base64');
  return `${JSON.stringify({ ...continut, semnatura }, null, 4)}\n`;
}

/** Cheia publică brută (32 de octeți) în base64, forma din LICENTA_CHEIE_PUBLICA. */
export function cheiePublicaBase64(cheie: KeyObject): string {
  const publica = cheie.type === 'private' ? crypto.createPublicKey(cheie) : cheie;
  const jwk = publica.export({ format: 'jwk' });
  if (jwk.crv !== 'Ed25519' || !jwk.x) throw new Error('Cheia nu este Ed25519.');
  return Buffer.from(jwk.x, 'base64url').toString('base64');
}

/** Cheia publică din forma base64 (sau base64url) de 32 de octeți. */
export function cheiePublicaDinBase64(text: string): KeyObject {
  const octeti = Buffer.from(text.trim().replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (octeti.length !== 32) throw new Error('Cheia publică trebuie să aibă 32 de octeți.');
  return crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: octeti.toString('base64url') }, format: 'jwk' });
}

/** Cheia privată dintr-o sămânță de 32 de octeți (pentru teste: vectorul CMS-ului). */
export function cheiePrivataDinSamanta(samanta: Buffer): KeyObject {
  if (samanta.length !== 32) throw new Error('Sămânța trebuie să aibă 32 de octeți.');
  const prefixPkcs8 = Buffer.from('302e020100300506032b657004220420', 'hex');
  return crypto.createPrivateKey({ key: Buffer.concat([prefixPkcs8, samanta]), format: 'der', type: 'pkcs8' });
}

/**
 * Forma de 64 de octeți (sămânță + cheie publică) pe care o folosește sodium în PHP
 * (`sodium_crypto_sign_secretkey`). Doar pentru testul de interoperabilitate.
 */
export function cheiePrivataSodium(cheie: KeyObject): Buffer {
  const jwk = cheie.export({ format: 'jwk' });
  if (!jwk.d || !jwk.x) throw new Error('Nu e o cheie privată Ed25519.');
  return Buffer.concat([Buffer.from(jwk.d, 'base64url'), Buffer.from(jwk.x, 'base64url')]);
}

/** Verificarea semnăturii (ca a site-ului, fără regulile de versiune/site). */
export function verificaSemnatura(text: string, cheiePublica: KeyObject): boolean {
  let date: unknown;
  try {
    date = JSON.parse(text);
  } catch {
    return false;
  }
  if (!date || typeof date !== 'object' || Array.isArray(date)) return false;
  const semnatura = (date as Record<string, unknown>).semnatura;
  if (typeof semnatura !== 'string') return false;
  const octeti = Buffer.from(semnatura, 'base64');
  if (octeti.length !== 64) return false;
  try {
    return crypto.verify(null, mesajDeSemnat(date), cheiePublica, octeti);
  } catch {
    return false;
  }
}
