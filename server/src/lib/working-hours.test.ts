import test from 'node:test';
import assert from 'node:assert/strict';
import { termenOreDeLucru, ORE_RASPUNS } from './working-hours.js';

const PROGRAM = { standardStart: 9 * 60, standardEnd: 16 * 60 }; // 09:00–16:00, 7h pe zi

/** Ora Romaniei a unui moment, ca sa verificam usor in teste */
function oraRomaniei(d: Date): string {
  return d.toLocaleString('ro-RO', {
    timeZone: 'Europe/Bucharest',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Un moment scris in ora Romaniei (vara, deci UTC+3) */
function momentVara(zi: string, ora: string): Date {
  return new Date(`${zi}T${ora}:00+03:00`);
}

test('două ore de lucru într-o zi obișnuită se adună simplu', () => {
  // miercuri, 5 august 2026, ora 10:00
  const termen = termenOreDeLucru(momentVara('2026-08-05', '10:00'), 2, PROGRAM);
  assert.match(oraRomaniei(termen), /05\.08.*12:00/);
});

test('ceasul nu merge după program: ce rămâne trece în ziua următoare', () => {
  // miercuri la 15:00, mai e o oră de program; încă două ore înseamnă mâine la 10:00
  const termen = termenOreDeLucru(momentVara('2026-08-05', '15:00'), 3, PROGRAM);
  assert.match(oraRomaniei(termen), /06\.08.*11:00/);
});

test('o cerere trimisă seara începe a doua zi dimineața', () => {
  // marți la 21:00 → ceasul pornește miercuri la 09:00; 4 ore = miercuri 13:00
  const termen = termenOreDeLucru(momentVara('2026-08-04', '21:00'), 4, PROGRAM);
  assert.match(oraRomaniei(termen), /05\.08.*13:00/);
});

test('weekendul nu se pune la socoteală', () => {
  // vineri, 7 august 2026, ora 15:00 → mai e o oră vineri, restul luni
  const termen = termenOreDeLucru(momentVara('2026-08-07', '15:00'), 3, PROGRAM);
  assert.match(oraRomaniei(termen), /10\.08.*11:00/, 'luni, 10 august');
});

test('o cerere trimisă sâmbăta are termenul de luni', () => {
  const termen = termenOreDeLucru(momentVara('2026-08-08', '12:00'), 2, PROGRAM);
  assert.match(oraRomaniei(termen), /10\.08.*11:00/);
});

test('intervenția normală: 24 de ore de lucru înseamnă trei zile și jumătate', () => {
  // luni 10 august, 09:00 → 7h/zi: luni, marți, miercuri = 21h; mai rămân 3h joi
  const termen = termenOreDeLucru(momentVara('2026-08-10', '09:00'), ORE_RASPUNS.NORMAL, PROGRAM);
  assert.match(oraRomaniei(termen), /13\.08.*12:00/, 'joi, 13 august, la prânz');
});

test('intervenția rapidă: 12 ore de lucru înseamnă a doua zi', () => {
  // luni 10 august, 09:00 → 7h luni + 5h marți
  const termen = termenOreDeLucru(momentVara('2026-08-10', '09:00'), ORE_RASPUNS.URGENT, PROGRAM);
  assert.match(oraRomaniei(termen), /11\.08.*14:00/);
});
