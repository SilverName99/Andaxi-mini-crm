import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Pencil, Plus, Repeat, Trash2, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useClients, useCrudMutation, useSubscriptions } from '../lib/queries';
import { PageHeader } from '../components/Layout';
import { DateField } from '../components/DateField';
import {
  Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal,
  Segmented, Select, Textarea, Toggle, useToast,
} from '../components/ui';
import { formatDate, formatEur, todayIso } from '../lib/format';
import { CYCLE, PRODUCT, SUBSCRIPTION_KIND, SUBSCRIPTION_STATUS, options } from '../lib/labels';
import type { AccentColor, PriceBreakdown, Subscription, SubscriptionStatus } from '../lib/types';

/** Produsele la care pretul se calculeaza din numarul de utilizatori */
const PER_USER: Subscription['product'][] = ['ERP', 'CRM'];

const EMPTY: Partial<Subscription> = {
  clientId: '', label: '', kind: 'HOSTING_MENTENANTA', product: 'PREZENTARE', amountEur: 45,
  users: null, cycle: 'MONTHLY', startDate: todayIso(), endDate: null, status: 'ACTIVE', notes: '',
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

  const mutation = useCrudMutation(async (data: Partial<Subscription>) =>
    subscription ? api.put(`/subscriptions/${subscription.id}`, data) : api.post('/subscriptions', data),
  );

  const set = (key: keyof Subscription, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));

  const product = form.product ?? 'PREZENTARE';
  const cycle = form.cycle ?? 'MONTHLY';
  const perUser = PER_USER.includes(product) && !manualPrice;

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

  const amount = perUser ? (price?.amountEur ?? 0) : (form.amountEur ?? 0);
  const monthly = amount / CYCLE[cycle].months;

  async function submit() {
    setError('');
    if (!form.clientId) return setError('Selectează clientul');
    if (!form.label?.trim()) return setError('Denumirea abonamentului este obligatorie');
    if (perUser && (!form.users || form.users < 1)) return setError('Completează numărul de utilizatori');
    if (!perUser && (!form.amountEur || form.amountEur <= 0)) return setError('Suma trebuie să fie mai mare ca 0');
    try {
      await mutation.mutateAsync({
        ...form,
        endDate: form.endDate || null,
        // trimitem doar ce e relevant; suma pentru ERP/CRM o recalculeaza serverul
        users: perUser ? form.users : null,
        amountEur: perUser ? undefined : form.amountEur,
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
        {perUser ? (
          <Field label="Număr utilizatori *" hint="Prețul se calculează automat din tarifele din Setări">
            <div className="relative">
              <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-orange-500" />
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
        <Field label="Prima scadență *" hint="De la această dată se generează pozițiile de facturat">
          <DateField value={form.startDate ?? ''} onChange={(iso) => set('startDate', iso)} allowEmpty={false} />
        </Field>
        <Field label="Data de final" hint="Opțional, dacă contractul are termen">
          <DateField value={form.endDate ?? ''} onChange={(iso) => set('endDate', iso)} />
        </Field>
        <Field label="Status">
          <Select value={form.status ?? 'ACTIVE'} onChange={(e) => set('status', e.target.value)} options={options(SUBSCRIPTION_STATUS)} />
        </Field>
        <Field label="Notițe" className="sm:col-span-2">
          <Textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>

      {perUser && price && (
        <div className="mt-4 rounded-3xl bg-gradient-to-br from-orange-500 to-amber-500 p-5 text-white">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Total pe ciclu</p>
              <p className="text-2xl font-extrabold">{formatEur(price.amountEur)}</p>
              <p className="text-xs text-white/80">{formatEur(price.monthlyEur)} / lună</p>
            </div>
            <div className="flex flex-col gap-1.5 text-xs">
              <span className="rounded-xl bg-white/15 px-3 py-1.5">
                {price.users} utilizatori × {formatEur(price.pricePerUser)} / lună
              </span>
              <span className="rounded-xl bg-white/15 px-3 py-1.5">
                {price.months} {price.months === 1 ? 'lună' : 'luni'}
                {price.discountPercent > 0 && ` · reducere ${price.discountPercent}% (din ${formatEur(price.fullEur)})`}
              </span>
            </div>
          </div>
        </div>
      )}

      {PER_USER.includes(product) && (
        <div className="mt-4">
          <Toggle
            checked={manualPrice}
            onChange={setManualPrice}
            label="Preț negociat manual"
            hint="Ignoră tarifele pe utilizator și introdu tu suma"
          />
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
                    <Avatar name={sub.client?.company || sub.client?.name || '?'} color={(sub.client?.color ?? 'violet') as AccentColor} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-stone-900">{sub.label}</p>
                      <p className="truncate text-xs text-stone-500">{sub.client?.company || sub.client?.name}</p>
                    </div>
                  </Link>
                  <Badge className={SUBSCRIPTION_STATUS[sub.status].chip}>{SUBSCRIPTION_STATUS[sub.status].text}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge className={SUBSCRIPTION_KIND[sub.kind].chip}>{SUBSCRIPTION_KIND[sub.kind].text}</Badge>
                  <Badge className={PRODUCT[sub.product].chip}>{PRODUCT[sub.product].text}</Badge>
                  <Badge className={CYCLE[sub.cycle].chip}>{CYCLE[sub.cycle].text}</Badge>
                  {sub.users ? (
                    <Badge className="bg-orange-100 text-orange-700" >
                      {sub.users} utilizatori
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-4 flex items-end justify-between rounded-2xl bg-stone-50 px-4 py-3">
                  <div>
                    <p className="text-xs text-stone-400">Valoare</p>
                    <p className="text-lg font-extrabold text-stone-900">{formatEur(sub.amountEur)}</p>
                    <p className="text-[11px] text-stone-400">{formatEur(sub.amountEur / CYCLE[sub.cycle].months)}/lună</p>
                  </div>
                  <div className="text-right">
                    <p className="flex items-center justify-end gap-1 text-xs text-stone-400">
                      <CalendarClock className="h-3.5 w-3.5" /> Următoarea
                    </p>
                    <p className="text-sm font-bold text-stone-700">{formatDate(sub.nextDueDate)}</p>
                  </div>
                </div>
                {sub.notes && <p className="mt-3 line-clamp-2 text-xs text-stone-500">{sub.notes}</p>}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-xs text-stone-400">
                <span>Din {formatDate(sub.startDate)}{sub.endDate ? ` până în ${formatDate(sub.endDate)}` : ''}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditing(sub)} className="rounded-xl p-2 transition hover:bg-orange-50 hover:text-orange-600" aria-label="Editează">
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
