/**
 * API-ul pe care il cheama site-urile CMS (nu contul de administrare):
 *
 *   GET /api/site/licenta
 *   Authorization: Bearer <cheia site-ului>      (LICENTA_CHEIE din .env-ul site-ului)
 *
 * Raspunsul e licenta curenta a site-ului (cea mai mare versiune), exact textul
 * semnat, neschimbat. Site-ul o accepta doar daca semnatura Ed25519 se verifica
 * (scripts/licenta-sincronizare.php din CMS); cheia doar spune ce site intreaba.
 *
 * Aparari: doar HTTPS in productie (antetul pus de nginx), limita de cereri pe IP
 * (si una mai stransa pentru cheile gresite), comparatia cheii in timp constant,
 * cheia niciodata in jurnal. Fiecare preluare se scrie in jurnal si pe site
 * (ultima preluare: cand, ce versiune, de la ce IP).
 */
import { Router, type Request, type Response } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { env } from '../env.js';
import { cheiaSePotriveste, citesteCheie, creeazaFereastra, ipClient } from '../lib/site-api.js';

export const siteApiRouter = Router();

/** Un cron la 5 minute plus „Verifica acum" din admin: 30 de cereri in 10 minute ajung din plin */
export const limitaCereri = creeazaFereastra(30, 10 * 60_000);
/** Cheile gresite: 10 in 15 minute pe IP, apoi 429 */
export const limitaEsecuri = creeazaFereastra(10, 15 * 60_000);

function refuza(res: Response, status: number, mesaj: string, asteptare = 0): void {
  if (asteptare > 0) res.setHeader('Retry-After', String(asteptare));
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json({ error: mesaj });
}

function esteHttps(req: Request): boolean {
  if (!env.isProduction) return true;
  // nginx pune X-Forwarded-Proto; Node insusi nu vorbeste TLS
  return String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
}

siteApiRouter.get(
  '/licenta',
  asyncHandler(async (req, res) => {
    const ip = ipClient(req.socket.remoteAddress, req.headers['x-real-ip']);
    if (!esteHttps(req)) {
      console.log(`[licente] preluare refuzata (fara HTTPS) de la ${ip}`);
      return refuza(res, 403, 'Doar prin HTTPS.');
    }
    const asteptareEsecuri = limitaEsecuri.asteptare(ip);
    const asteptare = asteptareEsecuri || limitaCereri.cerere(ip);
    if (asteptare > 0) {
      console.log(`[licente] preluare refuzata (prea multe cereri) de la ${ip}`);
      return refuza(res, 429, 'Prea multe cereri. Incearca mai tarziu.', asteptare);
    }

    const cheie = citesteCheie(req.headers.authorization);
    const site = cheie
      ? await prisma.cmsSite.findUnique({
          where: { id: cheie.siteId },
          select: { id: true, slug: true, fetchKeyHash: true },
        })
      : null;
    // comparatia se face si cand site-ul nu exista (cu un hash fix), ca timpul sa nu spuna nimic
    if (!cheie || !cheiaSePotriveste(cheie.cheie, site?.fetchKeyHash) || !site) {
      limitaEsecuri.cerere(ip);
      console.log(`[licente] preluare refuzata (cheie ${cheie ? 'gresita' : 'lipsa sau fara forma'}) de la ${ip}`);
      return refuza(res, 401, 'Cheie lipsa sau gresita.');
    }

    const licenta = await prisma.cmsLicense.findFirst({
      where: { siteId: site.id },
      orderBy: { version: 'desc' },
      select: { version: true, content: true },
    });
    if (!licenta) {
      console.log(`[licente] preluare ${site.slug}: nicio licenta emisa inca (de la ${ip})`);
      return refuza(res, 404, 'Site-ul nu are inca nicio licenta emisa.');
    }

    await prisma.cmsSite.update({
      where: { id: site.id },
      data: { lastFetchAt: new Date(), lastFetchVersion: licenta.version, lastFetchIp: ip },
    });
    console.log(`[licente] preluare ${site.slug} v${licenta.version} de la ${ip}`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(licenta.content);
  }),
);
