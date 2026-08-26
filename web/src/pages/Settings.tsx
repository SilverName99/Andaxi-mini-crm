import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Building2, Clock4, Coins, Image, KeyRound, Moon, Plus, Save, Sun, Trash2, Upload, Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { useCrudMutation, useHourPackages, useSettings } from '../lib/queries';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/Layout';
import { TimeField } from '../components/TimeField';
import { Button, Card, CardTitle, ErrorBlock, Field, Input, LoadingBlock, Toggle, useToast } from '../components/ui';
import { minutesToHhMm } from '../lib/format';
import { citesteImagine, TIPURI_IMAGINE } from '../lib/files';
import type { HourPackage, Settings } from '../lib/types';

function hhMmToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function SettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, isLoading } = useSettings();
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useCrudMutation((payload: Partial<Settings>) => api.put('/settings', payload));

  if (isLoading || !form) return <LoadingBlock />;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  async function submit() {
    if (!form) return;
    setError('');
    if (form.standardEnd <= form.standardStart) {
      setError('Ora de final a programului normal trebuie să fie după ora de început');
      return;
    }
    if (form.erpTier2Max <= form.erpTier1Max || form.crmTier2Max <= form.crmTier1Max) {
      setError('Al doilea prag de utilizatori trebuie să fie mai mare decât primul');
      return;
    }
    try {
      const { id: _id, ...payload } = form;
      await save.mutateAsync(payload);
      toast('Setări salvate');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la salvare');
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader title="Setări" subtitle="Tarife, program de lucru, curs valutar și cont">
        <Button icon={<Save className="h-4 w-4" />} onClick={submit} loading={save.isPending}>
          Salvează setările
        </Button>
      </PageHeader>

      {error && <div className="mb-4"><ErrorBlock message={error} /></div>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle title="Tarife orare" subtitle="Se aplică automat la înregistrarea intervențiilor" icon={<Coins className="h-5 w-5" />} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tarif program normal (EUR/h)">
              <div className="relative">
                <Sun className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
                <Input type="number" min={0} step="0.5" className="pl-10" value={form.standardRate} onChange={(e) => set('standardRate', Number(e.target.value))} />
              </div>
            </Field>
            <Field label="Tarif în afara programului (EUR/h)">
              <div className="relative">
                <Moon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input type="number" min={0} step="0.5" className="pl-10" value={form.offHoursRate} onChange={(e) => set('offHoursRate', Number(e.target.value))} />
              </div>
            </Field>
            <Field label="Program normal de la">
              <TimeField value={minutesToHhMm(form.standardStart)} onChange={(v) => set('standardStart', hhMmToMinutes(v))} />
            </Field>
            <Field label="Program normal până la">
              <TimeField value={minutesToHhMm(form.standardEnd)} onChange={(v) => set('standardEnd', hhMmToMinutes(v))} />
            </Field>
          </div>
          <div className="mt-4">
            <Toggle
              checked={form.weekendOffHours}
              onChange={(value) => set('weekendOffHours', value)}
              label="Weekendul se taxează integral majorat"
              hint="Dacă e activ, sâmbăta și duminica se aplică tariful majorat la orice oră"
            />
          </div>
        </Card>

        <Card>
          <CardTitle title="Monedă, TVA și scadențe" subtitle="Echivalentul în lei, cota de TVA și alertele de facturare" icon={<Coins className="h-5 w-5" />} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Curs EUR → RON" hint="Se folosește doar pentru afișarea echivalentului în lei">
              <Input type="number" min={0} step="0.0001" value={form.eurRon} onChange={(e) => set('eurRon', Number(e.target.value))} />
            </Field>
            <Field label="Cotă TVA (%)" hint="Prețurile din platformă sunt fără TVA; cota se aplică în rapoarte">
              <Input type="number" min={0} max={100} step="0.5" value={form.vatRate} onChange={(e) => set('vatRate', Number(e.target.value))} />
            </Field>
            <Field label="Alertă cu câte zile înainte" hint="Câte zile înainte de scadență apare poziția ca urgentă">
              <Input type="number" min={0} max={90} value={form.billingLeadDays} onChange={(e) => set('billingLeadDays', Number(e.target.value))} />
            </Field>
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-700">Exemplu de calcul</p>
            <p className="mt-1">
              O intervenție de 3 ore, între {minutesToHhMm(form.standardEnd)} și {minutesToHhMm(((form.standardEnd + 180) % 1440))}:
              {' '}<span className="font-bold text-slate-900">{(3 * form.offHoursRate).toFixed(0)} €</span> fără TVA
              {' '}({(3 * form.offHoursRate * form.eurRon).toFixed(0)} RON) · cu TVA{' '}
              <span className="font-bold text-slate-900">
                {(3 * form.offHoursRate * (1 + form.vatRate / 100)).toFixed(0)} €
              </span>
            </p>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardTitle
            title="Prețuri pe utilizator — ERP și CRM"
            subtitle="Se aplică automat când adaugi un abonament de tip ERP sau CRM"
            icon={<Users className="h-5 w-5" />}
          />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <TierEditor titlu="ERP" form={form} set={set} prefix="erp" />
            <TierEditor titlu="CRM" form={form} set={set} prefix="crm" />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Reducere plată la 6 luni (%)">
              <Input type="number" min={0} max={100} step="0.5" value={form.discountSemiannual} onChange={(e) => set('discountSemiannual', Number(e.target.value))} />
            </Field>
            <Field label="Reducere plată anuală (%)">
              <Input type="number" min={0} max={100} step="0.5" value={form.discountAnnual} onChange={(e) => set('discountAnnual', Number(e.target.value))} />
            </Field>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-700">Exemplu</p>
            <p className="mt-1">
              5 utilizatori ERP, plată anuală: 5 × {form.erpTier1Price} € × 12 luni − {form.discountAnnual}% ={' '}
              <span className="font-bold text-slate-900">
                {(5 * form.erpTier1Price * 12 * (1 - form.discountAnnual / 100)).toFixed(0)} €
              </span>
            </p>
          </div>
        </Card>

        <HourPackagesCard />

        <LogoCard logoUrl={form.logoUrl} companyName={form.companyName} />

        <Card>
          <CardTitle title="Date firmă" subtitle="Apar în rapoarte și exporturi" icon={<Building2 className="h-5 w-5" />} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Denumire">
              <Input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
            </Field>
            <Field label="CUI">
              <Input value={form.companyCui} onChange={(e) => set('companyCui', e.target.value)} />
            </Field>
            <Field label="IBAN">
              <Input value={form.companyIban} onChange={(e) => set('companyIban', e.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.companyEmail} onChange={(e) => set('companyEmail', e.target.value)} />
            </Field>
            <Field
              label="Adresa portalului"
              className="sm:col-span-2"
              hint="Domeniul pe care îl primesc clienții, dacă ai unul separat. Gol = același domeniu cu CRM-ul."
            >
              <Input
                value={form.portalBaseUrl}
                onChange={(e) => set('portalBaseUrl', e.target.value)}
                placeholder="https://client.andaxi.ro"
              />
            </Field>
          </div>
        </Card>

        <PasswordCard email={user?.email ?? ''} />
      </div>
    </div>
  );
}

/**
 * Pachetele de ore preplatite: clientul cumpara lunar un numar de ore, la un
 * tarif mai mic. Orele neconsumate se reporteaza in luna urmatoare.
 */
function HourPackagesCard() {
  const toast = useToast();
  const { data: packages = [], isLoading } = useHourPackages();
  const [nou, setNou] = useState<Partial<HourPackage> | null>(null);
  const [error, setError] = useState('');

  const salveaza = useCrudMutation((p: Partial<HourPackage>) =>
    p.id ? api.put(`/hour-packages/${p.id}`, p) : api.post('/hour-packages', p),
  );
  const sterge = useCrudMutation((id: string) => api.del(`/hour-packages/${id}`));

  async function trimite(p: Partial<HourPackage>) {
    setError('');
    if (!p.name?.trim()) return setError('Denumirea pachetului este obligatorie');
    if (!p.hoursPerMonth || p.hoursPerMonth <= 0) return setError('Numărul de ore trebuie să fie mai mare ca 0');
    try {
      await salveaza.mutateAsync(p);
      toast(p.id ? 'Pachet actualizat' : 'Pachet adăugat');
      setNou(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la salvare');
    }
  }

  return (
    <Card className="xl:col-span-2">
      <CardTitle
        title="Pachete de ore preplătite"
        subtitle="Clientul cumpără ore lunar, la tarif redus; orele neconsumate se reportează"
        icon={<Clock4 className="h-5 w-5" />}
        action={
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setNou({ name: '', hoursPerMonth: 10, standardRate: 35, offHoursRate: 70, active: true })}
          >
            Pachet nou
          </Button>
        }
      />

      {isLoading ? (
        <LoadingBlock />
      ) : (
        <div className="flex flex-col gap-3">
          {packages.length === 0 && !nou && (
            <p className="rounded-2xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
              Niciun pachet definit. Fără pachet, clienții plătesc la tarifele standard de mai sus.
            </p>
          )}

          {[...packages, ...(nou ? [nou as HourPackage] : [])].map((pachet, index) => (
            <PackageRow
              key={pachet.id ?? `nou-${index}`}
              pachet={pachet}
              onSave={trimite}
              onDelete={
                pachet.id
                  ? async () => {
                      await sterge.mutateAsync(pachet.id);
                      toast('Pachet șters');
                    }
                  : () => setNou(null)
              }
              saving={salveaza.isPending}
            />
          ))}
        </div>
      )}

      {error && <div className="mt-4"><ErrorBlock message={error} /></div>}
    </Card>
  );
}

/** Un rând editabil din lista de pachete */
function PackageRow({
  pachet,
  onSave,
  onDelete,
  saving,
}: {
  pachet: HourPackage;
  onSave: (p: Partial<HourPackage>) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<HourPackage>(pachet);
  const modificat = JSON.stringify(form) !== JSON.stringify(pachet);
  const set = <K extends keyof HourPackage>(key: K, value: HourPackage[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="grid grid-cols-2 items-end gap-3 rounded-2xl border border-slate-200 p-4 lg:grid-cols-[2fr,1fr,1fr,1fr,auto]">
      <Field label="Denumire">
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Pachet 10 ore" />
      </Field>
      <Field label="Ore / lună">
        <Input
          type="number"
          min={1}
          step="0.5"
          value={form.hoursPerMonth}
          onChange={(e) => set('hoursPerMonth', Number(e.target.value))}
        />
      </Field>
      <Field label="Tarif normal">
        <Input
          type="number"
          min={0}
          step="0.5"
          value={form.standardRate}
          onChange={(e) => set('standardRate', Number(e.target.value))}
        />
      </Field>
      <Field label="Tarif majorat">
        <Input
          type="number"
          min={0}
          step="0.5"
          value={form.offHoursRate}
          onChange={(e) => set('offHoursRate', Number(e.target.value))}
        />
      </Field>
      <div className="flex items-center gap-1 pb-1">
        {modificat && (
          <Button size="sm" loading={saving} onClick={() => onSave(form)}>
            Salvează
          </Button>
        )}
        <button
          onClick={onDelete}
          className="rounded-xl p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          aria-label="Șterge pachetul"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <p className="col-span-2 text-xs text-slate-400 lg:col-span-5">
        Cost lunar pentru client: <span className="font-semibold text-slate-600">
          {(form.hoursPerMonth * form.standardRate).toFixed(0)} €
        </span>{' '}
        · orele lucrate în afara programului consumă dublu din pachet
      </p>
    </div>
  );
}

/** Marimea maxima acceptata de server pentru sigla */

/** Incarcarea siglei: fisierul e trimis codificat base64, serverul il salveaza pe disc */
function LogoCard({ logoUrl, companyName }: { logoUrl: string; companyName: string }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const incarca = useCrudMutation((payload: { data: string; mimeType: string }) =>
    api.post('/settings/logo', payload),
  );
  const sterge = useCrudMutation(() => api.del('/settings/logo'));

  async function laAlegereFisier(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // ca aceeasi imagine sa poata fi realeasa dupa o eroare
    if (!file) return;

    setError('');
    try {
      const imagine = await citesteImagine(file);
      await incarca.mutateAsync({ data: imagine.data, mimeType: imagine.mimeType });
      toast('Siglă actualizată');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca imaginea');
    }
  }

  return (
    <Card>
      <CardTitle
        title="Sigla firmei"
        subtitle="Apare în bara laterală și pe pagina de autentificare"
        icon={<Image className="h-5 w-5" />}
      />

      <div className="flex flex-wrap items-center gap-5">
        <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-3xl border border-slate-200 bg-white p-2">
          {logoUrl ? (
            <img src={logoUrl} alt={companyName} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-2xl font-extrabold text-white">
              {companyName.slice(0, 1).toUpperCase() || 'A'}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <input ref={input} type="file" accept={TIPURI_IMAGINE} className="hidden" onChange={laAlegereFisier} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<Upload className="h-4 w-4" />}
              loading={incarca.isPending}
              onClick={() => input.current?.click()}
            >
              {logoUrl ? 'Înlocuiește sigla' : 'Încarcă sigla'}
            </Button>
            {logoUrl && (
              <Button
                variant="ghost"
                icon={<Trash2 className="h-4 w-4" />}
                loading={sterge.isPending}
                onClick={async () => {
                  await sterge.mutateAsync(undefined);
                  toast('Siglă ștearsă');
                }}
              >
                Șterge
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-400">
            PNG, JPG, WEBP sau SVG, maximum 1 MB. Arată cel mai bine o imagine pătrată, cu fundal transparent.
          </p>
        </div>
      </div>

      {error && <div className="mt-4"><ErrorBlock message={error} /></div>}
    </Card>
  );
}

/** Editorul celor trei praguri de pret pentru un produs (ERP sau CRM) */
function TierEditor({
  titlu,
  prefix,
  form,
  set,
}: {
  titlu: string;
  prefix: 'erp' | 'crm';
  form: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}) {
  const max1 = `${prefix}Tier1Max` as const;
  const price1 = `${prefix}Tier1Price` as const;
  const max2 = `${prefix}Tier2Max` as const;
  const price2 = `${prefix}Tier2Price` as const;
  const price3 = `${prefix}Tier3Price` as const;
  const storage1 = `${prefix}Tier1StorageGb` as const;
  const storage2 = `${prefix}Tier2StorageGb` as const;
  const storage3 = `${prefix}Tier3StorageGb` as const;

  const numar = (key: keyof Settings) => Number(form[key]);

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="mb-3 text-sm font-bold text-slate-800">{titlu}</p>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[1fr,auto,auto] items-end gap-3">
          <Field label={`1 – ${numar(max1)} utilizatori`}>
            <Input type="number" min={0} step="0.5" value={numar(price1)} onChange={(e) => set(price1, Number(e.target.value))} />
          </Field>
          <Field label="până la">
            <Input type="number" min={1} step="1" className="w-20" value={numar(max1)} onChange={(e) => set(max1, Number(e.target.value))} />
          </Field>
          <Field label="GB">
            <Input type="number" min={0} step="0.5" className="w-20" value={numar(storage1)} onChange={(e) => set(storage1, Number(e.target.value))} />
          </Field>
        </div>
        <div className="grid grid-cols-[1fr,auto,auto] items-end gap-3">
          <Field label={`${numar(max1) + 1} – ${numar(max2)} utilizatori`}>
            <Input type="number" min={0} step="0.5" value={numar(price2)} onChange={(e) => set(price2, Number(e.target.value))} />
          </Field>
          <Field label="până la">
            <Input type="number" min={1} step="1" className="w-20" value={numar(max2)} onChange={(e) => set(max2, Number(e.target.value))} />
          </Field>
          <Field label="GB">
            <Input type="number" min={0} step="0.5" className="w-20" value={numar(storage2)} onChange={(e) => set(storage2, Number(e.target.value))} />
          </Field>
        </div>
        <div className="grid grid-cols-[1fr,auto] items-end gap-3">
          <Field label={`${numar(max2) + 1}+ utilizatori`} hint="EUR / utilizator / lună">
            <Input type="number" min={0} step="0.5" value={numar(price3)} onChange={(e) => set(price3, Number(e.target.value))} />
          </Field>
          <Field label="GB">
            <Input type="number" min={0} step="0.5" className="w-20" value={numar(storage3)} onChange={(e) => set(storage3, Number(e.target.value))} />
          </Field>
        </div>
      </div>
    </div>
  );
}

function PasswordCard({ email }: { email: string }) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const change = useCrudMutation((payload: { currentPassword: string; newPassword: string }) =>
    api.post('/auth/change-password', payload),
  );

  return (
    <Card>
      <CardTitle title="Cont" subtitle={email} icon={<KeyRound className="h-5 w-5" />} />
      <div className="flex flex-col gap-4">
        <Field label="Parola curentă">
          <Input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Parolă nouă">
            <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </Field>
          <Field label="Confirmă parola">
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>
        {error && <ErrorBlock message={error} />}
        <Button
          variant="secondary"
          loading={change.isPending}
          onClick={async () => {
            setError('');
            if (newPassword.length < 8) return setError('Parola nouă trebuie să aibă minim 8 caractere');
            if (newPassword !== confirm) return setError('Parolele nu coincid');
            try {
              await change.mutateAsync({ currentPassword, newPassword });
              toast('Parolă schimbată');
              setCurrentPassword('');
              setNewPassword('');
              setConfirm('');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Eroare la schimbarea parolei');
            }
          }}
        >
          Schimbă parola
        </Button>
      </div>
    </Card>
  );
}
