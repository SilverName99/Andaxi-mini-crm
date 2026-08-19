import test from 'node:test';
import assert from 'node:assert/strict';
import { splitWorkInterval, toRon, type RateConfig } from './rates.js';
import { addMonths, diffDays, endOfMonth, hhMmToMinutes, minutesToHhMm, monthRange } from './dates.js';
import { monthlyEquivalent, nextDue, periodEnd } from './cycles.js';
import { computeSubscriptionPrice, isPerUserProduct, pricePerUser } from './pricing.js';

const config: RateConfig = {
  standardRate: 45,
  offHoursRate: 90,
  standardStart: 9 * 60,
  standardEnd: 16 * 60,
  weekendOffHours: false,
};

// 2026-03-04 este miercuri, 2026-03-07 sambata
test('interval integral in fereastra standard', () => {
  const r = splitWorkInterval('2026-03-04', 10 * 60, 13 * 60, config);
  assert.equal(r.standardMinutes, 180);
  assert.equal(r.offHoursMinutes, 0);
  assert.equal(r.amountEur, 135);
});

test('interval integral in afara ferestrei standard', () => {
  const r = splitWorkInterval('2026-03-04', 19 * 60, 21 * 60, config);
  assert.equal(r.standardMinutes, 0);
  assert.equal(r.offHoursMinutes, 120);
  assert.equal(r.amountEur, 180);
});

test('interval care iese din fereastra standard se imparte corect', () => {
  const r = splitWorkInterval('2026-03-04', 15 * 60, 18 * 60, config);
  assert.equal(r.standardMinutes, 60);
  assert.equal(r.offHoursMinutes, 120);
  assert.equal(r.amountEur, 45 + 180);
});

test('interval care intra in fereastra standard dimineata', () => {
  const r = splitWorkInterval('2026-03-04', 8 * 60, 10 * 60 + 30, config);
  assert.equal(r.standardMinutes, 90);
  assert.equal(r.offHoursMinutes, 60);
  assert.equal(r.amountEur, 67.5 + 90);
});

test('interval peste miezul noptii acopera si fereastra zilei urmatoare', () => {
  // 22:00 -> 10:00 = 11h majorat (22-09) + 1h standard (09-10)
  const r = splitWorkInterval('2026-03-04', 22 * 60, 10 * 60, config);
  assert.equal(r.totalMinutes, 12 * 60);
  assert.equal(r.standardMinutes, 60);
  assert.equal(r.offHoursMinutes, 11 * 60);
});

test('weekendOffHours taxeaza intreaga zi de sambata la tarif majorat', () => {
  const weekend = { ...config, weekendOffHours: true };
  const r = splitWorkInterval('2026-03-07', 10 * 60, 12 * 60, weekend);
  assert.equal(r.standardMinutes, 0);
  assert.equal(r.offHoursMinutes, 120);
  assert.equal(r.amountEur, 180);
});

test('fara weekendOffHours, sambata se taxeaza ca zi normala', () => {
  const r = splitWorkInterval('2026-03-07', 10 * 60, 12 * 60, config);
  assert.equal(r.standardMinutes, 120);
  assert.equal(r.amountEur, 90);
});

test('conversie EUR -> RON', () => {
  assert.equal(toRon(45, 5.08), 228.6);
});

test('addMonths face clamp la finalul lunii', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2026-03-15', 12), '2027-03-15');
  assert.equal(addMonths('2026-08-19', 6), '2027-02-19');
});

test('helperi de date', () => {
  assert.equal(diffDays('2026-03-01', '2026-03-15'), 14);
  assert.equal(endOfMonth('2026-02-10'), '2026-02-28');
  assert.deepEqual(monthRange('2026-01-20', '2026-04-02'), ['2026-01', '2026-02', '2026-03', '2026-04']);
  assert.equal(minutesToHhMm(570), '09:30');
  assert.equal(hhMmToMinutes('09:30'), 570);
  assert.equal(hhMmToMinutes('24:00'), 1440);
  assert.throws(() => hhMmToMinutes('9:5'));
});

test('cicluri de facturare', () => {
  assert.equal(nextDue('2026-01-15', 'MONTHLY'), '2026-02-15');
  assert.equal(nextDue('2026-01-15', 'SEMIANNUAL'), '2026-07-15');
  assert.equal(nextDue('2026-01-15', 'ANNUAL'), '2027-01-15');
  assert.equal(periodEnd('2026-01-15', 'MONTHLY'), '2026-02-14');
  assert.equal(monthlyEquivalent(600, 'ANNUAL'), 50);
  assert.equal(monthlyEquivalent(300, 'SEMIANNUAL'), 50);
});

/* ─────────────────────────────── preturi pe utilizator (ERP / CRM) ───────── */

const pricing = {
  erpTier1Max: 5, erpTier1Price: 50, erpTier2Max: 10, erpTier2Price: 45, erpTier3Price: 40,
  crmTier1Max: 5, crmTier1Price: 50, crmTier2Max: 10, crmTier2Price: 45, crmTier3Price: 40,
  discountSemiannual: 5, discountAnnual: 10,
};

test('pragurile de pret dupa numarul de utilizatori', () => {
  assert.equal(pricePerUser(pricing, 'ERP', 1), 50);
  assert.equal(pricePerUser(pricing, 'ERP', 5), 50);
  assert.equal(pricePerUser(pricing, 'ERP', 6), 45);
  assert.equal(pricePerUser(pricing, 'ERP', 10), 45);
  assert.equal(pricePerUser(pricing, 'ERP', 11), 40);
  assert.equal(pricePerUser(pricing, 'CRM', 25), 40);
});

test('pretul abonamentului pe utilizatori, cu reducerea pe ciclu', () => {
  // 5 utilizatori × 50 € × 12 luni − 10% = 2.700 €
  const anual = computeSubscriptionPrice(pricing, 'ERP', 'ANNUAL', 5);
  assert.equal(anual.amountEur, 2700);
  assert.equal(anual.fullEur, 3000);
  assert.equal(anual.monthlyEur, 225);

  // fara reducere la plata lunara
  assert.equal(computeSubscriptionPrice(pricing, 'ERP', 'MONTHLY', 5).amountEur, 250);

  // 6 luni: 5 × 50 × 6 − 5% = 1.425 €
  assert.equal(computeSubscriptionPrice(pricing, 'CRM', 'SEMIANNUAL', 5).amountEur, 1425);

  // pragul al doilea: 8 utilizatori × 45 € × 1 luna
  assert.equal(computeSubscriptionPrice(pricing, 'ERP', 'MONTHLY', 8).amountEur, 360);

  // pragul al treilea: 12 × 40 × 12 − 10%
  assert.equal(computeSubscriptionPrice(pricing, 'ERP', 'ANNUAL', 12).amountEur, 5184);
});

test('produsele cu pret pe utilizator sunt recunoscute', () => {
  assert.equal(isPerUserProduct('ERP'), true);
  assert.equal(isPerUserProduct('CRM'), true);
  assert.equal(isPerUserProduct('ECOMMERCE'), false);
});
