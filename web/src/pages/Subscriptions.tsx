import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Database, History, Pencil, Plus, Repeat, Trash2, Users } from 'lucide-react';
import { api } from '../lib/api';
import {
  useClients, useCrudMutation, useHourPackages, useSettings, useSubscriptions, useUserChanges,
} from '../lib/queries';
import { PageHeader } from '../components/Layout';
import { DateField } from '../components/DateField';
import {
  Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal,
  Segmented, Select, Textarea, Toggle, useToast,
} from '../components/ui';
import { formatDate, formatEur, formatMinutes, todayIso } from '../lib/format';
import { cn } from '../lib/cn';
import { CYCLE, PRODUCT, SUBSCRIPTION_KIND, SUBSCRIPTION_STATUS, options } from '../lib/labels';
import type {
  AccentColor, PriceBreakdown, Subscription, SubscriptionStatus, SubscriptionUserChange,
} from '../lib/types';

/** Produsele la care pretul se calculeaza din numarul de utilizatori */
const PER_USER: Subscription['product'][] = ['ERP', 'CRM'];

const EMPTY: Partial<Subscription> = {
  clientId: '', label: '', kind: 'HOSTING_MENTENANTA', product: 'PREZENTARE', amountEur: 45,
  users: null, cycle: 'MONTHLY', includedHoursPerMonth: 0, paidHours: 0, startDate: todayIso(), endDate: null,
  status: 'ACTIVE', notes: '',
};

export function SubscriptionForm({
  open, onClose, subscription, defaultClientId,
}: {
  open: boolean;
  onClose: () => void;
  subscription?: Subscription | null;
  defaultClientId?: string;
}) {
  const toast = useToast();
  const { data: clients = [] } = useClients();
  const { data: packages = [] } = useHourPackages();
  const { data: settings } = useSettings();
  const { data: userChanges = [] } = useUserChanges(subscription?.id);
  const [form, setForm] = useState<Partial<Subscription>>(
    subscription ?? { ...EMPTY, clientId: defaultClientId ?? '' },
  );
  // abonamentele ERP/CRM vechi, introduse manual, nu au numar de utilizatori:
  // pentru ele pornim direct pe pret negociat, ca sa nu li se schimbe suma din greseala
  const [manualPrice, setManualPrice] = useState(
    Boolean(subscription && PER_USER.includes(subscription.product) && !subscription.users),
  );
  const [price, setPrice] = useState<PriceBreakdown | null>(null);
  const [error, setError] = useState('');
  // cand se schimba numarul de utilizatori la un abonament existent, retinem de cand
  const [usersEffectiveDate, setUsersEffectiveDate] = useState(todayIso());
  const utilizatoriModificati = Boolean(
    subscription?.users && form.users && form.users !== subscription.users,
  );

  const mutation = useCrudMutation(async (data: Partial<Subscription>) =>
    subscription ? api.put(`/subscriptions/${subscription.id}`, data) : api.post('/subscriptions', data),
  );

  const set = (key: keyof Subscription, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));

  const product = form.product ?? 'PREZENTARE';
  const cycle = form.cycle ?? 'MONTHLY';
  const perUser = PER_USER.includes(product) && !manualPrice;
  // pachetele de ore sunt preplatite: suma vine din pachet, nu se introduce
  const estePachet = product === 'PACHET_ORE';
  const pachetAles = packages.find((p) => p.id === form.hourPackageId);
  const costPachet = pachetAles
    ? pachetAles.hoursPerMonth * pachetAles.standardRate * CYCLE[cycle].months
    : 0;

  // pretul pe utilizatori il calculeaza serverul, ca sa fie acelasi la afisare si la salvare
  useEffect(() => {
    if (!perUser || !form.users || form.users < 1) {
      setPrice(null);
      return;
    }
    let anulat = false;
    api
      .post<PriceBreakdown>('/subscriptions/price', { product, cycle, users: form.users })
      .then((data) => !anulat && setPrice(data))
      .catch(() => !anulat && setPrice(null));
    return () => {
      anulat = true;
    };
  }, [perUser, product, cycle, form.users]);

  const amount = estePachet ? costPachet : perUser ? (price?.amountEur ?? 0) : (form.amountEur ?? 0);
  const monthly = amount / CYCLE[cycle].months;

  async function submit() {
    setError('');
    if (!form.clientId) return setError('Selectează clientul');
    if (!form.label?.trim()) return setError('Denumirea abonamentului este obligatorie');
    if (estePachet && !form.hourPackageId) return setError('Alege pachetul de ore');
    if (!estePachet && perUser && (!form.users || form.users < 1)) return setError('Completează numărul de utilizatori');
    if (!estePachet && !perUser && (!form.amountEur || form.amountEur <= 0)) {
      return setError('Suma trebuie să fie mai mare ca 0');
    }
    try {
      await mutation.mutateAsync({
        ...form,
        endDate: form.endDate || null,
        ...(utilizatoriModificati ? { usersEffectiveDate } : {}),
        // trimitem doar ce e relevant; suma pentru ERP/CRM o recalculeaza serverul
        users: !estePachet && perUser ? form.users : null,
        hourPackageId: estePachet ? form.hourPackageId : null,
        amountEur: estePachet || perUser ? undefined : form.amountEur,
      });
      toast(subscription ? 'Abonament actualizat' : 'Abonament adăugat');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la salvare');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={subscription ? 'Editează abonamentul' : 'Abonament nou'}
      subtitle="Găzduire / mentenanță facturată recurent"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Client *">
          <Select
            value={form.clientId ?? ''}
            onChange={(e) => set('clientId', e.target.value)}
            options={[
              { value: '', label: '— alege clientul —' },
              ...clients.map((c) => ({ value: c.id, label: c.company || c.name })),
            ]}
          />
        </Field>
        <Field label="Denumire *">
          <Input value={form.label ?? ''} onChange={(e) => set('label', e.target.value)} placeholder="Găzduire + mentenanță site" />
        </Field>
        <Field label="Tip serviciu">
          <Select value={form.kind ?? 'HOSTING_MENTENANTA'} onChange={(e) => set('kind', e.target.value)} options={options(SUBSCRIPTION_KIND)} />
        </Field>
        <Field label="Produs">
          <Select value={form.product ?? 'PREZENTARE'} onChange={(e) => set('product', e.target.value)} options={options(PRODUCT)} />
        </Field>
        {estePachet ? (
          <Field label="Pachet de ore *" hint="Se definesc în Setări → Pachete de ore preplătite">
            <Select
              value={form.hourPackageId ?? ''}
              onChange={(e) => set('hourPackageId', e.target.value)}
              options={[
                { value: '', label: '— alege pachetul —' },
                ...packages
                  .filter((p) => p.active || p.id === form.hourPackageId)
                  .map((p) => ({
                    value: p.id,
                    label: `${p.name} — ${p.hoursPerMonth} h × ${p.standardRate} € (${p.offHoursRate} € noaptea)`,
                  })),
              ]}
            />
          </Field>
        ) : perUser ? (
          <Field label="Număr utilizatori *" hint="Prețul se calculează automat din tarifele din Setări">
            <div className="relative">
              <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
              <Input
                type="number"
                min={1}
                step="1"
                className="pl-10"
                value={form.users ?? ''}
                onChange={(e) => set('users', e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          </Field>
        ) : (
          <Field label="Sumă pe ciclu (EUR) *">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.amountEur ?? ''}
              onChange={(e) => set('amountEur', Number(e.target.value))}
            />
          </Field>
        )}
        <Field label="Periodicitate" hint={amount ? `Echivalent ${formatEur(monthly)} / lună` : undefined}>
          <Select value={form.cycle ?? 'MONTHLY'} onChange={(e) => set('cycle', e.target.value)} options={options(CYCLE)} />
        </Field>
        <Field
          label="Ore incluse pe lună"
          hint="Se scad automat din intervențiile lunii; o oră în afara programului consumă dublu"
        >
          <Input
            type="number"
            min={0}
            step="0.5"
            value={form.includedHoursPerMonth ?? 0}
            onChange={(e) => set('includedHoursPerMonth', Number(e.target.value))}
          />
        </Field>
        <Field
          label="Ore plătite prin abonament"
          hint="Rezervor consumat o singură dată: orele puse pe acest abonament scad din el, cele din afara programului dublu"
        >
          <Input
            type="number"
            min={0}
            step="0.5"
            value={form.paidHours ?? 0}
            onChange={(e) => set('paidHours', Number(e.target.value))}
          />
        </Field>
        <Field label="Prima scadență *" hint="De la această dată se generează pozițiile de facturat">
          <DateField value={form.startDate ?? ''} onChange={(iso) => set('startDate', iso)} allowEmpty={false} />
        </Field>
        <Field label="Data de final" hint="Opțional, dacă contractul are termen">
          <DateField value={form.endDate ?? ''} onChange={(iso) => set('endDate', iso)} />
        </Field>
        <Field label="Status">
          <Select value={form.status ?? 'ACTIVE'} onChange={(e) => set('status', e.target.value)} options={options(SUBSCRIPTION_STATUS)} />
        </Field>
        {PER_USER.includes(product) && !estePachet && (
          <Field
            label="Spațiu ocupat (GB)"
            hint={
              settings && form.users
                ? `Inclus la acest prag: ${
                    product === 'ERP'
                      ? form.users <= settings.erpTier1Max
                        ? settings.erpTier1StorageGb
                        : form.users <= settings.erpTier2Max
                          ? settings.erpTier2StorageGb
                          : settings.erpTier3StorageGb
                      : form.users <= settings.crmTier1Max
                        ? settings.crmTier1StorageGb
                        : form.users <= settings.crmTier2Max
                          ? settings.crmTier2StorageGb
                          : settings.crmTier3StorageGb
                  } GB`
                : 'Completează manual, când verifici serverul'
            }
          >
            <div className="relative">
              <Database className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
              <Input
                type="number"
                min={0}
                step="0.1"
                className="pl-10"
                value={form.storageUsedGb ?? ''}
                onChange={(e) => set('storageUsedGb', e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          </Field>
        )}
        {utilizatoriModificati && (
          <Field
            label="Modificarea se aplică de la"
            hint="Diferența pentru perioada în curs se calculează proporțional cu zilele rămase"
          >
            <DateField value={usersEffectiveDate} onChange={setUsersEffectiveDate} allowEmpty={false} />
          </Field>
        )}
        <Field label="Notițe" className="sm:col-span-2">
          <Textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>

      {estePachet && pachetAles && (
        <div className="mt-4 rounded-3xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400">Cost pe ciclu</p>
              <p className="text-2xl font-extrabold text-indigo-700">{formatEur(costPachet)}</p>
              <p className="text-xs text-slate-500">preplătit, indiferent de consum</p>
            </div>
            <div className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
              <span className="rounded-xl bg-white px-3 py-1.5">
                {pachetAles.hoursPerMonth} h/lună × {formatEur(pachetAles.standardRate)}
              </span>
              <span className="rounded-xl bg-white px-3 py-1.5">
                orele lucrate noaptea consumă dublu din pachet
              </span>
            </div>
          </div>
        </div>
      )}

      {perUser && price && (
        <div className="mt-4 rounded-3xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400">Total pe ciclu</p>
              <p className="text-2xl font-extrabold text-indigo-700">{formatEur(price.amountEur)}</p>
              <p className="text-xs text-slate-500">{formatEur(price.monthlyEur)} / lună</p>
            </div>
            <div className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
              <span className="rounded-xl bg-white px-3 py-1.5">
                {price.users} utilizatori × {formatEur(price.pricePerUser)} / lună
              </span>
              <span className="rounded-xl bg-white px-3 py-1.5">
                {price.months} {price.months === 1 ? 'lună' : 'luni'}
                {price.discountPercent > 0 && ` · reducere ${price.discountPercent}% (din ${formatEur(price.fullEur)})`}
              </span>
            </div>
          </div>
        </div>
      )}

      {PER_USER.includes(product) && !estePachet && (
        <div className="mt-4">
          <Toggle
            checked={manualPrice}
            onChange={setManualPrice}
            label="Preț negociat manual"
            hint="Ignoră tarifele pe utilizator și introdu tu suma"
          />
        </div>
      )}

      {userChanges.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <History className="h-3.5 w-3.5" /> Istoric utilizatori
          </p>
          <ul className="flex flex-col gap-1.5">
            {userChanges.map((schimbare) => (
              <UserChangeRow key={schimbare.id} schimbare={schimbare} subscriptionId={subscription!.id} />
            ))}
          </ul>
        </div>
      )}

      {error && <div className="mt-4"><ErrorBlock message={error} /></div>}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Anulează</Button>
        <Button onClick={submit} loading={mutation.isPending}>{subscription ? 'Salvează' : 'Adaugă abonament'}</Button>
      </div>
    </Modal>
  );
}

/** Un rand din istoricul de utilizatori, cu diferenta prorata si butonul de aplicare */
function UserChangeRow({
  schimbare,
  subscriptionId,
}: {
  schimbare: SubscriptionUserChange;
  subscriptionId: string;
}) {
  const toast = useToast();
  const aplica = useCrudMutation(() =>
    api.post(`/subscriptions/${subscriptionId}/user-changes/${schimbare.id}/apply`),
  );

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm">
      <span className="text-slate-700">
        <span className="font-semibold">{formatDate(schimbare.effectiveDate)}</span> ·{' '}
        {schimbare.previousUsers} → {schimbare.newUsers} utilizatori ({formatEur(schimbare.previousAmountEur)} →{' '}
        {formatEur(schimbare.newAmountEur)})
      </span>
      {schimbare.proratedEur !== 0 && (
        <span className="flex items-center gap-2">
          <Badge className={schimbare.proratedEur > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}>
            {schimbare.proratedEur > 0 ? '+' : ''}
            {formatEur(schimbare.proratedEur)} prorat
          </Badge>
          {schimbare.applied ? (
            <span className="text-xs font-semibold text-slate-400">aplicat</span>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              loading={aplica.isPending}
              onClick={async () => {
                await aplica.mutateAsync(undefined);
                toast('Diferența a fost adăugată în scadențar');
              }}
            >
              Adaugă în scadențar
            </Button>
          )}
        </span>
      )}
    </li>
  );
}

export function Subscriptions() {
  const [status, setStatus] = useState<SubscriptionStatus | 'ALL'>('ALL');
  const [clientId, setClientId] = useState('');
  const [editing, setEditing] = useState<Subscription | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Subscription | null>(null);
  const toast = useToast();

  const { data: subscriptions = [], isLoading, error } = useSubscriptions();
  const { data: clients = [] } = useClients();
  const remove = useCrudMutation((id: string) => api.del(`/subscriptions/${id}`));

  // filtrul de client se aplica primul, ca numaratorile de pe butoanele de status
  // sa arate cate abonamente are clientul selectat, nu totalul din firma
  const forClient = useMemo(
    () => (clientId ? subscriptions.filter((s) => s.clientId === clientId) : subscriptions),
    [subscriptions, clientId],
  );

  const filtered = useMemo(
    () => forClient.filter((s) => status === 'ALL' || s.status === status),
    [forClient, status],
  );

  const mrr = forClient
    .filter((s) => s.status === 'ACTIVE')
    .reduce((sum, s) => sum + s.amountEur / CYCLE[s.cycle].months, 0);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Abonamente"
        subtitle={
          clientId
            ? `${forClient.length} abonamente · ${formatEur(mrr)} recurent lunar la acest client`
            : `Găzduire și mentenanță · ${formatEur(mrr)} venit recurent lunar`
        }
      >
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>Abonament nou</Button>
      </PageHeader>

      <Card className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Field label="Client" className="w-full lg:max-w-xs">
          <Select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            options={[
              { value: '', label: `Toți clienții (${subscriptions.length})` },
              ...clients.map((c) => {
                const count = subscriptions.filter((s) => s.clientId === c.id).length;
                return { value: c.id, label: `${c.company || c.name} (${count})` };
              }),
            ]}
          />
        </Field>
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL', label: 'Toate', count: forClient.length },
            { value: 'ACTIVE', label: 'Active', count: forClient.filter((s) => s.status === 'ACTIVE').length },
            { value: 'PAUSED', label: 'Suspendate', count: forClient.filter((s) => s.status === 'PAUSED').length },
            { value: 'CANCELLED', label: 'Anulate', count: forClient.filter((s) => s.status === 'CANCELLED').length },
          ]}
        />
      </Card>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={error instanceof Error ? error.message : 'Eroare la încărcare'} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Repeat className="h-6 w-6" />}
          title="Niciun abonament"
          message="Adaugă un abonament de găzduire sau mentenanță ca să se genereze automat scadențarul."
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>Abonament nou</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((sub) => (
            <Card key={sub.id} className="flex flex-col justify-between transition hover:-translate-y-0.5 hover:shadow-soft">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/clienti/${sub.clientId}`} className="flex min-w-0 items-center gap-3">
                    <Avatar name={sub.client?.company || sub.client?.name || '?'} color={(sub.client?.color ?? 'violet') as AccentColor} logoUrl={sub.client?.logoUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{sub.label}</p>
                      <p className="truncate text-xs text-slate-500">{sub.client?.company || sub.client?.name}</p>
                    </div>
                  </Link>
                  <Badge className={SUBSCRIPTION_STATUS[sub.status].chip}>{SUBSCRIPTION_STATUS[sub.status].text}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge className={SUBSCRIPTION_KIND[sub.kind].chip}>{SUBSCRIPTION_KIND[sub.kind].text}</Badge>
                  <Badge className={PRODUCT[sub.product].chip}>{PRODUCT[sub.product].text}</Badge>
                  <Badge className={CYCLE[sub.cycle].chip}>{CYCLE[sub.cycle].text}</Badge>
                  {sub.users ? (
                    <Badge className="bg-indigo-100 text-indigo-700" >
                      {sub.users} utilizatori
                    </Badge>
                  ) : null}
                  {sub.hourPackage ? (
                    <Badge className="bg-indigo-100 text-indigo-700">
                      {sub.hourPackage.hoursPerMonth} h/lună preplătite
                    </Badge>
                  ) : null}
                  {sub.paidHours > 0 ? (
                    <Badge className="bg-emerald-50 text-emerald-700">
                      {formatMinutes(sub.paidRemainingMinutes ?? sub.paidHours * 60)} din {sub.paidHours}h plătite
                    </Badge>
                  ) : null}
                  {sub.includedHoursPerMonth > 0 ? (
                    <Badge className="bg-indigo-50 text-indigo-600">
                      {sub.includedHoursPerMonth} h incluse/lună
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-4 flex items-end justify-between rounded-2xl bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-xs text-slate-400">Valoare</p>
                    <p className="text-lg font-extrabold text-slate-900">{formatEur(sub.amountEur)}</p>
                    <p className="text-[11px] text-slate-400">{formatEur(sub.amountEur / CYCLE[sub.cycle].months)}/lună</p>
                  </div>
                  <div className="text-right">
                    <p className="flex items-center justify-end gap-1 text-xs text-slate-400">
                      <CalendarClock className="h-3.5 w-3.5" /> Următoarea
                    </p>
                    <p className="text-sm font-bold text-slate-700">{formatDate(sub.nextDueDate)}</p>
                  </div>
                </div>
                {sub.storageIncludedGb != null && sub.storageUsedGb != null && (
                  <div
                    className={cn(
                      'mt-3 flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold',
                      sub.storageUsedGb > sub.storageIncludedGb
                        ? 'bg-red-50 text-red-700'
                        : 'bg-slate-50 text-slate-600',
                    )}
                  >
                    {sub.storageUsedGb > sub.storageIncludedGb ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : (
                      <Database className="h-3.5 w-3.5" />
                    )}
                    {sub.storageUsedGb} din {sub.storageIncludedGb} GB
                    {sub.storageUsedGb > sub.storageIncludedGb && ' — spațiu depășit'}
                  </div>
                )}
                {sub.notes && <p className="mt-3 line-clamp-2 text-xs text-slate-500">{sub.notes}</p>}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
                <span>Din {formatDate(sub.startDate)}{sub.endDate ? ` până în ${formatDate(sub.endDate)}` : ''}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditing(sub)} className="rounded-xl p-2 transition hover:bg-indigo-50 hover:text-indigo-600" aria-label="Editează">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleting(sub)} className="rounded-xl p-2 transition hover:bg-red-50 hover:text-red-600" aria-label="Șterge">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing !== undefined && <SubscriptionForm open onClose={() => setEditing(undefined)} subscription={editing} />}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Ștergi abonamentul?"
        message={`Se șterg și pozițiile din scadențar generate pentru „${deleting?.label}".`}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          toast('Abonament șters');
          setDeleting(null);
        }}
      />
    </div>
  );
}
