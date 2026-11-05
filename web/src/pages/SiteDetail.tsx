import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Download, FileKey2, Pencil, Puzzle, Save } from 'lucide-react';
import { api } from '../lib/api';
import { useCatalogCms, useCheieLicente, useCrudMutation, useSite, useStareSites } from '../lib/queries';
import { PageHeader } from '../components/Layout';
import {
  Badge, Button, Card, CardTitle, ErrorBlock, Field, Input, LoadingBlock, Modal, Select, useToast,
} from '../components/ui';
import { formatDateTime } from '../lib/format';
import { cn } from '../lib/cn';
import type { CatalogCms, CmsSite, LicentaEmisa, PluginCms, StarePlugin } from '../lib/types';
import { CopyButton, SiteForm, StareBadge } from './Sites';

const STARI: { value: StarePlugin; label: string; activ: string }[] = [
  { value: 'pornit', label: 'Pornit', activ: 'bg-emerald-500 text-white' },
  { value: 'se_opreste', label: 'Se oprește', activ: 'bg-amber-500 text-white' },
  { value: 'oprit', label: 'Oprit', activ: 'bg-slate-500 text-white' },
];

function StareSelector({ value, onChange }: { value: StarePlugin; onChange: (v: StarePlugin) => void }) {
  return (
    <div className="inline-flex shrink-0 gap-1 rounded-2xl bg-slate-100 p-1">
      {STARI.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onChange(s.value)}
          className={cn(
            'rounded-xl px-2.5 py-1.5 text-xs font-semibold transition',
            value === s.value ? s.activ : 'text-slate-500 hover:bg-white hover:text-slate-700',
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** Ce lipsește ca pluginul să meargă (o listă în listă = „cel puțin unul dintre”) */
function dependenteLipsa(plugin: PluginCms, stari: Record<string, StarePlugin>, nume: (k: string) => string): string[] {
  const activ = (k: string) => (stari[k] ?? 'oprit') !== 'oprit';
  return plugin.necesita
    .filter((n) => (Array.isArray(n) ? !n.some(activ) : !activ(n)))
    .map((n) => (Array.isArray(n) ? `unul dintre ${n.map(nume).join(' / ')}` : nume(n)));
}

/** Presetările: pachetele de abonament și listele site-urilor existente */
function presetari(catalog: CatalogCms) {
  return [
    ...Object.entries(catalog.pachete).map(([cheie, p]) => ({
      value: `pachet:${cheie}`,
      label: `Pachetul „${p.nume}”`,
      pluginuri: [...p.pluginuri, ...p.cel_putin_una_din],
    })),
    ...Object.entries(catalog.licente_dev).map(([cheie, lista]) => ({
      value: `site:${cheie}`,
      label: `Ca site-ul vechi ${cheie}`,
      pluginuri: lista,
    })),
  ];
}

function LicentaGenerata({ site, licenta }: { site: CmsSite; licenta: LicentaEmisa }) {
  const href = `/api/sites/${site.id}/licente/${licenta.id}/licenta.json`;
  return (
    <a href={href} download="licenta.json">
      <Button size="sm" variant="secondary" icon={<Download className="h-3.5 w-3.5" />}>licenta.json</Button>
    </a>
  );
}

function GenereazaModal({
  site,
  dirty,
  onSave,
  onClose,
}: {
  site: CmsSite;
  dirty: boolean;
  onSave: () => Promise<void>;
  onClose: () => void;
}) {
  const toast = useToast();
  const ultima = site.licenses[0]?.version ?? 0;
  const [versiune, setVersiune] = useState(String(ultima + 1));
  const [error, setError] = useState('');
  const [emisa, setEmisa] = useState<LicentaEmisa | null>(null);
  const mutation = useCrudMutation((v: number) => api.post<LicentaEmisa>(`/sites/${site.id}/licente`, { versiune: v }));

  return (
    <Modal open onClose={onClose} title={emisa ? 'Licența e gata' : 'Generezi licența?'}>
      {emisa ? (
        <div className="flex flex-col gap-4 text-sm text-slate-600">
          <p>
            Licența <strong>v{emisa.version}</strong> pentru <span className="font-mono">{site.slug}</span>, cu{' '}
            {Object.keys(emisa.plugins).length} pluginuri active, a fost semnată.
          </p>
          <div>
            <a href={`/api/sites/${site.id}/licente/${emisa.id}/licenta.json`} download="licenta.json">
              <Button icon={<Download className="h-4 w-4" />}>Descarcă licenta.json</Button>
            </a>
          </div>
          <p className="text-xs text-slate-500">
            Fișierul merge pe server în <span className="font-mono">~/domains/{site.domain || '<domeniu>'}/site/storage/licenta/licenta.json</span>.
            Nu e secret; pașii sunt în README („Cum pui licența pe site”).
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            Se semnează lista de pluginuri {dirty ? <strong>(după ce salvez modificările de acum)</strong> : 'salvată'} pentru site-ul{' '}
            <span className="font-mono">{site.slug}</span>.
          </p>
          <Field
            label="Versiunea"
            hint={`Crește la fiecare licență; site-ul refuză o versiune mai mică decât ultima primită${ultima ? ` (ultima: v${ultima})` : ''}.`}
          >
            <Input type="number" min={ultima + 1} value={versiune} onChange={(e) => setVersiune(e.target.value)} className="w-40" />
          </Field>
          {error && <ErrorBlock message={error} />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Anulează</Button>
            <Button
              loading={mutation.isPending}
              icon={<FileKey2 className="h-4 w-4" />}
              onClick={async () => {
                setError('');
                const v = Number(versiune);
                if (!Number.isInteger(v) || v <= ultima) return setError(`Versiunea trebuie să fie un număr mai mare decât ${ultima}.`);
                try {
                  if (dirty) await onSave();
                  setEmisa(await mutation.mutateAsync(v));
                  toast('Licență generată');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Eroare la generare');
                }
              }}
            >
              Generează licența
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function SiteDetail() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { data: site, isLoading, error } = useSite(id);
  const { data: catalog } = useCatalogCms();
  const { data: cheie } = useCheieLicente();
  const stare = useStareSites(Boolean(site?.domain));
  const [stari, setStari] = useState<Record<string, StarePlugin>>({});
  const [preset, setPreset] = useState('');
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const save = useCrudMutation((plugins: Record<string, StarePlugin>) => api.put<CmsSite>(`/sites/${id}`, { plugins }));

  useEffect(() => {
    if (site) setStari(site.plugins);
  }, [site]);

  const nume = useMemo(() => {
    const harta = new Map((catalog?.pluginuri ?? []).map((p) => [p.cheie, p.nume]));
    return (k: string) => harta.get(k) ?? k;
  }, [catalog]);

  if (isLoading || !catalog) return <LoadingBlock />;
  if (error || !site) return <ErrorBlock message={error instanceof Error ? error.message : 'Site-ul nu a fost găsit'} />;

  const curat = (s: Record<string, StarePlugin>) =>
    JSON.stringify(Object.fromEntries(Object.entries(s).filter(([, v]) => v !== 'oprit').sort()));
  const dirty = curat(stari) !== curat(site.plugins);
  const ultima = site.licenses[0];
  const active = Object.values(stari).filter((v) => v !== 'oprit').length;

  const salveaza = async () => {
    await save.mutateAsync(stari);
  };

  return (
    <div className="animate-fade-up">
      <Link to="/site-uri" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Înapoi la site-uri
      </Link>
      <PageHeader
        title={site.name}
        subtitle={[site.domain || 'fără domeniu', `slug: ${site.slug}`, site.client ? site.client.company || site.client.name : '']
          .filter(Boolean)
          .join(' · ')}
      >
        {site.domain && <StareBadge stare={stare.data?.[site.id]} />}
        <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Editează</Button>
      </PageHeader>

      {site.notes && <Card className="mb-4 whitespace-pre-wrap text-sm text-slate-600">{site.notes}</Card>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle
            icon={<Puzzle className="h-5 w-5" />}
            title="Pluginuri"
            subtitle={`${active} active din ${catalog.pluginuri.length} · catalogul CMS de la ${catalog.sursa.commit}`}
            action={
              <Button size="sm" icon={<Save className="h-3.5 w-3.5" />} disabled={!dirty} loading={save.isPending}
                onClick={async () => {
                  try {
                    await salveaza();
                    toast('Pluginuri salvate');
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Eroare la salvare', 'error');
                  }
                }}
              >
                Salvează
              </Button>
            }
          />

          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Pornește de la o presetare (opțional)" className="flex-1">
              <Select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                options={[{ value: '', label: '— alege —' }, ...presetari(catalog).map((p) => ({ value: p.value, label: p.label }))]}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={!preset}
              onClick={() => {
                const ales = presetari(catalog).find((p) => p.value === preset);
                if (!ales) return;
                setStari(Object.fromEntries(ales.pluginuri.map((k) => [k, 'pornit' as StarePlugin])));
                toast('Presetare aplicată; verifică lista și salvează');
              }}
            >
              Aplică
            </Button>
          </div>
          <p className="mb-4 text-xs text-slate-400">
            Presetarea înlocuiește toată lista: ce e în ea devine „Pornit”, restul „Oprit”. La pachetul Magazin sunt pornite toate
            plățile cu cardul; lasă doar ce folosește clientul.
          </p>

          <div className="flex flex-col divide-y divide-slate-100">
            {catalog.pluginuri.map((plugin) => {
              const valoare = stari[plugin.cheie] ?? 'oprit';
              const lipsa = valoare !== 'oprit' ? dependenteLipsa(plugin, stari, nume) : [];
              const fostPornit = ultima?.plugins[plugin.cheie] === 'pornit';
              const directOprit = plugin.bani && fostPornit && valoare === 'oprit';
              return (
                <div key={plugin.cheie} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{plugin.nume}</p>
                      <span className="font-mono text-[11px] text-slate-400">{plugin.cheie}</span>
                      {plugin.bani && <Badge className="bg-emerald-50 text-emerald-700">bani</Badge>}
                      {plugin.intern && <Badge className="bg-slate-100 text-slate-500">intern ANDAXI</Badge>}
                      {plugin.client && <Badge className="bg-violet-50 text-violet-700">făcut pentru un client</Badge>}
                      {!plugin.portat && <Badge className="bg-amber-50 text-amber-700">încă neportat</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{plugin.descriere}</p>
                    {lipsa.length > 0 && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> Are nevoie de: {lipsa.join(', ')}
                      </p>
                    )}
                    {directOprit && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                        <AlertTriangle className="h-3.5 w-3.5" /> Atinge bani: lasă-l întâi cel puțin 30 de zile pe „Se oprește”.
                      </p>
                    )}
                  </div>
                  <StareSelector value={valoare} onChange={(v) => setStari((prev) => ({ ...prev, [plugin.cheie]: v }))} />
                </div>
              );
            })}
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardTitle icon={<FileKey2 className="h-5 w-5" />} title="Licența" subtitle="Fișierul licenta.json, semnat de CRM" />
            {!cheie?.exista ? (
              <p className="text-sm text-slate-600">
                Întâi generează perechea de chei, din pagina <Link to="/site-uri" className="font-semibold text-indigo-600">Site-uri</Link>.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <Button icon={<FileKey2 className="h-4 w-4" />} onClick={() => setGenerating(true)}>
                  {dirty ? 'Salvează și generează licența' : 'Generează licența'}
                </Button>
                {ultima && (
                  <p className="text-xs text-slate-500">
                    Ultima: v{ultima.version}, {formatDateTime(ultima.issuedAt)}
                  </p>
                )}
                <div>
                  <p className="label-base">Cheia publică (--cheie-licenta=)</p>
                  <code className="block select-all break-all rounded-2xl bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">
                    {cheie.cheiePublica}
                  </code>
                  <div className="mt-2"><CopyButton text={cheie.cheiePublica ?? ''} /></div>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardTitle title="Licențe emise" subtitle="Cine, când și cu ce pluginuri" />
            {site.licenses.length === 0 ? (
              <p className="text-sm text-slate-500">Nicio licență emisă încă.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {site.licenses.map((l) => (
                  <li key={l.id} className="rounded-2xl border border-slate-100 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800">v{l.version}</p>
                      <LicentaGenerata site={site} licenta={l} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(l.issuedAt)} · {l.issuedBy}
                    </p>
                    {cheie?.cheiePublica && l.publicKey !== cheie.cheiePublica && (
                      <p className="mt-1 text-xs font-medium text-amber-700">semnată cu o cheie veche</p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      {Object.entries(l.plugins)
                        .map(([k, v]) => (v === 'se_opreste' ? `${k} (se oprește)` : k))
                        .join(', ') || 'doar nucleul'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {editing && <SiteForm site={site} onClose={() => setEditing(false)} />}
      {generating && <GenereazaModal site={site} dirty={dirty} onSave={salveaza} onClose={() => setGenerating(false)} />}
    </div>
  );
}
