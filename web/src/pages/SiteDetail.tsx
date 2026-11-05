import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Award, Boxes, CalendarClock, Cloud, CreditCard, Database, Download, FileKey2,
  FileQuestion, FileSignature, Gift, HeartHandshake, Import, Landmark, LineChart, Link2, Mail, Megaphone,
  MessageCircle, Newspaper, Package, Pencil, PersonStanding, Puzzle, Save, ShoppingCart, Star, Tag, Ticket, Truck,
  UserCircle, Users, type LucideIcon,
} from 'lucide-react';
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
  { value: 'pornit', label: 'Pornit', activ: 'bg-emerald-500 text-white shadow-sm' },
  { value: 'se_opreste', label: 'Se oprește', activ: 'bg-amber-500 text-white shadow-sm' },
  { value: 'oprit', label: 'Oprit', activ: 'bg-slate-500 text-white shadow-sm' },
];

/** Culoarea cardului după stare: verde pornit, chihlimbar se oprește, gri oprit */
const ASPECT: Record<StarePlugin, { card: string; iconita: string }> = {
  pornit: { card: 'border-emerald-300 bg-emerald-50/70', iconita: 'bg-emerald-500 text-white' },
  se_opreste: { card: 'border-amber-300 bg-amber-50/70', iconita: 'bg-amber-500 text-white' },
  oprit: { card: 'border-slate-200 bg-white', iconita: 'bg-slate-100 text-slate-400' },
};

/**
 * Doar pentru afișare: iconița și zona fiecărui plugin. Un plugin nou din catalog,
 * care nu e aici, apare la „Altele”, cu iconița de puzzle.
 */
const GRUPURI = [
  'Magazin & plăți', 'Livrare', 'Marketing', 'Conținut', 'Clienți', 'Interne / făcute pentru un client', 'Altele',
] as const;
type Grup = (typeof GRUPURI)[number];

const ASEZARE: Record<string, { grup: Grup; iconita: LucideIcon }> = {
  catalog: { grup: 'Magazin & plăți', iconita: Package },
  magazin: { grup: 'Magazin & plăți', iconita: ShoppingCart },
  plata_stripe: { grup: 'Magazin & plăți', iconita: CreditCard },
  plata_euplatesc: { grup: 'Magazin & plăți', iconita: CreditCard },
  plata_bt: { grup: 'Magazin & plăți', iconita: Landmark },
  link_plata: { grup: 'Magazin & plăți', iconita: Link2 },
  erp: { grup: 'Magazin & plăți', iconita: Database },
  precomenzi: { grup: 'Magazin & plăți', iconita: CalendarClock },
  oferte_bbd: { grup: 'Magazin & plăți', iconita: Tag },
  produse_promo: { grup: 'Magazin & plăți', iconita: Gift },
  pachete_produse: { grup: 'Magazin & plăți', iconita: Boxes },
  cereri_oferta: { grup: 'Magazin & plăți', iconita: FileQuestion },
  livrare_fan: { grup: 'Livrare', iconita: Truck },
  cupoane: { grup: 'Marketing', iconita: Ticket },
  fidelitate: { grup: 'Marketing', iconita: Award },
  recenzii: { grup: 'Marketing', iconita: Star },
  newsletter: { grup: 'Marketing', iconita: Mail },
  campanii: { grup: 'Marketing', iconita: Megaphone },
  blog: { grup: 'Conținut', iconita: Newspaper },
  chat_live: { grup: 'Conținut', iconita: MessageCircle },
  conturi_clienti: { grup: 'Clienți', iconita: UserCircle },
  donatii: { grup: 'Clienți', iconita: HeartHandshake },
  membri: { grup: 'Clienți', iconita: Users },
  fisiere_cloud: { grup: 'Interne / făcute pentru un client', iconita: Cloud },
  concurenta: { grup: 'Interne / făcute pentru un client', iconita: LineChart },
  manechin: { grup: 'Interne / făcute pentru un client', iconita: PersonStanding },
  acorduri_gdpr: { grup: 'Interne / făcute pentru un client', iconita: FileSignature },
  migrare_wordpress: { grup: 'Interne / făcute pentru un client', iconita: Import },
};

function asezare(plugin: PluginCms): { grup: Grup; iconita: LucideIcon } {
  const gasit = ASEZARE[plugin.cheie];
  if (plugin.intern || plugin.client) {
    return { grup: 'Interne / făcute pentru un client', iconita: gasit?.iconita ?? Puzzle };
  }
  return gasit ?? { grup: 'Altele', iconita: Puzzle };
}

function StareSelector({ value, onChange, nume }: { value: StarePlugin; onChange: (v: StarePlugin) => void; nume: string }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-900/5 p-1" role="radiogroup" aria-label={`Starea: ${nume}`}>
      {STARI.map((s) => (
        <button
          key={s.value}
          type="button"
          role="radio"
          aria-checked={value === s.value}
          onClick={() => onChange(s.value)}
          className={cn(
            'rounded-xl px-1 py-1.5 text-xs font-semibold transition',
            value === s.value ? s.activ : 'text-slate-500 hover:bg-white hover:text-slate-700',
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function PluginCard({
  plugin,
  valoare,
  lipsa,
  directOprit,
  onChange,
}: {
  plugin: PluginCms;
  valoare: StarePlugin;
  lipsa: string[];
  directOprit: boolean;
  onChange: (v: StarePlugin) => void;
}) {
  const Iconita = asezare(plugin).iconita;
  return (
    <div className={cn('flex min-w-0 flex-col gap-3 rounded-3xl border-2 p-4 transition', ASPECT[valoare].card)}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-2xl transition', ASPECT[valoare].iconita)}>
          <Iconita className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-slate-800">{plugin.nume}</p>
          <p className="break-all font-mono text-[11px] text-slate-400">{plugin.cheie}</p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">{plugin.descriere}</p>
      {(plugin.bani || plugin.intern || plugin.client || !plugin.portat) && (
        <div className="flex flex-wrap gap-1.5">
          {plugin.bani && <Badge className="bg-emerald-100 text-emerald-700">bani</Badge>}
          {plugin.intern && <Badge className="bg-slate-200 text-slate-600">intern ANDAXI</Badge>}
          {plugin.client && <Badge className="bg-violet-100 text-violet-700">făcut pentru un client</Badge>}
          {!plugin.portat && <Badge className="bg-amber-100 text-amber-800">încă neportat</Badge>}
        </div>
      )}
      {lipsa.length > 0 && (
        <p className="flex items-start gap-1 text-xs font-medium text-amber-700">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> Are nevoie de: {lipsa.join(', ')}
        </p>
      )}
      {directOprit && (
        <p className="flex items-start gap-1 text-xs font-medium text-red-600">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> Atinge bani: lasă-l întâi cel puțin 30 de zile pe „Se oprește”.
        </p>
      )}
      <div className="mt-auto">
        <StareSelector value={valoare} onChange={onChange} nume={plugin.nume} />
      </div>
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
  const salveazaCuMesaj = async () => {
    try {
      await salveaza();
      toast('Pluginuri salvate');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Eroare la salvare', 'error');
    }
  };
  const aplicaPreset = () => {
    const ales = presetari(catalog).find((p) => p.value === preset);
    if (!ales) return;
    setStari(Object.fromEntries(ales.pluginuri.map((k) => [k, 'pornit' as StarePlugin])));
    toast('Presetare aplicată; verifică lista și salvează');
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardTitle
              icon={<Puzzle className="h-5 w-5" />}
              title="Pluginuri"
              subtitle={`catalogul CMS de la ${catalog.sursa.commit}`}
              action={
                <span className="whitespace-nowrap rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">
                  {active} active din {catalog.pluginuri.length}
                </span>
              }
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label="Pornește de la o presetare (opțional)" className="min-w-0 flex-1">
                <Select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                  options={[{ value: '', label: '— alege —' }, ...presetari(catalog).map((p) => ({ value: p.value, label: p.label }))]}
                />
              </Field>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={!preset} onClick={aplicaPreset}>Aplică</Button>
                <Button icon={<Save className="h-4 w-4" />} disabled={!dirty} loading={save.isPending} onClick={salveazaCuMesaj}>
                  Salvează
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Presetarea înlocuiește toată lista: ce e în ea devine „Pornit”, restul „Oprit”. La pachetul Magazin sunt pornite
              toate plățile cu cardul; lasă doar ce folosește clientul.
            </p>
          </Card>

          {GRUPURI.map((grup) => {
            const dinGrup = catalog.pluginuri.filter((p) => asezare(p).grup === grup);
            if (dinGrup.length === 0) return null;
            const activeGrup = dinGrup.filter((p) => (stari[p.cheie] ?? 'oprit') !== 'oprit').length;
            return (
              <section key={grup}>
                <h2 className="mb-2 flex items-baseline gap-2 px-1 text-sm font-bold text-slate-700">
                  {grup}
                  <span className="text-xs font-semibold text-slate-400">{activeGrup} din {dinGrup.length}</span>
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {dinGrup.map((plugin) => {
                    const valoare = stari[plugin.cheie] ?? 'oprit';
                    return (
                      <PluginCard
                        key={plugin.cheie}
                        plugin={plugin}
                        valoare={valoare}
                        lipsa={valoare !== 'oprit' ? dependenteLipsa(plugin, stari, nume) : []}
                        directOprit={plugin.bani && ultima?.plugins[plugin.cheie] === 'pornit' && valoare === 'oprit'}
                        onChange={(v) => setStari((prev) => ({ ...prev, [plugin.cheie]: v }))}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

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

      {dirty && (
        <>
          {/* loc sub ultimul card, ca bara să nu-l acopere */}
          <div className="h-24" />
          {/* in body: animatia paginii (transform) ar lega altfel „fixed” de pagina, nu de ecran */}
          {createPortal(
          <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-3xl bg-slate-900 px-4 py-3 text-white shadow-soft sm:px-5">
            <p className="min-w-0 text-sm font-semibold">
              Modificări nesalvate <span className="font-normal text-slate-300">· {active} active</span>
            </p>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="ghost" className="text-slate-200 hover:bg-white/10" onClick={() => setStari(site.plugins)}>
                Renunță
              </Button>
              <Button size="sm" icon={<Save className="h-3.5 w-3.5" />} loading={save.isPending} onClick={salveazaCuMesaj}>
                Salvează
              </Button>
            </div>
          </div>,
          document.body,
          )}
        </>
      )}

      {editing && <SiteForm site={site} onClose={() => setEditing(false)} />}
      {generating && <GenereazaModal site={site} dirty={dirty} onSave={salveaza} onClose={() => setGenerating(false)} />}
    </div>
  );
}
