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
 * Aparari: doar HTTPS in productie (antetul pus de nginx); o limita larga pe IP
 * inainte de autentificare (toate site-urile unei gazduiri pleaca de pe acelasi IP),
 * una pe site dupa ce cheia se potriveste si una stransa pentru cheile gresite (care
 * nu refuza niciodata o cheie buna); comparatia cheii in timp constant,
 * cheia niciodata in jurnal. Fiecare preluare se scrie in jurnal si pe site
 * (ultima preluare: cand, ce versiune, de la ce IP).
 */
import { Router, type Request, type Response } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/errors.js';
import { env } from '../env.js';
import { cheiaSePotriveste, cheieIp, citesteCheie, creeazaFereastra, ipClient } from '../lib/site-api.js';

export const siteApiRouter = Router();

/**
 * Inainte de autentificare, pe IP (IPv6 pe /64): larga, fiindca toate site-urile de pe
 * o gazduire comuna (Hostinger) pleaca de pe acelasi IP.
 */
export const limitaIp = creeazaFereastra(300, 10 * 60_000);
/** Dupa ce cheia se potriveste, pe site: un cron la 5 minute plus „Verifica acum" ajung din plin */
export const limitaSite = creeazaFereastra(30, 10 * 60_000);
/** Cheile gresite: 10 in 15 minute pe IP; apoi o cheie gresita primeste 429, una buna trece */
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
    const cheieLimita = cheieIp(ip);
    const asteptareIp = limitaIp.cerere(cheieLimita);
    if (asteptareIp > 0) {
      console.log(`[licente] preluare refuzata (prea multe cereri de pe IP) de la ${ip}`);
      return refuza(res, 429, 'Prea multe cereri. Incearca mai tarziu.', asteptareIp);
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
      // dupa prea multe chei gresite de pe acelasi IP: 429 (fara sa spuna daca si asta era gresita)
      const asteptareEsecuri = limitaEsecuri.asteptare(cheieLimita) || limitaEsecuri.cerere(cheieLimita);
      console.log(`[licente] preluare refuzata (cheie ${cheie ? 'gresita' : 'lipsa sau fara forma'}) de la ${ip}`);
      if (asteptareEsecuri > 0) return refuza(res, 429, 'Prea multe cereri. Incearca mai tarziu.', asteptareEsecuri);
      return refuza(res, 401, 'Cheie lipsa sau gresita.');
    }
    const asteptareSite = limitaSite.cerere(site.id);
    if (asteptareSite > 0) {
      console.log(`[licente] preluare ${site.slug} refuzata (prea multe cereri pentru site) de la ${ip}`);
      return refuza(res, 429, 'Prea multe cereri. Incearca mai tarziu.', asteptareSite);
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
