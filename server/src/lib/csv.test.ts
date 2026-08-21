import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeaza, parseCsv, parseData, parseNumar } from './csv.js';

test('citeste CSV cu punct si virgula, cu BOM si cu antet cu diacritice', () => {
  const text = '﻿Data;Ore;Descriere;Etichetă\n21.08.2026;2,5;Actualizare plugin-uri;Mentenanță\n';
  const randuri = parseCsv(text);

  assert.equal(randuri.length, 1);
  assert.equal(randuri[0].data, '21.08.2026');
  assert.equal(randuri[0].ore, '2,5');
  assert.equal(randuri[0].eticheta, 'Mentenanță');
});

test('citeste si CSV cu virgula ca separator', () => {
  const randuri = parseCsv('data,ore,descriere\n2026-08-21,3,Ceva\n');
  assert.equal(randuri[0].descriere, 'Ceva');
});

test('respecta ghilimelele, inclusiv separatorul din text', () => {
  const randuri = parseCsv('data;ore;descriere\n21.08.2026;1;"Bug la ""Stoc ofertă""; rezolvat"\n');
  assert.equal(randuri[0].descriere, 'Bug la "Stoc ofertă"; rezolvat');
});

test('liniile goale se ignora', () => {
  assert.equal(parseCsv('data;ore\n\n21.08.2026;1\n\n').length, 1);
});

test('numere cu virgula sau punct zecimal', () => {
  assert.equal(parseNumar('2,5'), 2.5);
  assert.equal(parseNumar('2.5'), 2.5);
  assert.equal(parseNumar(' 3 '), 3);
  assert.equal(parseNumar('abc'), null);
  assert.equal(parseNumar(''), null);
});

test('date in format romanesc sau ISO', () => {
  assert.equal(parseData('21.08.2026'), '2026-08-21');
  assert.equal(parseData('5/3/2026'), '2026-03-05');
  assert.equal(parseData('2026-08-21'), '2026-08-21');
  assert.equal(parseData('31.02.2026'), null);
  assert.equal(parseData('maine'), null);
});

test('normalizarea scapa de diacritice si majuscule', () => {
  assert.equal(normalizeaza('Etichetă'), 'eticheta');
  assert.equal(normalizeaza('DESCRIERE'), 'descriere');
  assert.equal(normalizeaza('Ținta'), 'tinta');
});
