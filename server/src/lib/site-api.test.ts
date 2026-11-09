/**
 * Preluarea automata a licentei (GET /api/site/licenta) si re-semnarea la salvare,
 * pe o baza SQLite temporara facuta cu `prisma db push` (ca la deploy) si o cheie
 * Ed25519 temporara. Rutele adevarate (sites + site-api), intr-un server Express pe
 * un port liber; contul de administrare e simulat (requireAuth nu e aici).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import {
  cheiaSePotriveste, cheieIp, citesteCheie, creeazaFereastra, genereazaCheieSite, hashCheie, ipClient, pluginuriCanonice,
} from './site-api.js';

/* ------------------------------------------------------------ functiile pure */

test('cheia site-ului: forma, hash-ul, comparatia', () => {
  const { cheie, hash } = genereazaCheieSite('clx0abc123def456ghi789jk');
  assert.match(cheie, /^clx0abc123def456ghi789jk\.[A-Za-z0-9_-]{43}$/);
  assert.equal(hash, hashCheie(cheie));
  assert.equal(cheiaSePotriveste(cheie, hash), true);
  assert.equal(cheiaSePotriveste(`${cheie.slice(0, -1)}A`, hash), cheie.endsWith('A'));
  assert.equal(cheiaSePotriveste(cheie, ''), false, 'site fara cheie');
  assert.equal(cheiaSePotriveste(cheie, null), false, 'site inexistent');
  assert.equal(cheiaSePotriveste(cheie, 'nu-e-hex'), false);

  assert.deepEqual(citesteCheie(`Bearer ${cheie}`), { siteId: 'clx0abc123def456ghi789jk', cheie });
  assert.deepEqual(citesteCheie(`bearer  ${cheie} `), { siteId: 'clx0abc123def456ghi789jk', cheie });
  assert.equal(citesteCheie(undefined), null);
  assert.equal(citesteCheie(cheie), null, 'fara Bearer');
  assert.equal(citesteCheie(`Basic ${cheie}`), null);
  assert.equal(citesteCheie('Bearer abc.def'), null, 'prea scurta');
  assert.equal(citesteCheie(`Bearer ../x.${'a'.repeat(43)}`), null);
});

test('limita pe fereastra: max cereri, apoi asteptare pana la capatul ferestrei', () => {
  const f = creeazaFereastra(3, 60_000);
  assert.equal(f.cerere('ip', 0), 0);
  assert.equal(f.cerere('ip', 1), 0);
  assert.equal(f.cerere('ip', 2), 0);
  assert.equal(f.cerere('ip', 3), 60);
  assert.equal(f.asteptare('ip', 30_000), 30);
  assert.equal(f.cerere('alt-ip', 3), 0, 'fiecare IP are fereastra lui');
  assert.equal(f.cerere('ip', 60_000), 0, 'fereastra noua');
});

test('limita pe fereastra: harta marginita (cele mai vechi ies), curatata cel mult o data pe fereastra', () => {
  const f = creeazaFereastra(2, 60_000, 100);
  for (let i = 0; i < 1000; i++) f.cerere(`ip-${i}`, i);
  assert.equal(f.marime(), 100, 'niciodata peste maxChei');
  assert.equal(f.cerere('ip-999', 1000), 0, 'cele noi raman');
  assert.equal(f.cerere('ip-999', 1001), 60, 'si isi pastreaza numaratoarea');
  // dupa o fereastra, prima cerere curata tot ce a expirat
  f.cerere('nou', 200_000);
  assert.equal(f.marime(), 1);
});

test('cheia IP-ului: IPv4 intreg, IPv6 pe /64 (oricum ar fi scris)', () => {
  assert.equal(cheieIp('203.0.113.7'), '203.0.113.7');
  assert.equal(cheieIp('2001:db8:1:2::abc'), '2001:db8:1:2::/64');
  assert.equal(cheieIp('2001:DB8:1:2:0:0:0:1'), '2001:db8:1:2::/64');
  assert.equal(cheieIp('2001:0db8:0001:0002:ffff:ffff:ffff:ffff'), '2001:db8:1:2::/64');
  assert.notEqual(cheieIp('2001:db8:1:3::1'), cheieIp('2001:db8:1:2::1'));
  assert.equal(cheieIp('::1'), '0:0:0:0::/64');
  assert.equal(cheieIp('nu:e:ip::x'), 'nu:e:ip::x', 'o forma necunoscuta ramane cum e');
});

test('IP-ul: X-Real-IP doar de la proxy-ul local', () => {
  assert.equal(ipClient('127.0.0.1', '203.0.113.7'), '203.0.113.7');
  assert.equal(ipClient('::ffff:127.0.0.1', '203.0.113.7'), '203.0.113.7');
  assert.equal(ipClient('198.51.100.2', '203.0.113.7'), '198.51.100.2', 'un client din afara nu-si alege IP-ul');
  assert.equal(ipClient('127.0.0.1', 'nu e ip; rm'), '127.0.0.1');
});

test('pluginuri canonice: ordinea si „oprit" nu conteaza', () => {
  assert.equal(pluginuriCanonice({ magazin: 'pornit', catalog: 'pornit', blog: 'oprit' }), pluginuriCanonice({ catalog: 'pornit', magazin: 'pornit' }));
  assert.notEqual(pluginuriCanonice({ catalog: 'pornit' }), pluginuriCanonice({ catalog: 'se_opreste' }));
});

/* --------------------------------------------------------- rutele, cap-coada */

const dosar = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-site-api-'));
const url = `file:${path.join(dosar, 'test.db')}`;
const serverDir = fileURLToPath(new URL('../..', import.meta.url));

test('preluarea licentei: re-semnare la salvare, cheia site-ului, autentificare, limita, jurnalul', async (t) => {
  const push = spawnSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
  });
  assert.equal(push.status, 0, push.stderr);

  // inainte de importul rutelor: prisma.ts si env.ts citesc mediul la import
  process.env.DATABASE_URL = url;
  process.env.LICENTA_CHEIE_PRIVATA = path.join(dosar, 'licenta', 'cheie-privata.pem');
  const express = (await import('express')).default;
  const { sitesRouter } = await import('../routes/sites.js');
  const { siteApiRouter, limitaIp, limitaSite, limitaEsecuri } = await import('../routes/site-api.js');
  const { errorHandler } = await import('../middleware/errors.js');
  const { genereazaPereche } = await import('./licenta-chei.js');
  const { verificaSemnatura, cheiePublicaDinBase64 } = await import('./licenta.js');
  const { prisma } = await import('../prisma.js');

  const app = express();
  app.use(express.json());
  app.use('/api/site', siteApiRouter);
  app.use('/api/sites', (req, _res, next) => {
    req.user = { id: 'u1', email: 'owner@andaxi.ro', name: 'Owner' };
    next();
  }, sitesRouter);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const baza = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const jurnal: string[] = [];
  const logOriginal = console.log;
  console.log = (...args: unknown[]) => {
    jurnal.push(args.map(String).join(' '));
  };

  const cere = async (metoda: string, cale: string, corp?: unknown, antete: Record<string, string> = {}) => {
    const r = await fetch(baza + cale, {
      method: metoda,
      headers: { ...(corp !== undefined ? { 'Content-Type': 'application/json' } : {}), ...antete },
      body: corp !== undefined ? JSON.stringify(corp) : undefined,
    });
    const text = await r.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* nu e JSON */
    }
    return { status: r.status, text, json, antete: r.headers };
  };
  const preia = (cheie?: string) => cere('GET', '/api/site/licenta', undefined, cheie ? { Authorization: `Bearer ${cheie}` } : {});

  try {
    const site = (await cere('POST', '/api/sites', { name: 'Biovitality', slug: 'biovitality', domain: 'biovitality.ro' })).json;
    assert.equal(site.licenses.length, 0, 'crearea nu semneaza nimic (slug-ul ramane liber)');
    assert.deepEqual(site.cheieSite, { exista: false, creataLa: null });
    assert.equal(site.ultimaPreluare, null);

    await t.test('fara pereche de chei, salvarea pluginurilor doar salveaza lista', async () => {
      const r = await cere('PUT', `/api/sites/${site.id}`, { plugins: { catalog: 'pornit' } });
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.licentaNoua, null);
      assert.equal(r.json.licenses.length, 0);
    });

    const pereche = genereazaPereche({ rotatie: false });
    const cheiePublica = cheiePublicaDinBase64(pereche.cheiePublica!);

    await t.test('salvarea cu alta lista semneaza singura versiunea urmatoare; aceeasi lista nu', async () => {
      let r = await cere('PUT', `/api/sites/${site.id}`, { plugins: { catalog: 'pornit', magazin: 'pornit' } });
      assert.equal(r.status, 200, r.text);
      assert.equal(r.json.licentaNoua.version, 1);
      assert.deepEqual(r.json.licentaNoua.plugins, { catalog: 'pornit', magazin: 'pornit' });
      assert.match(r.json.licentaNoua.issuedBy, /automat la salvare/);

      r = await cere('PUT', `/api/sites/${site.id}`, { plugins: { magazin: 'pornit', catalog: 'pornit', blog: 'oprit' } });
      assert.equal(r.json.licentaNoua, null, 'aceeasi lista (alta ordine, un „oprit") nu face o licenta noua');
      r = await cere('PUT', `/api/sites/${site.id}`, { name: 'Biovitality SRL' });
      assert.equal(r.json.licentaNoua, null, 'numele nu intra in licenta');

      r = await cere('PUT', `/api/sites/${site.id}`, { plugins: { catalog: 'pornit', magazin: 'pornit', blog: 'pornit' } });
      assert.equal(r.json.licentaNoua.version, 2);
      r = await cere('PUT', `/api/sites/${site.id}`, { plugins: { catalog: 'pornit', magazin: 'pornit' } });
      assert.equal(r.json.licentaNoua.version, 3, 'oprirea unui plugin e tot o licenta noua');
      assert.deepEqual(r.json.licentaNoua.plugins, { catalog: 'pornit', magazin: 'pornit' });
      assert.deepEqual(r.json.licenses.map((l: { version: number }) => l.version), [3, 2, 1]);

      // de mana: o versiune aleasa ramane posibila si nu poate cobori
      const mana = await cere('POST', `/api/sites/${site.id}/licente`, { versiune: 2 });
      assert.equal(mana.status, 400);
      const salt = await cere('POST', `/api/sites/${site.id}/licente`, { versiune: 10 });
      assert.equal(salt.status, 201, salt.text);
      r = await cere('PUT', `/api/sites/${site.id}`, { plugins: { catalog: 'pornit' } });
      assert.equal(r.json.licentaNoua.version, 11, 'dupa una de mana, tot urmatoarea');
    });

    await t.test('doua salvari deodata: versiuni diferite, niciuna pierduta', async () => {
      const [a, b] = await Promise.all([
        cere('PUT', `/api/sites/${site.id}`, { plugins: { catalog: 'pornit', blog: 'pornit' } }),
        cere('PUT', `/api/sites/${site.id}`, { plugins: { catalog: 'pornit', recenzii: 'pornit' } }),
      ]);
      assert.equal(a.status, 200, a.text);
      assert.equal(b.status, 200, b.text);
      const versiuni = [a.json.licentaNoua?.version, b.json.licentaNoua?.version].filter(Boolean).sort();
      assert.deepEqual(versiuni, [12, 13]);
    });

    let cheieSite = '';
    let cheieGol = '';
    const toateCheile: string[] = [];
    await t.test('cheia site-ului: aratata o data, stocata doar ca hash, rotatia o inlocuieste', async () => {
      const r = await cere('POST', `/api/sites/${site.id}/cheie-site`, {});
      assert.equal(r.status, 201, r.text);
      cheieSite = r.json.cheie;
      toateCheile.push(cheieSite);
      assert.ok(cheieSite.startsWith(`${site.id}.`));
      const rand = await prisma.cmsSite.findUniqueOrThrow({ where: { id: site.id } });
      assert.equal(rand.fetchKeyHash, crypto.createHash('sha256').update(cheieSite).digest('hex'));
      assert.ok(!JSON.stringify(rand).includes(cheieSite.split('.')[1]), 'cheia insasi nu e in baza');

      const dto = (await cere('GET', `/api/sites/${site.id}`)).json;
      assert.equal(dto.cheieSite.exista, true);
      assert.ok(!JSON.stringify(dto).includes(cheieSite), 'nici in raspunsurile interfetei');
      assert.equal((await cere('POST', `/api/sites/${site.id}/cheie-site`, {})).status, 409, 'a doua doar cu rotatie');
    });

    await t.test('GET /api/site/licenta: fara cheie, cheie gresita, alt site → 401', async () => {
      assert.equal((await preia()).status, 401);
      assert.equal((await preia('nu-are-forma')).status, 401);
      const [id, secret] = cheieSite.split('.');
      const gresita = `${id}.${secret[0] === 'A' ? 'B' : 'A'}${secret.slice(1)}`;
      assert.equal((await preia(gresita)).status, 401);
      assert.equal((await preia(`cinexistentxxxxxxxxxxxxxx.${secret}`)).status, 401);
      const r = await cere('GET', '/api/site/licenta', undefined, { Authorization: `Basic ${cheieSite}` });
      assert.equal(r.status, 401);
    });

    await t.test('cheia buna: licenta curenta, exact textul semnat; ultima preluare se vede', async () => {
      limitaEsecuri.reset();
      const r = await preia(cheieSite);
      assert.equal(r.status, 200, r.text);
      const ultima = await prisma.cmsLicense.findFirstOrThrow({ where: { siteId: site.id }, orderBy: { version: 'desc' } });
      assert.equal(r.text, ultima.content, 'neschimbat, octet cu octet');
      assert.equal(r.json.versiune, 13);
      assert.equal(r.json.site, 'biovitality');
      assert.ok(verificaSemnatura(r.text, cheiePublica));
      assert.equal(r.antete.get('cache-control'), 'no-store');

      const dto = (await cere('GET', `/api/sites/${site.id}`)).json;
      assert.equal(dto.ultimaPreluare.versiune, 13);
      assert.equal(dto.ultimaPreluare.ip, '127.0.0.1');
      assert.ok(Date.now() - new Date(dto.ultimaPreluare.la).getTime() < 60_000);
    });

    await t.test('un plugin bifat in CRM ajunge la urmatoarea preluare', async () => {
      await cere('PUT', `/api/sites/${site.id}`, { plugins: { catalog: 'pornit', recenzii: 'pornit', blog: 'pornit', campanii: 'pornit' } });
      const r = await preia(cheieSite);
      assert.equal(r.json.versiune, 14);
      assert.equal(r.json.pluginuri.campanii, 'pornit');
    });

    await t.test('un site fara licenta: 404', async () => {
      const gol = (await cere('POST', '/api/sites', { name: 'Gol', slug: 'gol' })).json;
      const { cheie } = (await cere('POST', `/api/sites/${gol.id}/cheie-site`, {})).json;
      cheieGol = cheie;
      assert.equal((await preia(cheie)).status, 404);
    });

    await t.test('rotatia: cheia veche nu mai merge, cea noua da', async () => {
      const r = await cere('POST', `/api/sites/${site.id}/cheie-site`, { rotatie: true });
      assert.equal(r.status, 201);
      assert.equal((await preia(cheieSite)).status, 401);
      const noua = r.json.cheie;
      assert.equal((await preia(noua)).status, 200);
      cheieSite = noua;
      toateCheile.push(noua);
    });

    const resetLimite = () => {
      limitaIp.reset();
      limitaSite.reset();
      limitaEsecuri.reset();
    };

    await t.test('limita cheilor gresite: dupa 10 pe IP o cheie gresita ia 429, una buna trece', async () => {
      resetLimite();
      for (let i = 0; i < 10; i++) assert.equal((await preia('gresita')).status, 401);
      const blocat = await preia('gresita');
      assert.equal(blocat.status, 429);
      assert.ok(Number(blocat.antete.get('retry-after')) > 0);
      assert.equal((await preia(`${site.id}.${'A'.repeat(43)}`)).status, 429, 'si o cheie cu forma buna, dar gresita');
      assert.equal((await preia(cheieSite)).status, 200, 'cheia buna nu e refuzata niciodata de limita esecurilor');
    });

    await t.test('limita pe site: 30 in 10 minute pentru un site; alt site de pe acelasi IP nu e atins', async () => {
      resetLimite();
      for (let i = 0; i < 30; i++) assert.equal((await preia(cheieSite)).status, 200, `cererea ${i + 1}`);
      const blocat = await preia(cheieSite);
      assert.equal(blocat.status, 429);
      assert.ok(Number(blocat.antete.get('retry-after')) > 0);
      assert.equal((await preia(cheieGol)).status, 404, 'celalalt site (fara licenta) trece de limita: 404, nu 429');
    });

    await t.test('limita larga pe IP, inainte de autentificare: 300 in 10 minute', async () => {
      resetLimite();
      for (let i = 0; i < 300; i++) await preia();
      assert.equal((await preia(cheieSite)).status, 429, 'a 301-a cerere de pe IP, chiar cu cheia buna');
      limitaIp.reset();
      assert.equal((await preia(cheieSite)).status, 200);
      resetLimite();
    });

    await t.test('jurnalul are fiecare preluare, dar niciodata cheia', () => {
      const tot = jurnal.join('\n');
      assert.match(tot, /\[licente\] preluare biovitality v13 de la 127\.0\.0\.1/);
      assert.match(tot, /preluare refuzata \(cheie gresita\)/);
      assert.match(tot, /emisa automat la salvare/);
      for (const cheie of toateCheile) assert.ok(!tot.includes(cheie.split('.')[1]), 'cheia nu e in jurnal');
    });
  } finally {
    console.log = logOriginal;
    server.close();
    await prisma.$disconnect();
    fs.rmSync(dosar, { recursive: true, force: true });
  }
});
