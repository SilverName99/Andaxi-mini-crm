import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateMonth, allocateTimeline, includedMinutesForMonth, monthsBetween, packageMinutesForMonth,
  type AllocatableLog,
} from './hours.js';
import { applyDiscount } from './discount.js';

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

/* ─────────────────────────────────── pachete de ore preplatite ──────────── */

const pachet = { hoursPerMonth: 10 };

test('pachetul preplatit acopera orele ramase dupa cele incluse', () => {
  // 2 ore incluse + pachet de 10 ore; se lucreaza 5 ore
  const rezultat = allocateMonth(
    [log({ id: 'a', standardMinutes: 300, amountEur: 175, standardRate: 35 })],
    120,
    0,
    600,
  );

  const a = rezultat.allocations.get('a')!;
  assert.equal(a.includedStandardMinutes, 120);
  assert.equal(a.packageStandardMinutes, 180);
  assert.equal(a.billableEur, 0); // totul e deja platit
  assert.equal(rezultat.packageClosingMinutes, 420); // 10 h − 3 h consumate
});

test('ce depaseste pachetul se factureaza la tariful pachetului', () => {
  // fara ore incluse, pachet de 1 ora, se lucreaza 3 ore la 35 €/h
  const rezultat = allocateMonth(
    [log({ id: 'a', standardMinutes: 180, amountEur: 105, standardRate: 35 })],
    0,
    0,
    60,
  );

  assert.equal(rezultat.allocations.get('a')!.billableEur, 70); // 2 h × 35 €
  assert.equal(rezultat.packageClosingMinutes, 0);
});

test('o ora de noapte consuma dublu si din pachet', () => {
  const rezultat = allocateMonth(
    [log({ id: 'noapte', standardMinutes: 0, offHoursMinutes: 120, amountEur: 140, offHoursRate: 70 })],
    0,
    0,
    120,
  );

  const a = rezultat.allocations.get('noapte')!;
  assert.equal(a.packageOffHoursMinutes, 60);
  assert.equal(a.billableEur, 70);
});

test('soldul neconsumat se reporteaza in luna urmatoare', () => {
  const abonamente = [
    {
      clientId: 'c1',
      status: 'ACTIVE',
      startDate: '2026-01-01',
      endDate: null,
      includedHoursPerMonth: 0,
      hourPackage: pachet,
    },
  ];

  // ianuarie: nimic lucrat → 10 h raman; februarie: 12 h lucrate
  const rezultat = allocateTimeline(
    [
      {
        ...log({ id: 'feb', standardMinutes: 720, amountEur: 252, standardRate: 21 }),
        date: '2026-02-10',
        clientId: 'c1',
      },
    ],
    abonamente,
  );

  const ianuarie = rezultat.byClientMonth.get('c1|2026-01')!;
  assert.equal(ianuarie.packageClosingMinutes, 600);

  const februarie = rezultat.byClientMonth.get('c1|2026-02')!;
  assert.equal(februarie.packageOpeningMinutes, 600);
  assert.equal(februarie.packageCreditedMinutes, 600);
  assert.equal(februarie.packageUsedMinutes, 720);
  assert.equal(februarie.packageClosingMinutes, 480); // 20 h primite − 12 h consumate
  assert.equal(rezultat.byLog.get('feb')!.billableEur, 0);
});

test('creditul lunar vine doar din pachetele active in luna', () => {
  const abonamente = [
    { status: 'ACTIVE', startDate: '2026-03-01', endDate: null, hourPackage: pachet },
    { status: 'CANCELLED', startDate: '2026-01-01', endDate: null, hourPackage: pachet },
  ];
  assert.equal(packageMinutesForMonth(abonamente, '2026-02'), 0);
  assert.equal(packageMinutesForMonth(abonamente, '2026-03'), 600);
});

test('lunile dintre doua capete', () => {
  assert.deepEqual(monthsBetween('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(monthsBetween('2026-05', '2026-05'), ['2026-05']);
});

/* ─────────────────────────────────────────── reducerea pe luna ──────────── */

test('reducerea procentuala si cea in suma fixa', () => {
  assert.deepEqual(applyDiscount(1000, { type: 'PERCENT', value: 10 }), { discountEur: 100, netEur: 900 });
  assert.deepEqual(applyDiscount(1000, { type: 'AMOUNT', value: 150 }), { discountEur: 150, netEur: 850 });
});

test('reducerea nu poate depasi suma de facturat', () => {
  assert.deepEqual(applyDiscount(200, { type: 'AMOUNT', value: 500 }), { discountEur: 200, netEur: 0 });
  assert.deepEqual(applyDiscount(200, { type: 'PERCENT', value: 150 }), { discountEur: 200, netEur: 0 });
});

test('fara reducere sau cu valoare zero, suma ramane neatinsa', () => {
  assert.deepEqual(applyDiscount(315, null), { discountEur: 0, netEur: 315 });
  assert.deepEqual(applyDiscount(315, { type: 'PERCENT', value: 0 }), { discountEur: 0, netEur: 315 });
});

test('pe zero nu se aplica nimic', () => {
  assert.deepEqual(applyDiscount(0, { type: 'PERCENT', value: 10 }), { discountEur: 0, netEur: 0 });
});

test('orele marcate "incluse in pachet" consuma credit, dar nu se factureaza', () => {
  const rezultat = allocateMonth(
    [
      // 1 ora declarata inclusa: gratuita, dar mananca din cele 2 ore incluse
      log({ id: 'inclusa', date: '2026-07-02', billable: false, includedInPackage: true }),
      // 2 ore obisnuite: doar prima mai prinde credit, a doua se factureaza
      log({ id: 'normala', date: '2026-07-05', standardMinutes: 120, amountEur: 90 }),
    ],
    120, // 2 ore incluse
  );

  assert.equal(rezultat.allocations.get('inclusa')!.billableEur, 0);
  assert.equal(rezultat.allocations.get('inclusa')!.includedStandardMinutes, 60);
  assert.equal(rezultat.allocations.get('inclusa')!.billableStandardMinutes, 0);
  assert.equal(rezultat.allocations.get('normala')!.includedStandardMinutes, 60);
  assert.equal(rezultat.billableEur, 45); // o singura ora ramane de facturat
  assert.equal(rezultat.coveredEur, 90); // ora declarata inclusa + ora acoperita din abonament
  assert.equal(rezultat.remainingMinutes, 0);
});

test('orele "incluse in pachet" raman gratuite si dupa epuizarea creditului', () => {
  const rezultat = allocateMonth(
    [log({ id: 'peste', standardMinutes: 180, amountEur: 135, billable: false, includedInPackage: true })],
    60, // o singura ora inclusa
  );

  const a = rezultat.allocations.get('peste')!;
  assert.equal(a.includedStandardMinutes, 60);
  assert.equal(a.billableStandardMinutes, 0);
  assert.equal(rezultat.billableEur, 0);
  assert.equal(rezultat.remainingMinutes, 0);
});

test('munca din curtoazie (nefacturabila, fara bifa de pachet) nu atinge creditul', () => {
  const rezultat = allocateMonth(
    [
      log({ id: 'curtoazie', date: '2026-07-02', billable: false }),
      log({ id: 'normala', date: '2026-07-05' }),
    ],
    60,
  );

  assert.equal(rezultat.allocations.get('curtoazie')!.includedStandardMinutes, 0);
  assert.equal(rezultat.allocations.get('normala')!.includedStandardMinutes, 60);
  assert.equal(rezultat.billableEur, 0);
  assert.equal(rezultat.remainingMinutes, 0);
});

test('orele puse pe un abonament cu ore platite scad din rezervorul lui', () => {
  const abonament = {
    clientId: 'c1',
    label: 'biovitality.ro',
    status: 'ACTIVE',
    startDate: '2026-01-01',
    endDate: null,
    includedHoursPerMonth: 0,
    paidHours: 10,
  };

  const rezultat = allocateTimeline(
    [
      { ...log({ id: 'a', date: '2026-07-03', standardMinutes: 240, amountEur: 180 }), clientId: 'c1', projectTag: 'biovitality.ro' },
      // lucrare pe alt abonament: nu atinge rezervorul
      { ...log({ id: 'b', date: '2026-07-05', standardMinutes: 60 }), clientId: 'c1', projectTag: 'alt-site.ro' },
    ],
    [abonament],
  );

  assert.equal(rezultat.byLog.get('a')!.billableEur, 0, 'cele 4 ore intra in rezervor');
  assert.equal(rezultat.byLog.get('a')!.paidStandardMinutes, 240);
  assert.equal(rezultat.byLog.get('b')!.billableEur, 45, 'lucrarea de pe alt abonament se factureaza');

  const sold = rezultat.paidPools.get('c1')!.get('biovitality.ro')!;
  assert.equal(sold.totalMinutes, 600);
  assert.equal(sold.usedMinutes, 240);
  assert.equal(sold.remainingMinutes, 360, 'au mai ramas 6 ore');
});

test('orele din afara programului consuma dublu din rezervorul abonamentului', () => {
  const rezultat = allocateTimeline(
    [
      {
        ...log({ id: 'noapte', date: '2026-07-03', standardMinutes: 0, offHoursMinutes: 120, amountEur: 180 }),
        clientId: 'c1',
        projectTag: 'site.ro',
      },
    ],
    [
      {
        clientId: 'c1',
        label: 'site.ro',
        status: 'ACTIVE',
        startDate: '2026-01-01',
        endDate: null,
        includedHoursPerMonth: 0,
        paidHours: 10,
      },
    ],
  );

  const sold = rezultat.paidPools.get('c1')!.get('site.ro')!;
  assert.equal(sold.usedMinutes, 240, 'doua ore de noapte consuma patru din rezervor');
  assert.equal(sold.remainingMinutes, 360);
  assert.equal(rezultat.byLog.get('noapte')!.billableEur, 0);
});

test('ce depaseste rezervorul abonamentului se factureaza normal', () => {
  const rezultat = allocateTimeline(
    [
      {
        ...log({ id: 'lunga', date: '2026-07-03', standardMinutes: 300, amountEur: 225 }),
        clientId: 'c1',
        projectTag: 'site.ro',
      },
    ],
    [
      {
        clientId: 'c1',
        label: 'site.ro',
        status: 'ACTIVE',
        startDate: '2026-01-01',
        endDate: null,
        includedHoursPerMonth: 0,
        paidHours: 2,
      },
    ],
  );

  const alocare = rezultat.byLog.get('lunga')!;
  assert.equal(alocare.paidStandardMinutes, 120, 'doua ore din rezervor');
  assert.equal(alocare.billableStandardMinutes, 180, 'trei ore raman de facturat');
  assert.equal(alocare.billableEur, 135); // 3 × 45
  assert.equal(rezultat.paidPools.get('c1')!.get('site.ro')!.remainingMinutes, 0);
});

test('rezervorul nu se reincarca: se consuma peste luni, in ordine', () => {
  const abonament = {
    clientId: 'c1',
    label: 'site.ro',
    status: 'ACTIVE',
    startDate: '2026-01-01',
    endDate: null,
    includedHoursPerMonth: 0,
    paidHours: 5,
  };
  const orePe = (id: string, date: string, minute: number) => ({
    ...log({ id, date, standardMinutes: minute, amountEur: (minute / 60) * 45 }),
    clientId: 'c1',
    projectTag: 'site.ro',
  });

  const rezultat = allocateTimeline(
    [orePe('iulie', '2026-07-10', 180), orePe('august', '2026-08-10', 180)],
    [abonament],
  );

  assert.equal(rezultat.byLog.get('iulie')!.billableEur, 0, 'primele 3 ore incap in rezervor');
  assert.equal(rezultat.byLog.get('august')!.paidStandardMinutes, 120, 'in august mai erau doar 2 ore');
  assert.equal(rezultat.byLog.get('august')!.billableEur, 45, 'ora ramasa se factureaza');
  assert.equal(rezultat.paidPools.get('c1')!.get('site.ro')!.remainingMinutes, 0);
});
