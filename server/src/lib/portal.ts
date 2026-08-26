import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';

/** Cookie-ul de sesiune al clientului; separat de cel de administrare */
export const PORTAL_COOKIE = 'andaxi_portal';

/** Cat tine sesiunea din portal, in zile */
export const PORTAL_SESSION_DAYS = 14;

export interface PortalSession {
  portalId: string;
  clientId: string;
}

/** Partea secreta din link: 32 de bytes aleatori, fara caractere care se pierd la copy/paste */
export function genereazaToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** PIN de 6 cifre, generat uniform (fara bias-ul lui % 10) */
export function genereazaPin(): string {
  let pin = '';
  while (pin.length < 6) {
    const octet = crypto.randomBytes(1)[0];
    if (octet < 250) pin += String(octet % 10); // 250 = 25 × 10, deci ramane uniform
  }
  return pin;
}

/**
 * Semnam sesiunea de portal cu acelasi secret, dar cu un tip propriu: un token
 * de administrare nu trebuie sa deschida portalul si nici invers.
 */
export function signPortalSession(session: PortalSession): string {
  return jwt.sign({ ...session, typ: 'portal' }, env.jwtSecret, {
    expiresIn: `${PORTAL_SESSION_DAYS}d`,
  });
}

export function verifyPortalSession(token: string): PortalSession | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload & PortalSession & { typ?: string };
    if (payload.typ !== 'portal' || !payload.portalId || !payload.clientId) return null;
    return { portalId: payload.portalId, clientId: payload.clientId };
  } catch {
    return null;
  }
}

export interface Limitator {
  /** Cate secunde mai are de asteptat; 0 daca poate incerca */
  asteptare(cheie: string, acum?: number): number;
  /** Inregistreaza o incercare gresita si spune cate mai are voie */
  esec(cheie: string, acum?: number): { incercariRamase: number };
  reset(cheie: string): void;
}

/**
 * Limitator simplu pentru incercarile de PIN. Un PIN are un milion de
 * combinatii, deci fara asa ceva se ghiceste in cateva minute.
 */
export function creeazaLimitator(maxIncercari = 5, fereastraMs = 15 * 60_000): Limitator {
  const incercari = new Map<string, { esecuri: number; pana: number }>();

  return {
    asteptare(cheie, acum = Date.now()) {
      const stare = incercari.get(cheie);
      if (!stare) return 0;
      if (acum >= stare.pana) {
        incercari.delete(cheie);
        return 0;
      }
      if (stare.esecuri < maxIncercari) return 0;
      return Math.ceil((stare.pana - acum) / 1000);
    },
    esec(cheie, acum = Date.now()) {
      const stare = incercari.get(cheie);
      const actual = stare && acum < stare.pana ? stare : { esecuri: 0, pana: acum + fereastraMs };
      actual.esecuri += 1;
      actual.pana = acum + fereastraMs; // fiecare greseala amana din nou
      incercari.set(cheie, actual);
      return { incercariRamase: Math.max(0, maxIncercari - actual.esecuri) };
    },
    reset(cheie) {
      incercari.delete(cheie);
    },
  };
}
