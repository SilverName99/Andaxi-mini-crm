import nodemailer from 'nodemailer';
import { getSettings } from '../prisma.js';

export interface Email {
  to: string;
  subject: string;
  /** Textul simplu; e si varianta de rezerva pentru clientii de email fara HTML */
  text: string;
  html?: string;
  replyTo?: string;
}

/**
 * Adresa de la care pleaca emailul, cu numele in fata: „Andaxi Web Solutions
 * <contact@andaxi.ro>". Fara nume, clientii de email arata doar partea din
 * fata adresei („contact"), care nu spune nimanui cine scrie.
 */
function expeditor(settings: {
  smtpUser: string;
  smtpFrom: string;
  smtpFromName?: string;
  companyName?: string;
}): string {
  const adresa = settings.smtpFrom || settings.smtpUser;
  const nume = (settings.smtpFromName || settings.companyName || '').trim();
  // JSON.stringify pune ghilimelele si scapa ce trebuie (virgule, ghilimele)
  return nume ? `${JSON.stringify(nume)} <${adresa}>` : adresa;
}

/** Setarile SMTP sunt complete? Fara ele nu incercam sa trimitem nimic. */
export function poateTrimite(settings: { smtpHost: string; smtpUser: string; smtpPass: string }): boolean {
  return Boolean(settings.smtpHost && settings.smtpUser && settings.smtpPass);
}

function transport(settings: {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
}) {
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: { user: settings.smtpUser, pass: settings.smtpPass },
  });
}

/**
 * Trimite un email cu setarile din aplicatie. Nu arunca niciodata: daca SMTP-ul
 * nu e configurat sau serverul de mail refuza, aplicatia merge mai departe si
 * doar notam in log — o cerere din portal nu trebuie sa cada din cauza postei.
 */
export async function trimiteEmail(email: Email): Promise<{ trimis: boolean; eroare?: string }> {
  const settings = await getSettings();
  if (!poateTrimite(settings)) return { trimis: false, eroare: 'SMTP neconfigurat' };

  try {
    await transport(settings).sendMail({
      from: expeditor(settings),
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      replyTo: email.replyTo,
    });
    return { trimis: true };
  } catch (err) {
    const eroare = err instanceof Error ? err.message : 'Eroare necunoscuta';
    console.error('[email] nu am putut trimite:', eroare);
    return { trimis: false, eroare };
  }
}

/** Verifica datele SMTP fara sa salveze nimic (butonul „Trimite un email de test") */
export async function trimiteTest(
  settings: {
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
    smtpFromName: string;
    companyName: string;
  },
  catre: string,
): Promise<void> {
  await transport(settings).sendMail({
    from: expeditor(settings),
    to: catre,
    subject: `Test SMTP — ${settings.companyName}`,
    text: 'Dacă ai primit acest mesaj, setările SMTP din mini-CRM funcționează.',
    html: '<p>Dacă ai primit acest mesaj, setările SMTP din mini-CRM funcționează.</p>',
  });
}

/** Sablon simplu, ca emailurile sa arate a ceva, nu a text gol */
export function sablonEmail(titlu: string, randuri: string[], buton?: { text: string; url: string }): string {
  const corp = randuri.map((r) => `<p style="margin:0 0 10px;color:#334155">${r}</p>`).join('');
  const actiune = buton
    ? `<p style="margin:18px 0 0"><a href="${buton.url}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:600">${buton.text}</a></p>`
    : '';

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px">
  <h2 style="margin:0 0 14px;color:#0f172a;font-size:18px">${titlu}</h2>
  ${corp}${actiune}
</div>`;
}
