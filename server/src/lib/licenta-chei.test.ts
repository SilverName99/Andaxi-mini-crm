import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// cheia de test intr-un dosar temporar, inainte ca env.ts sa citeasca mediul
const dosar = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-chei-'));
const fisier = path.join(dosar, 'licenta', 'cheie-privata.pem');
process.env.LICENTA_CHEIE_PRIVATA = fisier;

const { cheiePrivata, genereazaPereche, stareCheie } = await import('./licenta-chei.js');
const { cheiePublicaBase64 } = await import('./licenta.js');

test.after(() => fs.rmSync(dosar, { recursive: true, force: true }));

test('perechea de chei: o data, 0600, fara cheia privata in stare; a doua doar prin rotatie', () => {
  assert.equal(stareCheie().exista, false);
  assert.throws(() => cheiePrivata(), /Genereaza perechea/);

  const stare = genereazaPereche(false);
  assert.equal(stare.exista, true);
  assert.equal(fs.statSync(fisier).mode & 0o777, 0o600);
  assert.equal(Buffer.from(stare.cheiePublica!, 'base64').length, 32);
  assert.equal(cheiePublicaBase64(cheiePrivata()), stare.cheiePublica);
  // starea trimisa interfetei nu contine nimic din fisierul privat
  const pem = fs.readFileSync(fisier, 'utf8');
  const corp = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
  assert.ok(!JSON.stringify(stare).includes(corp));

  assert.throws(() => genereazaPereche(false), /Exista deja/);
  assert.equal(stareCheie().cheiePublica, stare.cheiePublica);

  const noua = genereazaPereche(true);
  assert.notEqual(noua.cheiePublica, stare.cheiePublica);
  assert.deepEqual(noua.cheiVechi.map((c) => c.cheiePublica), [stare.cheiePublica]);
  const vechi = fs.readdirSync(path.dirname(fisier)).filter((n) => n.endsWith('.pem.veche'));
  assert.equal(vechi.length, 1);
  assert.equal(fs.statSync(path.join(path.dirname(fisier), vechi[0])).mode & 0o777, 0o600);
});
