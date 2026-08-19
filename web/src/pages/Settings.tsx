import { useEffect, useState } from 'react';
import { Building2, Coins, KeyRound, Moon, Save, Sun } from 'lucide-react';
import { api } from '../lib/api';
import { useCrudMutation, useSettings } from '../lib/queries';
import { useAuth } from '../lib/auth';
import { PageHeader } from '../components/Layout';
import { Button, Card, CardTitle, ErrorBlock, Field, Input, LoadingBlock, Toggle, useToast } from '../components/ui';
import { minutesToHhMm } from '../lib/format';
import type { Settings } from '../lib/types';

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
                <Sun className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500" />
                <Input type="number" min={0} step="0.5" className="pl-10" value={form.standardRate} onChange={(e) => set('standardRate', Number(e.target.value))} />
              </div>
            </Field>
            <Field label="Tarif în afara programului (EUR/h)">
              <div className="relative">
                <Moon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
                <Input type="number" min={0} step="0.5" className="pl-10" value={form.offHoursRate} onChange={(e) => set('offHoursRate', Number(e.target.value))} />
              </div>
            </Field>
            <Field label="Program normal de la">
              <Input type="time" value={minutesToHhMm(form.standardStart)} onChange={(e) => set('standardStart', hhMmToMinutes(e.target.value))} />
            </Field>
            <Field label="Program normal până la">
              <Input type="time" value={minutesToHhMm(form.standardEnd)} onChange={(e) => set('standardEnd', hhMmToMinutes(e.target.value))} />
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
          <CardTitle title="Monedă și scadențe" subtitle="Echivalentul în lei și alertele de facturare" icon={<Coins className="h-5 w-5" />} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Curs EUR → RON" hint="Se folosește doar pentru afișarea echivalentului în lei">
              <Input type="number" min={0} step="0.0001" value={form.eurRon} onChange={(e) => set('eurRon', Number(e.target.value))} />
            </Field>
            <Field label="Alertă cu câte zile înainte" hint="Câte zile înainte de scadență apare poziția ca urgentă">
              <Input type="number" min={0} max={90} value={form.billingLeadDays} onChange={(e) => set('billingLeadDays', Number(e.target.value))} />
            </Field>
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-700">Exemplu de calcul</p>
            <p className="mt-1">
              O intervenție de 3 ore, între {minutesToHhMm(form.standardEnd)} și {minutesToHhMm(((form.standardEnd + 180) % 1440))}:
              {' '}<span className="font-bold text-slate-900">{(3 * form.offHoursRate).toFixed(0)} €</span>
              {' '}({(3 * form.offHoursRate * form.eurRon).toFixed(0)} RON)
            </p>
          </div>
        </Card>

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
          </div>
        </Card>

        <PasswordCard email={user?.email ?? ''} />
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
