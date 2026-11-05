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

  const stare = genereazaPereche({ rotatie: false });
  assert.equal(stare.exista, true);
  assert.equal(fs.statSync(fisier).mode & 0o777, 0o600);
  assert.equal(Buffer.from(stare.cheiePublica!, 'base64').length, 32);
  assert.equal(cheiePublicaBase64(cheiePrivata()), stare.cheiePublica);
  // starea trimisa interfetei nu contine nimic din fisierul privat
  const pem = fs.readFileSync(fisier, 'utf8');
  const corp = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
  assert.ok(!JSON.stringify(stare).includes(corp));

  assert.throws(() => genereazaPereche({ rotatie: false }), /Exista deja/);
  assert.equal(stareCheie().cheiePublica, stare.cheiePublica);

  // rotatie fara cheia de acum sau cu alta cheie: refuzata, nimic schimbat
  assert.throws(() => genereazaPereche({ rotatie: true }), /schimbata intre timp/);
  assert.throws(() => genereazaPereche({ rotatie: true, cheieAsteptata: 'altceva' }), /schimbata intre timp/);
  assert.equal(stareCheie().cheiePublica, stare.cheiePublica);

  const noua = genereazaPereche({ rotatie: true, cheieAsteptata: stare.cheiePublica! });
  assert.notEqual(noua.cheiePublica, stare.cheiePublica);
  assert.deepEqual(noua.cheiVechi.map((c) => c.cheiePublica), [stare.cheiePublica]);
  const vechi = fs.readdirSync(path.dirname(fisier)).filter((n) => n.endsWith('.pem.veche'));
  assert.equal(vechi.length, 1);
  assert.equal(fs.statSync(path.join(path.dirname(fisier), vechi[0])).mode & 0o777, 0o600);
});

test('rotatia: o a doua cerere cu aceeasi cheie veche nu roteste inca o data; lacatul tine', () => {
  const inainte = stareCheie();
  const veche = inainte.cheiePublica!;
  const prima = genereazaPereche({ rotatie: true, cheieAsteptata: veche });
  // al doilea clic (sau a doua fereastra) vine cu aceeasi cheie veche
  assert.throws(() => genereazaPereche({ rotatie: true, cheieAsteptata: veche }), /schimbata intre timp/);
  assert.equal(stareCheie().cheiePublica, prima.cheiePublica);
  assert.equal(stareCheie().cheiVechi.length, inainte.cheiVechi.length + 1);

  // alt proces tine lacatul: refuz, fara nicio schimbare
  const lacat = path.join(path.dirname(fisier), '.chei.lock');
  fs.writeFileSync(lacat, '');
  assert.throws(() => genereazaPereche({ rotatie: true, cheieAsteptata: prima.cheiePublica! }), /Se genereaza deja/);
  assert.equal(stareCheie().cheiePublica, prima.cheiePublica);
  // un lacat uitat de mult (proces oprit brusc) nu mai blocheaza
  const demult = new Date(Date.now() - 60 * 60_000);
  fs.utimesSync(lacat, demult, demult);
  const aDoua = genereazaPereche({ rotatie: true, cheieAsteptata: prima.cheiePublica! });
  assert.notEqual(aDoua.cheiePublica, prima.cheiePublica);
  assert.equal(fs.existsSync(lacat), false);

  // nimic temporar ramas, totul 0600
  for (const nume of fs.readdirSync(path.dirname(fisier))) {
    assert.ok(!nume.endsWith('.tmp'), nume);
    assert.equal(fs.statSync(path.join(path.dirname(fisier), nume)).mode & 0o777, 0o600, nume);
  }
  // fisierul cheii ramane PEM PKCS#8, la aceeasi cale
  assert.match(fs.readFileSync(fisier, 'utf8'), /^-----BEGIN PRIVATE KEY-----\n/);
});
