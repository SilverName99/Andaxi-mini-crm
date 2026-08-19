import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, CalendarClock, CheckCheck, FileText, Undo2, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { useBilling, useCrudMutation, useSettings } from '../lib/queries';
import { PageHeader } from '../components/Layout';
import {
  Avatar, Badge, Button, Card, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, Segmented, useToast,
} from '../components/ui';
import { formatDate, formatEur, formatRon, todayIso } from '../lib/format';
import { BILLING_STATUS, CYCLE, PRODUCT } from '../lib/labels';
import { cn } from '../lib/cn';
import type { AccentColor, BillingItem, BillingStatus } from '../lib/types';

export function Billing() {
  const [status, setStatus] = useState<BillingStatus | 'ALL'>('PENDING');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<BillingItem | null>(null);
  const toast = useToast();

  const { data: items = [], isLoading, error } = useBilling();
  const { data: settings } = useSettings();
  const update = useCrudMutation((input: { id: string; data: Partial<BillingItem> }) =>
    api.patch(`/billing/${input.id}`, input.data),
  );
  const bulk = useCrudMutation((input: { ids: string[]; status: BillingStatus }) => api.post('/billing/bulk', input));

  const today = todayIso();
  const filtered = useMemo(
    () => items.filter((item) => status === 'ALL' || item.status === status),
    [items, status],
  );

  const totals = useMemo(() => {
    const pending = items.filter((i) => i.status === 'PENDING');
    return {
      pending: pending.reduce((s, i) => s + i.amountEur, 0),
      overdue: pending.filter((i) => i.dueDate < today).reduce((s, i) => s + i.amountEur, 0),
      invoiced: items.filter((i) => i.status === 'INVOICED').reduce((s, i) => s + i.amountEur, 0),
      paid: items.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.amountEur, 0),
    };
  }, [items, today]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function applyBulk(newStatus: BillingStatus) {
    await bulk.mutateAsync({ ids: [...selected], status: newStatus });
    toast(`${selected.size} poziții actualizate`);
    setSelected(new Set());
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Scadențar"
        subtitle="Ce ai de facturat din abonamente — pozițiile se generează automat"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'De facturat', value: totals.pending, gradient: 'from-amber-500 to-orange-500', icon: CalendarClock },
          { label: 'Restant', value: totals.overdue, gradient: 'from-rose-500 to-red-500', icon: CalendarClock },
          { label: 'Facturat', value: totals.invoiced, gradient: 'from-blue-500 to-indigo-500', icon: FileText },
          { label: 'Încasat', value: totals.paid, gradient: 'from-emerald-500 to-teal-500', icon: Wallet },
        ].map((stat) => (
          <div key={stat.label} className={cn('rounded-3xl bg-gradient-to-br p-4 text-white shadow-soft', stat.gradient)}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{stat.label}</p>
              <stat.icon className="h-4 w-4 text-white/80" />
            </div>
            <p className="mt-2 text-xl font-extrabold">{formatEur(stat.value)}</p>
            {settings && <p className="text-[11px] text-white/70">{formatRon(stat.value, settings.eurRon)}</p>}
          </div>
        ))}
      </div>

      <Card className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'PENDING', label: 'De facturat', count: items.filter((i) => i.status === 'PENDING').length },
            { value: 'INVOICED', label: 'Facturate', count: items.filter((i) => i.status === 'INVOICED').length },
            { value: 'PAID', label: 'Încasate', count: items.filter((i) => i.status === 'PAID').length },
            { value: 'SKIPPED', label: 'Ignorate', count: items.filter((i) => i.status === 'SKIPPED').length },
            { value: 'ALL', label: 'Toate', count: items.length },
          ]}
        />
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">{selected.size} selectate</span>
            <Button size="sm" variant="secondary" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => applyBulk('INVOICED')}>
              Marchează facturat
            </Button>
            <Button size="sm" variant="success" icon={<BadgeCheck className="h-3.5 w-3.5" />} onClick={() => applyBulk('PAID')}>
              Încasat
            </Button>
            <Button size="sm" variant="ghost" icon={<Undo2 className="h-3.5 w-3.5" />} onClick={() => applyBulk('PENDING')}>
              Resetează
            </Button>
          </div>
        )}
      </Card>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={error instanceof Error ? error.message : 'Eroare la încărcare'} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-6 w-6" />}
          title="Nimic aici"
          message="Nu există poziții cu acest status. Adaugă abonamente ca să se genereze scadențarul."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded-md border-slate-300 text-violet-600 focus:ring-violet-300"
                      checked={selected.size > 0 && selected.size === filtered.length}
                      onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((i) => i.id)) : new Set())}
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">Client / serviciu</th>
                  <th className="px-4 py-3 font-semibold">Perioadă</th>
                  <th className="px-4 py-3 font-semibold">Scadență</th>
                  <th className="px-4 py-3 text-right font-semibold">Valoare</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => {
                  const late = item.status === 'PENDING' && item.dueDate < today;
                  return (
                    <tr key={item.id} className={cn('transition hover:bg-slate-50/70', selected.has(item.id) && 'bg-violet-50/50')}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded-md border-slate-300 text-violet-600 focus:ring-violet-300"
                          checked={selected.has(item.id)}
                          onChange={() => toggle(item.id)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/clienti/${item.clientId}`} className="flex items-center gap-3">
                          <Avatar name={item.client?.company || item.client?.name || '?'} color={(item.client?.color ?? 'violet') as AccentColor} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-800">{item.client?.company || item.client?.name}</span>
                            <span className="block truncate text-xs text-slate-500">
                              {item.subscription?.label}
                              {item.subscription?.product && ` · ${PRODUCT[item.subscription.product].text}`}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatDate(item.periodStart)} – {formatDate(item.periodEnd)}
                        {item.subscription?.cycle && (
                          <span className="ml-1 text-slate-400">({CYCLE[item.subscription.cycle].text.toLowerCase()})</span>
                        )}
                      </td>
                      <td className={cn('px-4 py-3 font-medium', late ? 'text-rose-600' : 'text-slate-600')}>
                        {formatDate(item.dueDate)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-slate-900">{formatEur(item.amountEur)}</span>
                        {settings && <span className="block text-[11px] text-slate-400">{formatRon(item.amountEur, settings.eurRon)}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={late ? 'bg-rose-100 text-rose-700' : BILLING_STATUS[item.status].chip}>
                          {late ? 'Restant' : BILLING_STATUS[item.status].text}
                        </Badge>
                        {item.invoiceRef && <span className="mt-1 block text-[11px] text-slate-400">{item.invoiceRef}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {item.status === 'PENDING' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={update.isPending}
                              onClick={() => update.mutate({ id: item.id, data: { status: 'INVOICED' } })}
                            >
                              Facturat
                            </Button>
                          )}
                          {item.status === 'INVOICED' && (
                            <Button
                              size="sm"
                              variant="success"
                              loading={update.isPending}
                              onClick={() => update.mutate({ id: item.id, data: { status: 'PAID' } })}
                            >
                              Încasat
                            </Button>
                          )}
                          <button
                            onClick={() => setEditing(item)}
                            className="rounded-xl p-2 text-slate-400 transition hover:bg-violet-50 hover:text-violet-600"
                            aria-label="Detalii"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && <BillingItemModal item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BillingItemModal({ item, onClose }: { item: BillingItem; onClose: () => void }) {
  const toast = useToast();
  const [invoiceRef, setInvoiceRef] = useState(item.invoiceRef);
  const [notes, setNotes] = useState(item.notes);
  const [status, setStatus] = useState<BillingStatus>(item.status);
  const update = useCrudMutation((data: Partial<BillingItem>) => api.patch(`/billing/${item.id}`, data));

  return (
    <Modal
      open
      onClose={onClose}
      title="Poziție din scadențar"
      subtitle={`${item.client?.company || item.client?.name} · ${item.subscription?.label ?? ''}`}
    >
      <div className="rounded-2xl bg-slate-50 p-4 text-sm">
        <div className="flex justify-between py-1">
          <span className="text-slate-500">Perioadă</span>
          <span className="font-semibold">{formatDate(item.periodStart)} – {formatDate(item.periodEnd)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-slate-500">Scadență</span>
          <span className="font-semibold">{formatDate(item.dueDate)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-slate-500">Valoare</span>
          <span className="font-bold">{formatEur(item.amountEur)}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <Field label="Status">
          <Segmented
            value={status}
            onChange={setStatus}
            options={(Object.keys(BILLING_STATUS) as BillingStatus[]).map((key) => ({ value: key, label: BILLING_STATUS[key].text }))}
          />
        </Field>
        <Field label="Număr factură din ERP" hint="Referință opțională către factura emisă în ANDAXI-ERP">
          <Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="ex. AND-2026-0142" />
        </Field>
        <Field label="Observații">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Anulează</Button>
        <Button
          loading={update.isPending}
          onClick={async () => {
            await update.mutateAsync({ status, invoiceRef, notes });
            toast('Poziție actualizată');
            onClose();
          }}
        >
          Salvează
        </Button>
      </div>
    </Modal>
  );
}
