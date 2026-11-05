import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Copy, ExternalLink, Globe, KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import { keys, useCheieLicente, useClients, useCrudMutation, useSites, useStareSites } from '../lib/queries';
import { PageHeader } from '../components/Layout';
import {
  Badge, Button, Card, CardTitle, ConfirmDialog, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, Select,
  Textarea, useToast,
} from '../components/ui';
import { formatDateTime } from '../lib/format';
import type { CmsSite, StareCheie, StareSite } from '../lib/types';
import { useQueryClient } from '@tanstack/react-query';

/* ------------------------------------------------------- formularul site-ului */

export function SiteForm({ site, onClose }: { site?: CmsSite | null; onClose: () => void }) {
  const toast = useToast();
  const { data: clients = [] } = useClients();
  const [form, setForm] = useState({
    name: site?.name ?? '',
    domain: site?.domain ?? '',
    slug: site?.slug ?? '',
    clientId: site?.clientId ?? '',
    notes: site?.notes ?? '',
  });
  const [error, setError] = useState('');
  const mutation = useCrudMutation((data: typeof form) =>
    site ? api.put<CmsSite>(`/sites/${site.id}`, data) : api.post<CmsSite>('/sites', data),
  );
  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const slugBlocat = Boolean(site && site.licenses.length > 0);

  return (
    <Modal open onClose={onClose} title={site ? 'Editează site-ul' : 'Site nou'}>
      <div className="flex flex-col gap-4">
        <Field label="Nume *">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Biovitality" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Domeniu" hint="Fără https://, ex. biovitality.ro">
            <Input value={form.domain} onChange={(e) => set('domain', e.target.value)} placeholder="biovitality.ro" />
          </Field>
          <Field
            label="Slug-ul site-ului în CMS *"
            hint={slugBlocat ? 'Nu se mai schimbă după prima licență.' : 'Ca la deploy: --site=… (ex. biovitality)'}
          >
            <Input
              value={form.slug}
              disabled={slugBlocat}
              onChange={(e) => set('slug', e.target.value.toLowerCase())}
              placeholder="biovitality"
              className="font-mono"
            />
          </Field>
        </div>
        <Field label="Client">
          <Select
            value={form.clientId}
            onChange={(e) => set('clientId', e.target.value)}
            options={[{ value: '', label: '— fără client —' }, ...clients.map((c) => ({ value: c.id, label: c.company || c.name }))]}
          />
        </Field>
        <Field label="Notițe">
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>

      {error && <div className="mt-4"><ErrorBlock message={error} /></div>}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Anulează</Button>
        <Button
          loading={mutation.isPending}
          onClick={async () => {
            setError('');
            if (!form.name.trim()) return setError('Numele este obligatoriu');
            if (!form.slug.trim()) return setError('Slug-ul este obligatoriu');
            try {
              await mutation.mutateAsync({ ...form, clientId: form.clientId || '' });
              toast(site ? 'Site actualizat' : 'Site adăugat');
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Eroare la salvare');
            }
          }}
        >
          {site ? 'Salvează' : 'Adaugă site'}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------- cheia de semnare */

export function CopyButton({ text, label = 'Copiază' }: { text: string; label?: string }) {
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={<Copy className="h-3.5 w-3.5" />}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast('Copiat');
        } catch {
          toast('Nu am putut copia; selectează textul și copiază-l de mână', 'error');
        }
      }}
    >
      {label}
    </Button>
  );
}

const CONFIRMARE_ROTATIE = 'ROTESC CHEIA';

function CheieCard({ stare }: { stare: StareCheie }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmPrima, setConfirmPrima] = useState(false);
  const [rotatie, setRotatie] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const genereaza = async (esteRotatie: boolean) => {
    setError('');
    setLoading(true);
    try {
      await api.post<StareCheie>('/sites/cheie', { rotatie: esteRotatie, confirmare: esteRotatie ? text : '' });
      await queryClient.invalidateQueries({ queryKey: keys.cheieLicente });
      toast(esteRotatie ? 'Cheie nouă generată' : 'Perechea de chei a fost generată');
      setConfirmPrima(false);
      setRotatie(false);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mb-5">
      <CardTitle
        icon={<KeyRound className="h-5 w-5" />}
        title="Cheia de semnare a licențelor"
        subtitle="Cu ea semnează CRM-ul fișierele licenta.json. Site-urile primesc doar cheia publică."
      />

      {!stare.exista ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            Încă nu există o pereche de chei. Se face o singură dată, aici pe server; cheia privată nu pleacă niciodată de pe
            server și nu se vede în pagină.
          </p>
          <div>
            <Button icon={<KeyRound className="h-4 w-4" />} onClick={() => setConfirmPrima(true)}>
              Generează perechea de chei
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="label-base">Cheia publică (pentru --cheie-licenta= și LICENTA_CHEIE_PUBLICA)</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="block flex-1 select-all break-all rounded-2xl bg-slate-100 px-4 py-2.5 font-mono text-sm text-slate-800">
                {stare.cheiePublica}
              </code>
              <CopyButton text={stare.cheiePublica ?? ''} />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Generată pe {formatDateTime(stare.creataLa)} · cheia privată e pe server, în <span className="font-mono">{stare.fisier}</span>
            </p>
          </div>
          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong>Fă o copie a cheii private, pe un stick sau în managerul de parole</strong> (pașii sunt în README, „Cheia de
              semnare”). Dacă se pierde, trebuie generată alta și pusă cheia publică nouă pe <em>fiecare</em> site, apoi
              reemise toate licențele.
            </p>
          </div>
          {stare.cheiVechi.length > 0 && (
            <div>
              <p className="label-base">Chei publice vechi (retrase la o rotație)</p>
              <ul className="flex flex-col gap-1">
                {stare.cheiVechi.map((c) => (
                  <li key={c.cheiePublica} className="break-all font-mono text-xs text-slate-500">
                    {c.cheiePublica} · retrasă {formatDateTime(c.retrasaLa)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={() => setRotatie(true)}
              className="text-xs font-semibold text-red-600 underline-offset-2 hover:underline"
            >
              Generează o cheie nouă (rotație)…
            </button>
          </div>
        </div>
      )}

      <Modal open={confirmPrima} onClose={() => setConfirmPrima(false)} title="Generezi perechea de chei?">
        <p className="text-sm text-slate-600">
          Se face o singură dată. După asta vei vedea cheia publică, de pus pe fiecare site. Nu uita apoi copia de siguranță
          a cheii private (README, „Cheia de semnare”).
        </p>
        {error && <div className="mt-4"><ErrorBlock message={error} /></div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmPrima(false)}>Anulează</Button>
          <Button loading={loading} onClick={() => genereaza(false)}>Generează</Button>
        </div>
      </Modal>

      <Modal open={rotatie} onClose={() => setRotatie(false)} title="Cheie nouă: ești sigur?">
        <div className="flex gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-red-100 text-red-600">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <div className="text-sm text-slate-600">
            <p>
              Cu o cheie nouă, <strong>licențele emise până acum nu se mai pot reînnoi cu cheia veche</strong>. Pe fiecare site
              trebuie pusă cheia publică nouă (pe durata schimbării, ambele chei, separate prin virgulă) și emisă o licență
              nouă.
            </p>
            <p className="mt-2">Cheia veche nu se șterge: rămâne pe server, ca fișier „.pem.veche”.</p>
            <p className="mt-2">
              Scrie <strong className="font-mono">{CONFIRMARE_ROTATIE}</strong> ca să confirmi.
            </p>
          </div>
        </div>
        <Input className="mt-4 font-mono" value={text} onChange={(e) => setText(e.target.value)} placeholder={CONFIRMARE_ROTATIE} />
        {error && <div className="mt-4"><ErrorBlock message={error} /></div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRotatie(false)}>Anulează</Button>
          <Button
            variant="danger"
            loading={loading}
            disabled={text.trim().toUpperCase() !== CONFIRMARE_ROTATIE}
            onClick={() => genereaza(true)}
          >
            Generează cheie nouă
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

/* ---------------------------------------------------------- starea site-ului */

export function StareBadge({ stare }: { stare?: StareSite }) {
  if (!stare) return <Badge className="bg-slate-100 text-slate-400">stare: …</Badge>;
  const titlu = [stare.eroare, stare.cod && `versiune ${stare.cod}`, stare.schema && `schema ${stare.schema}`]
    .filter(Boolean)
    .join(' · ');
  if (stare.stare === 'sus' && stare.mentenanta && stare.mentenanta !== 'nu') {
    return <span title={titlu}><Badge className="bg-amber-100 text-amber-800" dot="bg-amber-500">în mentenanță</Badge></span>;
  }
  if (stare.stare === 'sus') {
    return <span title={titlu}><Badge className="bg-emerald-100 text-emerald-700" dot="bg-emerald-500">merge</Badge></span>;
  }
  if (stare.stare === 'vechi') {
    return <span title={titlu}><Badge className="bg-slate-100 text-slate-600" dot="bg-slate-400">fără ping (cod vechi)</Badge></span>;
  }
  return <span title={titlu}><Badge className="bg-red-100 text-red-700" dot="bg-red-500">nu răspunde</Badge></span>;
}

/* ------------------------------------------------------------------- pagina */

export function Sites() {
  const toast = useToast();
  const { data: sites = [], isLoading, error } = useSites();
  const { data: cheie } = useCheieLicente();
  const stari = useStareSites(sites.some((s) => s.domain));
  const [editing, setEditing] = useState<CmsSite | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<CmsSite | null>(null);
  const remove = useCrudMutation((id: string) => api.del(`/sites/${id}`));

  return (
    <div className="animate-fade-up">
      <PageHeader title="Site-uri" subtitle="Site-urile de pe CMS-ul Andaxi: pluginurile fiecăruia și licența lor">
        {sites.some((s) => s.domain) && (
          <Button
            variant="secondary"
            icon={<RefreshCw className="h-4 w-4" />}
            loading={stari.isFetching}
            onClick={() => stari.refetch()}
          >
            Verifică starea
          </Button>
        )}
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>Site nou</Button>
      </PageHeader>

      {cheie && <CheieCard stare={cheie} />}

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={error instanceof Error ? error.message : 'Eroare la încărcare'} />
      ) : sites.length === 0 ? (
        <EmptyState
          icon={<Globe className="h-6 w-6" />}
          title="Niciun site încă"
          message="Adaugă un site ca să-i alegi pluginurile și să-i generezi licența."
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>Site nou</Button>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {sites.map((site) => {
            const ultima = site.licenses[0];
            const pornite = Object.keys(site.plugins).length;
            return (
              <Card key={site.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <Link to={`/site-uri/${site.id}`} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-slate-800">{site.name}</p>
                    <Badge className="bg-indigo-50 font-mono text-indigo-700">{site.slug}</Badge>
                    {site.client && <Badge>{site.client.company || site.client.name}</Badge>}
                    {site.domain && <StareBadge stare={stari.data?.[site.id]} />}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {site.domain || 'fără domeniu'} · {pornite} {pornite === 1 ? 'plugin' : 'pluginuri'} active ·{' '}
                    {ultima ? `licența v${ultima.version} din ${formatDateTime(ultima.issuedAt)}` : 'nicio licență emisă'}
                  </p>
                  {site.notes && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{site.notes}</p>}
                </Link>
                <div className="flex items-center gap-1">
                  <Link to={`/site-uri/${site.id}`}>
                    <Button size="sm" variant="secondary">Pluginuri și licență</Button>
                  </Link>
                  {site.domain && (
                    <a
                      href={`https://${site.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                      aria-label="Deschide site-ul"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <button onClick={() => setEditing(site)} className="rounded-xl p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600" aria-label="Editează">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleting(site)} className="rounded-xl p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600" aria-label="Șterge">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing !== undefined && <SiteForm site={editing} onClose={() => setEditing(undefined)} />}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Ștergi site-ul?"
        message={`„${deleting?.name}" va fi șters din CRM, împreună cu istoricul licențelor lui (${deleting?.licenses.length ?? 0}). Site-ul în sine și licența pusă pe el nu se schimbă.`}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          toast('Site șters');
          setDeleting(null);
        }}
      />
    </div>
  );
}
