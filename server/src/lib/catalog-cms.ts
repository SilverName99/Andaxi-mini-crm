/**
 * Catalogul pluginurilor CMS-ului, copiat din andaxi-cms/config/plugins.php in
 * server/catalog/cms-pluginuri.json. Se reface cu:
 *
 *   php server/scripts/catalog-cms.php <dosarul andaxi-cms> > server/catalog/cms-pluginuri.json
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface PluginCms {
  cheie: string;
  nume: string;
  descriere: string;
  /** O lista in lista = „cel putin unul dintre" */
  necesita: (string | string[])[];
  bani: boolean;
  intern: boolean;
  client: boolean;
  portat: boolean;
}

export interface PachetCms {
  nume: string;
  pluginuri: string[];
  cel_putin_una_din: string[];
  optionale: string[];
}

export interface CatalogCms {
  sursa: { repo: string; ramura: string; commit: string; generat_la: string };
  pluginuri: PluginCms[];
  pachete: Record<string, PachetCms>;
  licente_dev: Record<string, string[]>;
}

// aceeasi cale relativa din src/lib si din dist/lib
const FISIER = fileURLToPath(new URL('../../catalog/cms-pluginuri.json', import.meta.url));

let cache: CatalogCms | null = null;

export function catalogCms(): CatalogCms {
  if (!cache) cache = JSON.parse(fs.readFileSync(FISIER, 'utf8')) as CatalogCms;
  return cache;
}

export function cheiCatalog(): string[] {
  return catalogCms().pluginuri.map((p) => p.cheie);
}
