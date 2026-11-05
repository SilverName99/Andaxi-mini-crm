/**
 * Pingul unui site CMS: GET https://<domeniu>/_andaxi/ping (andaxi-cms,
 * docs/DEZVOLTARE.md, „Pingul"): 200 {"ok":true,"db":true,"cod":"<versiune>",
 * "schema":"<stare>","mentenanta":"strict"|"usoara"|"nu"}, 503 {"ok":false,"db":false}
 * fara baza. Un site inca pe codul vechi raspunde 404.
 *
 * Domeniul il scrie omul in CRM, deci cererea pleaca doar spre internetul public:
 *  - domeniul se rezolva o data (dns.lookup, toate adresele); daca vreuna e
 *    locala (loopback, RFC1918, link-local, CGNAT, ULA, ::1 …) cererea nu pleaca;
 *  - conexiunea se face exact la adresa verificata (lookup fixat), deci un DNS
 *    care raspunde altceva a doua oara (DNS rebinding) nu schimba nimic;
 *  - redirectionarile nu se urmeaza; raspunsul se citeste cel mult 4 KB.
 */
import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import type { LookupFunction } from 'node:net';

export interface StareSite {
  /** sus = raspunde ok; jos = nu raspunde sau eroare; vechi = fara ping (404, codul de dinainte de CMS) */
  stare: 'sus' | 'jos' | 'vechi';
  http: number | null;
  cod: string | null;
  schema: string | null;
  mentenanta: string | null;
  eroare: string;
  verificatLa: string;
}

export const DOMENIU = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const MAX_RASPUNS = 4096;

/** Retelele spre care pingul nu are voie sa plece */
const INTERZISE = new net.BlockList();
for (const [retea, prefix] of [
  ['0.0.0.0', 8], // „aceasta retea"
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (si metadatele cloud)
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // teste de retea
  ['224.0.0.0', 3], // multicast si rezervate, pana la 255.255.255.255
] as const) {
  INTERZISE.addSubnet(retea, prefix, 'ipv4');
}
for (const [retea, prefix] of [
  ['::', 128], // nespecificata
  ['::1', 128], // loopback
  ['fc00::', 7], // ULA
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
  ['64:ff9b::', 96], // NAT64 (ar duce spre IPv4 interne)
  ['2001:db8::', 32], // documentatie
] as const) {
  INTERZISE.addSubnet(retea, prefix, 'ipv6');
}

/** Adresa e una spre care pingul nu are voie sa plece? */
export function adresaInterzisa(adresa: string): boolean {
  const familie = net.isIP(adresa);
  if (familie === 0) return true;
  if (familie === 6) {
    // ::ffff:10.0.0.1 si altele mapate pe IPv4: se judeca dupa IPv4
    const mapata = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(adresa);
    if (mapata) return INTERZISE.check(mapata[1], 'ipv4');
    if (/^::ffff:/i.test(adresa)) return true;
    return INTERZISE.check(adresa, 'ipv6');
  }
  return INTERZISE.check(adresa, 'ipv4');
}

export type Rezolvare = (domeniu: string) => Promise<{ address: string; family: number }[]>;

const rezolvaImplicit: Rezolvare = (domeniu) => dns.lookup(domeniu, { all: true, verbatim: true });

function rezultat(stare: StareSite['stare'], http: number | null, eroare: string, date: Record<string, unknown> = {}): StareSite {
  const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, 100) : null);
  return {
    stare,
    http,
    cod: text(date.cod),
    schema: text(date.schema),
    mentenanta: text(date.mentenanta),
    eroare,
    verificatLa: new Date().toISOString(),
  };
}

/**
 * Cererea propriu-zisa, la o adresa deja verificata. Exportata pentru teste
 * (`port`, `ca`); in aplicatie o cheama doar `pingSite`.
 */
export function cerePing(opt: {
  domeniu: string;
  adresa: string;
  familie: number;
  timeoutMs: number;
  port?: number;
  ca?: string;
}): Promise<StareSite> {
  const lookupFixat: LookupFunction = (_host, optiuni, callback) => {
    if (optiuni.all) {
      (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [
        { address: opt.adresa, family: opt.familie },
      ]);
    } else {
      callback(null, opt.adresa, opt.familie);
    }
  };

  return new Promise((resolve) => {
    let gata = false;
    const termina = (r: StareSite) => {
      if (gata) return;
      gata = true;
      clearTimeout(ceas);
      cerere.destroy();
      resolve(r);
    };

    const cerere = https.request(
      {
        host: opt.domeniu, // pentru SNI si verificarea certificatului
        servername: opt.domeniu,
        port: opt.port ?? 443,
        path: '/_andaxi/ping',
        method: 'GET',
        lookup: lookupFixat,
        agent: false,
        ca: opt.ca,
        headers: { accept: 'application/json', 'user-agent': 'andaxi-mini-crm/ping', connection: 'close' },
      },
      (raspuns) => {
        const http = raspuns.statusCode ?? 0;
        if (http >= 300 && http < 400) {
          return termina(rezultat('jos', http, `redirecționează (HTTP ${http}); pune în CRM domeniul final`));
        }
        if (http === 404) {
          return termina(rezultat('vechi', 404, 'fara ping (site inca pe codul vechi?)'));
        }
        const bucati: Buffer[] = [];
        let marime = 0;
        raspuns.on('data', (bucata: Buffer) => {
          marime += bucata.length;
          if (marime > MAX_RASPUNS) {
            termina(rezultat('jos', http, 'raspuns prea mare pentru un ping'));
            return;
          }
          bucati.push(bucata);
        });
        raspuns.on('error', () => termina(rezultat('jos', http, 'raspuns intrerupt')));
        raspuns.on('end', () => {
          let date: Record<string, unknown> = {};
          try {
            const citit = JSON.parse(Buffer.concat(bucati).toString('utf8'));
            if (citit && typeof citit === 'object') date = citit as Record<string, unknown>;
          } catch {
            /* raspuns fara JSON */
          }
          const ok = http >= 200 && http < 300 && date.ok === true;
          termina(
            rezultat(ok ? 'sus' : 'jos', http, ok ? '' : date.db === false ? 'baza de date nu raspunde' : `HTTP ${http}`, date),
          );
        });
      },
    );
    const ceas = setTimeout(() => termina(rezultat('jos', null, 'nu raspunde (timeout)')), opt.timeoutMs);
    cerere.on('error', () => termina(rezultat('jos', null, 'nu se poate conecta')));
    cerere.end();
  });
}

export async function pingSite(
  domeniu: string,
  opt: { timeoutMs?: number; rezolva?: Rezolvare } = {},
): Promise<StareSite> {
  if (!DOMENIU.test(domeniu)) return rezultat('jos', null, 'domeniu invalid');

  let adrese: { address: string; family: number }[];
  try {
    adrese = await (opt.rezolva ?? rezolvaImplicit)(domeniu);
  } catch {
    return rezultat('jos', null, 'domeniul nu se rezolva (DNS)');
  }
  if (adrese.length === 0) return rezultat('jos', null, 'domeniul nu se rezolva (DNS)');
  if (adrese.some((a) => adresaInterzisa(a.address))) {
    return rezultat('jos', null, 'domeniul duce la o adresa din reteaua locala; pingul nu pleaca');
  }
  const aleasa = adrese[0];
  return cerePing({ domeniu, adresa: aleasa.address, familie: aleasa.family, timeoutMs: opt.timeoutMs ?? 6000 });
}
