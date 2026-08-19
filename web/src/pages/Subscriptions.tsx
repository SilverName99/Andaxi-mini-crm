import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useClients, useCrudMutation, useSubscriptions } from '../lib/queries';
import { PageHeader } from '../components/Layout';
import {
  Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal,
  Segmented, Select, Textarea, useToast,
} from '../components/ui';
import { formatDate, formatEur, todayIso } from '../lib/format';
import { CYCLE, PRODUCT, SUBSCRIPTION_KIND, SUBSCRIPTION_STATUS, options } from '../lib/labels';
import type { AccentColor, Subscription, SubscriptionStatus } from '../lib/types';

const EMPTY: Partial<Subscription> = {
  clientId: '', label: '', kind: 'HOSTING_MENTENANTA', product: 'PREZENTARE', amountEur: 45,
  cycle: 'MONTHLY', startDate: todayIso(), endDate: null, status: 'ACTIVE', notes: '',
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
  const [error, setError] = useState('');

  const mutation = useCrudMutation(async (data: Partial<Subscription>) =>
    subscription ? api.put(`/subscriptions/${subscription.id}`, data) : api.post('/subscriptions', data),
  );

  const set = (key: keyof Subscription, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));

  const monthly = (form.amountEur ?? 0) / (CYCLE[form.cycle ?? 'MONTHLY'].months);

  async function submit() {
    setError('');
    if (!form.clientId) return setError('Selectează clientul');
    if (!form.label?.trim()) return setError('Denumirea abonamentului este obligatorie');
    if (!form.amountEur || form.amountEur <= 0) return setError('Suma trebuie să fie mai mare ca 0');
    try {
      await mutation.mutateAsync({ ...form, endDate: form.endDate || null });
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
        <Field label="Sumă pe ciclu (EUR) *">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.amountEur ?? ''}
            onChange={(e) => set('amountEur', Number(e.target.value))}
          />
        </Field>
        <Field label="Periodicitate" hint={`Echivalent ${formatEur(monthly)} / lună`}>
          <Select value={form.cycle ?? 'MONTHLY'} onChange={(e) => set('cycle', e.target.value)} options={options(CYCLE)} />
        </Field>
        <Field label="Prima scadență *" hint="De la această dată se generează pozițiile de facturat">
          <Input type="date" value={form.startDate ?? ''} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label="Data de final" hint="Opțional, dacă contractul are termen">
          <Input type="date" value={form.endDate ?? ''} onChange={(e) => set('endDate', e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={form.status ?? 'ACTIVE'} onChange={(e) => set('status', e.target.value)} options={options(SUBSCRIPTION_STATUS)} />
        </Field>
        <Field label="Notițe" className="sm:col-span-2">
          <Textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>

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
  const [editing, setEditing] = useState<Subscription | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Subscription | null>(null);
  const toast = useToast();

  const { data: subscriptions = [], isLoading, error } = useSubscriptions();
  const remove = useCrudMutation((id: string) => api.del(`/subscriptions/${id}`));

  const filtered = useMemo(
    () => subscriptions.filter((s) => status === 'ALL' || s.status === status),
    [subscriptions, status],
  );

  const mrr = subscriptions
    .filter((s) => s.status === 'ACTIVE')
    .reduce((sum, s) => sum + s.amountEur / CYCLE[s.cycle].months, 0);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Abonamente"
        subtitle={`Găzduire și mentenanță · ${formatEur(mrr)} venit recurent lunar`}
      >
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>Abonament nou</Button>
      </PageHeader>

      <Card className="mb-4">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL', label: 'Toate', count: subscriptions.length },
            { value: 'ACTIVE', label: 'Active', count: subscriptions.filter((s) => s.status === 'ACTIVE').length },
            { value: 'PAUSED', label: 'Suspendate', count: subscriptions.filter((s) => s.status === 'PAUSED').length },
            { value: 'CANCELLED', label: 'Anulate', count: subscriptions.filter((s) => s.status === 'CANCELLED').length },
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
                {sub.notes && <p className="mt-3 line-clamp-2 text-xs text-slate-500">{sub.notes}</p>}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
                <span>Din {formatDate(sub.startDate)}{sub.endDate ? ` până în ${formatDate(sub.endDate)}` : ''}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditing(sub)} className="rounded-xl p-2 transition hover:bg-violet-50 hover:text-violet-600" aria-label="Editează">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleting(sub)} className="rounded-xl p-2 transition hover:bg-rose-50 hover:text-rose-600" aria-label="Șterge">
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
