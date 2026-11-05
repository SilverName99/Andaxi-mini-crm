/**
 * Licentele CMS: vectorul de test al CMS-ului si interoperabilitatea cu codul PHP
 * al CMS-ului (andaxi-cms/src/Support/Licenta.php), prin server/scripts/licenta-cms.php.
 *
 * Partea PHP cauta repo-ul CMS-ului in ANDAXI_CMS_DIR sau, implicit, langa acest
 * repo (../andaxi-cms). Daca ANDAXI_CMS_DIR e dat (npm run test:licenta-cms), lipsa
 * lui sau a PHP-ului face testul sa pice; altfel partea PHP se sare, cu un mesaj.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  cheiePrivataDinSamanta, cheiePrivataSodium, cheiePublicaBase64, cheiePublicaDinBase64, construiesteLicenta,
  jsonCanonic, mesajDeSemnat, semneazaLicenta, verificaSemnatura, type StarePlugin,
} from './licenta.js';

const SCRIPT_PHP = fileURLToPath(new URL('../../scripts/licenta-cms.php', import.meta.url));
const CMS_DIR = path.resolve(
  process.env.ANDAXI_CMS_DIR ?? fileURLToPath(new URL('../../../../andaxi-cms', import.meta.url)),
);
const CMS_OBLIGATORIU = Boolean(process.env.ANDAXI_CMS_DIR);

/* ---------------------------------------------- vectorul din docs/PLUGINURI.md */

const SAMANTA_VECTOR = Buffer.alloc(32, 1);

test('vectorul CMS-ului: cheia publica, mesajul semnat si semnatura sunt identice', () => {
  const cheie = cheiePrivataDinSamanta(SAMANTA_VECTOR);
  assert.equal(cheiePublicaBase64(cheie), 'iojj3XQJ8ZX9UtstPLpdcspnCb8dlBIb83SIAbQPb1w=');

  const continut = {
    site: 'exemplu',
    emisa_la: '2026-10-18T09:15:02Z',
    versiune: 17,
    pluginuri: { magazin: 'se_opreste', catalog: 'pornit' },
  } as const;
  assert.equal(
    mesajDeSemnat(continut).toString('utf8'),
    'andaxi-licenta-v1\n{"emisa_la":"2026-10-18T09:15:02Z","pluginuri":{"catalog":"pornit","magazin":"se_opreste"},"site":"exemplu","versiune":17}',
  );
  const text = semneazaLicenta(continut, cheie);
  assert.equal(
    JSON.parse(text).semnatura,
    'v+hUHsCMbP45/pNdtfuQAaesPpyOrrAYGaEY5pso+siktOE3kuICn/2284CZX5iL3ibD0WWlpYQEQDJIS2x6DA==',
  );
  assert.ok(verificaSemnatura(text, cheiePublicaDinBase64('iojj3XQJ8ZX9UtstPLpdcspnCb8dlBIb83SIAbQPb1w=')));
});

test('JSON-ul canonic: chei sortate, fara spatii, fara escape la „/", diacritice si U+2028', () => {
  assert.equal(
    jsonCanonic({ b: 1, a: { d: '/cale/ăîș', c: 'x y' }, l: [2, 1], g: {} }),
    '{"a":{"c":"x y","d":"/cale/ăîș"},"b":1,"g":{},"l":[2,1]}',
  );
  assert.throws(() => jsonCanonic({ a: 1.5 }));
});

test('construieste licenta: pluginurile oprite nu intra, ordinea urmeaza catalogul', () => {
  const continut = construiesteLicenta({
    site: 'biovitality',
    versiune: 3,
    emisaLa: new Date('2026-11-05T21:00:00.123Z'),
    stari: { magazin: 'pornit', blog: 'oprit', catalog: 'se_opreste' },
    ordine: ['catalog', 'magazin', 'blog'],
  });
  assert.deepEqual(continut, {
    site: 'biovitality',
    emisa_la: '2026-11-05T21:00:00Z',
    versiune: 3,
    pluginuri: { catalog: 'se_opreste', magazin: 'pornit' },
  });
  assert.deepEqual(Object.keys(continut.pluginuri), ['catalog', 'magazin']);
  assert.throws(() => construiesteLicenta({ site: 'Bio Vitality', versiune: 1, emisaLa: new Date(), stari: {} }));
  assert.throws(() => construiesteLicenta({ site: 'bv', versiune: 0, emisaLa: new Date(), stari: {} }));
});

test('o licenta modificata dupa semnare nu se mai verifica', () => {
  const cheie = cheiePrivataDinSamanta(Buffer.alloc(32, 7));
  const text = semneazaLicenta(
    construiesteLicenta({ site: 'bv', versiune: 1, emisaLa: new Date(), stari: { catalog: 'pornit' } }),
    cheie,
  );
  const publica = cheiePublicaDinBase64(cheiePublicaBase64(cheie));
  assert.ok(verificaSemnatura(text, publica));
  assert.equal(verificaSemnatura(text.replace('"pornit"', '"se_opreste"'), publica), false);
});

/* ----------------------------------------------------- cu codul PHP al CMS-ului */

function phpDisponibil(): string | null {
  if (!fs.existsSync(path.join(CMS_DIR, 'src/Support/Licenta.php'))) {
    return `nu gasesc andaxi-cms in ${CMS_DIR} (seteaza ANDAXI_CMS_DIR)`;
  }
  const php = spawnSync('php', ['-r', 'echo function_exists("sodium_crypto_sign_detached") ? "da" : "nu";'], {
    encoding: 'utf8',
  });
  if (php.error || php.status !== 0) return 'php nu e instalat';
  if (php.stdout.trim() !== 'da') return 'php nu are extensia sodium';
  return null;
}

function php(args: string[], intrare: string): string {
  const r = spawnSync('php', [SCRIPT_PHP, ...args], { input: intrare, encoding: 'utf8' });
  assert.equal(r.status, 0, `php a esuat: ${r.stderr}`);
  return r.stdout;
}

function verificaInCms(text: string, cheiePublica: string, site: string) {
  return JSON.parse(php(['verifica', CMS_DIR, cheiePublica, site], text)) as {
    ok: boolean;
    eroare: string;
    licenta: { site: string; versiune: number; emisa_la: string; pluginuri: Record<string, string>; redirectionari: Record<string, string> } | null;
    mesaj: string;
  };
}

const motivSarit = phpDisponibil();
if (motivSarit && CMS_OBLIGATORIU) {
  test('interoperabilitatea cu CMS-ul are nevoie de PHP si de andaxi-cms', () => {
    assert.fail(motivSarit);
  });
}
const optiuniPhp = { skip: motivSarit && !CMS_OBLIGATORIU ? `partea PHP sarita: ${motivSarit}` : false };

test('CMS-ul (Licenta::verifica) accepta licenta semnata de CRM, cu exact aceleasi date', optiuniPhp, () => {
  const cheie = cheiePrivataDinSamanta(Buffer.alloc(32, 42));
  const publica = cheiePublicaBase64(cheie);
  const stari: Record<string, StarePlugin> = {
    catalog: 'pornit', magazin: 'pornit', livrare_fan: 'pornit', plata_stripe: 'pornit', link_plata: 'pornit',
    erp: 'pornit', cupoane: 'pornit', fidelitate: 'pornit', recenzii: 'pornit', oferte_bbd: 'pornit',
    produse_promo: 'pornit', pachete_produse: 'pornit', conturi_clienti: 'pornit', blog: 'se_opreste',
    newsletter: 'pornit', chat_live: 'pornit', fisiere_cloud: 'pornit', concurenta: 'pornit', manechin: 'pornit',
    acorduri_gdpr: 'pornit', campanii: 'pornit', precomenzi: 'oprit',
  };
  const continut = construiesteLicenta({
    site: 'biovitality',
    versiune: 1,
    emisaLa: new Date(),
    stari,
    redirectionari: { precomenzi: '/pagină/ofertă-ș' },
  });
  const text = semneazaLicenta(continut, cheie);

  const r = verificaInCms(text, publica, 'biovitality');
  assert.equal(r.eroare, '');
  assert.equal(r.ok, true);
  assert.equal(r.licenta?.site, 'biovitality');
  assert.equal(r.licenta?.versiune, 1);
  assert.equal(r.licenta?.emisa_la, continut.emisa_la);
  assert.deepEqual(r.licenta?.pluginuri, continut.pluginuri);
  assert.deepEqual(r.licenta?.redirectionari, { precomenzi: '/pagină/ofertă-ș' });
  assert.equal(r.licenta?.pluginuri.precomenzi, undefined);
  // acelasi mesaj semnat, octet cu octet
  assert.equal(Buffer.from(r.mesaj, 'base64').toString('utf8'), mesajDeSemnat(continut).toString('utf8'));
  // si cheia publica in forma base64url (cum o accepta si CMS-ul)
  assert.equal(verificaInCms(text, Buffer.from(publica, 'base64').toString('base64url'), 'biovitality').ok, true);
});

test('CMS-ul respinge licenta modificata, alt site si alta cheie', optiuniPhp, () => {
  const cheie = cheiePrivataDinSamanta(Buffer.alloc(32, 42));
  const publica = cheiePublicaBase64(cheie);
  const text = semneazaLicenta(
    construiesteLicenta({ site: 'biovitality', versiune: 2, emisaLa: new Date(), stari: { catalog: 'pornit' } }),
    cheie,
  );
  assert.equal(verificaInCms(text, publica, 'biovitality').ok, true);

  const modificata = verificaInCms(text.replace('"pornit"', '"se_opreste"'), publica, 'biovitality');
  assert.equal(modificata.ok, false);
  assert.match(modificata.eroare, /semnătura nu se potrivește/);

  const altSite = verificaInCms(text, publica, 'bioscem');
  assert.equal(altSite.ok, false);
  assert.match(altSite.eroare, /bioscem/);

  const altaCheie = cheiePublicaBase64(cheiePrivataDinSamanta(Buffer.alloc(32, 43)));
  assert.equal(verificaInCms(text, altaCheie, 'biovitality').ok, false);
});

test('Licenta::semneaza din CMS si CRM-ul scriu acelasi fisier, octet cu octet', optiuniPhp, () => {
  const cheie = cheiePrivataDinSamanta(SAMANTA_VECTOR);
  const continut = construiesteLicenta({
    site: 'biovitality',
    versiune: 5,
    emisaLa: new Date('2026-11-05T21:30:00Z'),
    stari: { catalog: 'pornit', magazin: 'se_opreste', campanii: 'pornit' },
    redirectionari: { blog: '/' },
  });
  const dinCms = php(
    ['semneaza', CMS_DIR],
    JSON.stringify({ continut, cheie_privata: cheiePrivataSodium(cheie).toString('base64') }),
  );
  assert.equal(semneazaLicenta(continut, cheie), dinCms);
  assert.ok(verificaSemnatura(dinCms, cheiePublicaDinBase64(cheiePublicaBase64(cheie))));
});
