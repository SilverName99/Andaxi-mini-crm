/**
 * Pingul unui site CMS: GET https://<domeniu>/_andaxi/ping (andaxi-cms,
 * docs/DEZVOLTARE.md, „Pingul"): 200 {"ok":true,"db":true,"cod":"<versiune>",
 * "schema":"<stare>","mentenanta":"strict"|"usoara"|"nu"}, 503 {"ok":false,"db":false}
 * fara baza. Un site inca pe codul vechi raspunde 404.
 */
export interface StareSite {
  /** sus = raspunde ok; jos = nu raspunde sau eroare; vechi = fara ping (404, codul de dinainte de CMS) */
  stare: 'sus' | 'jos' | 'vechi';
  http: number | null;
  cod: string | null;
  schema: string | null;
  mentenanta: string | null;
  eroare: string;
  verificatLa: string;
}

const DOMENIU = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export async function pingSite(domeniu: string, timeoutMs = 6000): Promise<StareSite> {
  const verificatLa = new Date().toISOString();
  const gol = { cod: null, schema: null, mentenanta: null, verificatLa };
  if (!DOMENIU.test(domeniu)) return { stare: 'jos', http: null, eroare: 'domeniu invalid', ...gol };

  try {
    const raspuns = await fetch(`https://${domeniu}/_andaxi/ping`, {
      headers: { accept: 'application/json', 'user-agent': 'andaxi-mini-crm/ping' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (raspuns.status === 404) {
      return { stare: 'vechi', http: 404, eroare: 'fara ping (site inca pe codul vechi?)', ...gol };
    }
    let date: Record<string, unknown> = {};
    try {
      date = (await raspuns.json()) as Record<string, unknown>;
    } catch {
      /* raspuns fara JSON */
    }
    const text = (v: unknown) => (typeof v === 'string' ? v : null);
    return {
      stare: raspuns.ok && date.ok === true ? 'sus' : 'jos',
      http: raspuns.status,
      cod: text(date.cod),
      schema: text(date.schema),
      mentenanta: text(date.mentenanta),
      eroare: raspuns.ok ? '' : date.db === false ? 'baza de date nu raspunde' : `HTTP ${raspuns.status}`,
      verificatLa,
    };
  } catch (error) {
    const nume = (error as Error).name;
    return {
      stare: 'jos',
      http: null,
      eroare: nume === 'TimeoutError' ? 'nu raspunde (timeout)' : 'nu se poate conecta',
      ...gol,
    };
  }
}
