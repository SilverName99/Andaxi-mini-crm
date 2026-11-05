import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { spawnSync } from 'node:child_process';
import { adresaInterzisa, cerePing, MAX_RASPUNS, pingSite } from './ping-site.js';

test('adresele locale sunt refuzate, cele publice nu', () => {
  for (const a of [
    '127.0.0.1', '127.8.9.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '100.127.255.254', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fc00::1',
    'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'nu-e-ip',
  ]) {
    assert.equal(adresaInterzisa(a), true, a);
  }
  for (const a of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2a02:4780::1', '::ffff:8.8.8.8']) {
    assert.equal(adresaInterzisa(a), false, a);
  }
});

test('un domeniu care duce (si) la o adresa locala nu primeste nicio cerere', async () => {
  for (const adrese of [
    [{ address: '127.0.0.1', family: 4 }],
    [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.5', family: 4 }],
    [{ address: '::1', family: 6 }],
  ]) {
    const r = await pingSite('biovitality.ro', { rezolva: async () => adrese });
    assert.equal(r.stare, 'jos');
    assert.match(r.eroare, /reteaua locala/);
  }
  assert.match((await pingSite('http://x', {})).eroare, /domeniu invalid/);
  assert.match((await pingSite('localhost', {})).eroare, /domeniu invalid/);
});

/* ------------------------- server HTTPS local, cu un certificat facut pe loc */

const dosar = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-ping-'));
const openssl = spawnSync('openssl', [
  'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1',
  '-subj', '/CN=site.test', '-addext', 'subjectAltName=DNS:site.test',
  '-keyout', path.join(dosar, 'k.pem'), '-out', path.join(dosar, 'c.pem'),
], { encoding: 'utf8' });
const areOpenssl = !openssl.error && openssl.status === 0;
test.after(() => fs.rmSync(dosar, { recursive: true, force: true }));

async function server(handler: https.RequestListener) {
  const s = https.createServer(
    { key: fs.readFileSync(path.join(dosar, 'k.pem')), cert: fs.readFileSync(path.join(dosar, 'c.pem')) },
    handler,
  );
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  return { s, port: (s.address() as AddressInfo).port, ca: fs.readFileSync(path.join(dosar, 'c.pem'), 'utf8') };
}

const sarit = { skip: areOpenssl ? false : 'openssl lipseste' };

test('conexiunea merge la adresa verificata, cu numele domeniului pentru certificat', sarit, async () => {
  const cai: string[] = [];
  const { s, port, ca } = await server((req, res) => {
    cai.push(`${req.headers.host} ${req.url}`);
    res.setHeader('content-type', 'application/json');
    res.end('{"ok":true,"db":true,"cod":"2026.11.05-abc","schema":"la_zi","mentenanta":"nu"}');
  });
  try {
    // „site.test" nu exista in DNS: daca s-ar rezolva din nou, cererea ar pica
    const r = await cerePing({ domeniu: 'site.test', adresa: '127.0.0.1', familie: 4, timeoutMs: 3000, port, ca });
    assert.equal(r.stare, 'sus');
    assert.equal(r.cod, '2026.11.05-abc');
    assert.equal(r.mentenanta, 'nu');
    assert.deepEqual(cai, [`site.test:${port} /_andaxi/ping`]);
  } finally {
    s.close();
  }
});

test('redirectionarile nu se urmeaza', sarit, async () => {
  let cereri = 0;
  const { s, port, ca } = await server((req, res) => {
    cereri += 1;
    res.writeHead(302, { location: 'https://site.test/_andaxi/ping-2' });
    res.end();
  });
  try {
    const r = await cerePing({ domeniu: 'site.test', adresa: '127.0.0.1', familie: 4, timeoutMs: 3000, port, ca });
    assert.equal(r.stare, 'jos');
    assert.equal(r.http, 302);
    assert.match(r.eroare, /redirecționează/);
    assert.equal(cereri, 1);
  } finally {
    s.close();
  }
});

test('un raspuns mai mare de cativa KB se taie, fara sa fie citit tot', sarit, async () => {
  let trimis = 0;
  const { s, port, ca } = await server((_req, res) => {
    res.setHeader('content-type', 'application/json');
    const bucata = Buffer.alloc(16 * 1024, 0x20);
    const scrie = () => {
      while (trimis < 50 * 1024 * 1024) {
        trimis += bucata.length;
        if (!res.write(bucata)) return void res.once('drain', scrie);
      }
      res.end();
    };
    res.on('error', () => {});
    scrie();
  });
  try {
    const r = await cerePing({ domeniu: 'site.test', adresa: '127.0.0.1', familie: 4, timeoutMs: 5000, port, ca });
    assert.equal(r.stare, 'jos');
    assert.match(r.eroare, /prea mare/);
    assert.ok(trimis < 10 * 1024 * 1024, `s-au trimis ${trimis} octeti`);
    assert.ok(MAX_RASPUNS <= 8192);
  } finally {
    s.closeAllConnections();
    s.close();
  }
});

test('certificatul altui nume e refuzat', sarit, async () => {
  const { s, port, ca } = await server((_req, res) => res.end('{"ok":true}'));
  try {
    const r = await cerePing({ domeniu: 'alt-site.test', adresa: '127.0.0.1', familie: 4, timeoutMs: 3000, port, ca });
    assert.equal(r.stare, 'jos');
    assert.match(r.eroare, /nu se poate conecta/);
  } finally {
    s.close();
  }
});
