import test from 'node:test';
import assert from 'node:assert/strict';
import { creeazaLimitator, genereazaPin, genereazaToken, signPortalSession, verifyPortalSession } from './portal.js';

test('tokenul de portal e lung si diferit de fiecare data', () => {
  const a = genereazaToken();
  const b = genereazaToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 43, 'tokenul trebuie sa aiba minimum 256 de biti');
  assert.match(a, /^[A-Za-z0-9_-]+$/, 'fara caractere care se pierd la copy/paste');
});

test('PIN-ul are 6 cifre si acopera toate cifrele', () => {
  const cifre = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    const pin = genereazaPin();
    assert.match(pin, /^\d{6}$/);
    for (const c of pin) cifre.add(c);
  }
  assert.equal(cifre.size, 10, 'generatorul nu trebuie sa ocoleasca vreo cifra');
});

test('sesiunea de portal se verifica, dar un token strain nu trece', () => {
  const token = signPortalSession({ portalId: 'p1', clientId: 'c1' });
  assert.deepEqual(verifyPortalSession(token), { portalId: 'p1', clientId: 'c1' });
  assert.equal(verifyPortalSession('ceva.inventat.aici'), null);
});

test('un token de administrare nu deschide portalul', async () => {
  const { signToken } = await import('../middleware/auth.js');
  const tokenAdmin = signToken({ id: 'u1', email: 'a@b.ro', name: 'Admin' });
  assert.equal(verifyPortalSession(tokenAdmin), null);
});

test('limitatorul blocheaza dupa cinci PIN-uri gresite', () => {
  const limitator = creeazaLimitator(5, 60_000);
  const t0 = 1_000_000;

  for (let i = 0; i < 4; i += 1) {
    limitator.esec('portal', t0);
    assert.equal(limitator.asteptare('portal', t0), 0, 'primele patru greseli nu blocheaza');
  }

  limitator.esec('portal', t0);
  assert.equal(limitator.asteptare('portal', t0), 60, 'a cincea greseala blocheaza un minut');

  // dupa trecerea ferestrei se poate incerca din nou
  assert.equal(limitator.asteptare('portal', t0 + 61_000), 0);
});

test('PIN-ul corect sterge istoricul de greseli', () => {
  const limitator = creeazaLimitator(2, 60_000);
  limitator.esec('portal');
  limitator.reset('portal');
  limitator.esec('portal');
  assert.equal(limitator.asteptare('portal'), 0);
});
