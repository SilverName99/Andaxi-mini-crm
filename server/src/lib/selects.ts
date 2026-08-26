/**
 * Campurile de client trimise alaturi de alte inregistrari (abonamente, ore,
 * pozitii de facturat): exact cat ii trebuie interfetei ca sa deseneze avatarul
 * si numele. Tinute intr-un singur loc, ca sigla sa apara peste tot deodata.
 */
export const CLIENT_REF = {
  id: true,
  name: true,
  company: true,
  color: true,
  logoUrl: true,
} as const;
