import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateMonth, includedMinutesForMonth, type AllocatableLog } from './hours.js';

function log(partial: Partial<AllocatableLog> & { id: string }): AllocatableLog {
  return {
    date: '2026-07-03',
    startMinutes: 600,
    standardMinutes: 60,
    offHoursMinutes: 0,
    standardRate: 45,
    offHoursRate: 90,
    amountEur: 45,
    billable: true,
    manualAmount: false,
    ...partial,
  };
}

test('orele incluse acopera primele interventii, in ordine cronologica', () => {
  const rezultat = allocateMonth(
    [
      log({ id: 'a', date: '2026-07-03' }),
      log({ id: 'b', date: '2026-07-08' }),
      log({ id: 'c', date: '2026-07-12', standardMinutes: 120, amountEur: 90 }),
    ],
    120, // 2 ore incluse
  );

  assert.equal(rezultat.allocations.get('a')!.billableEur, 0);
  assert.equal(rezultat.allocations.get('b')!.billableEur, 0);
  assert.equal(rezultat.allocations.get('c')!.billableEur, 90);
  assert.equal(rezultat.billableEur, 90);
  assert.equal(rezultat.coveredEur, 90);
  assert.equal(rezultat.remainingMinutes, 0);
});

test('luna din exemplul real: 9 ore lucrate, 2 incluse, 7 de facturat', () => {
  const rezultat = allocateMonth(
    [
      log({ id: '1', date: '2026-07-02', standardMinutes: 60, amountEur: 45 }),
      log({ id: '2', date: '2026-07-06', standardMinutes: 60, amountEur: 45 }),
      log({ id: '3', date: '2026-07-09', standardMinutes: 120, amountEur: 90 }),
      log({ id: '4', date: '2026-07-15', standardMinutes: 120, amountEur: 90 }),
      log({ id: '5', date: '2026-07-21', standardMinutes: 180, amountEur: 135 }),
    ],
    120,
  );

  assert.equal(rezultat.billableEur, 315); // 7 ore × 45 €
  assert.equal(rezultat.coveredEur, 90);
  assert.equal(rezultat.grossEur, 405);
});

test('o ora in afara programului consuma dublu din orele incluse', () => {
  // 2 ore incluse (120 minute credit) și o interventie de 2 ore noaptea:
  // creditul acopera doar o ora, cealalta se factureaza la 90 €
  const rezultat = allocateMonth(
    [log({ id: 'noapte', standardMinutes: 0, offHoursMinutes: 120, amountEur: 180 })],
    120,
  );

  const alocare = rezultat.allocations.get('noapte')!;
  assert.equal(alocare.includedOffHoursMinutes, 60);
  assert.equal(alocare.billableOffHoursMinutes, 60);
  assert.equal(alocare.billableEur, 90);
  assert.equal(rezultat.remainingMinutes, 0);
});

test('in aceeasi interventie se acopera intai orele normale', () => {
  // 15:00–18:00 = 1h normal + 2h majorat, cu 2 ore incluse:
  // 60 min normale (credit 60) + 30 min de noapte (credit 60) = 90 € acoperiti
  const rezultat = allocateMonth(
    [log({ id: 'mixt', standardMinutes: 60, offHoursMinutes: 120, amountEur: 225 })],
    120,
  );

  const alocare = rezultat.allocations.get('mixt')!;
  assert.equal(alocare.includedStandardMinutes, 60);
  assert.equal(alocare.includedOffHoursMinutes, 30);
  assert.equal(alocare.billableEur, 135);
  assert.equal(rezultat.coveredEur, 90);
});

test('interventiile nefacturabile sau cu suma manuala nu consuma orele incluse', () => {
  const rezultat = allocateMonth(
    [
      log({ id: 'gratis', billable: false, amountEur: 45 }),
      log({ id: 'negociat', manualAmount: true, amountEur: 30 }),
      log({ id: 'normal', date: '2026-07-20' }),
    ],
    60,
  );

  assert.equal(rezultat.allocations.get('gratis')!.billableEur, 0);
  assert.equal(rezultat.allocations.get('negociat')!.billableEur, 30);
  assert.equal(rezultat.allocations.get('normal')!.billableEur, 0); // acoperit de ora inclusa
  assert.equal(rezultat.billableEur, 30);
});

test('creditul neconsumat ramane raportat in rezultat', () => {
  const rezultat = allocateMonth([log({ id: 'a', standardMinutes: 30, amountEur: 22.5 })], 120);
  assert.equal(rezultat.usedMinutes, 30);
  assert.equal(rezultat.remainingMinutes, 90);
});

test('orele incluse se aduna doar din abonamentele active in luna', () => {
  const abonamente = [
    { includedHoursPerMonth: 2, status: 'ACTIVE', startDate: '2026-01-01', endDate: null },
    { includedHoursPerMonth: 1, status: 'PAUSED', startDate: '2026-01-01', endDate: null },
    { includedHoursPerMonth: 5, status: 'ACTIVE', startDate: '2026-09-01', endDate: null },
    { includedHoursPerMonth: 3, status: 'ACTIVE', startDate: '2025-01-01', endDate: '2026-06-30' },
  ];

  assert.equal(includedMinutesForMonth(abonamente, '2026-07'), 120);
  assert.equal(includedMinutesForMonth(abonamente, '2026-09'), 420);
});
