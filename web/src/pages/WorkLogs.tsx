import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, CheckCheck, Clock4, Moon, Pencil, Plus, Sun, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useClients, useCrudMutation, useSettings, useWorkLogs } from '../lib/queries';
import { PageHeader } from '../components/Layout';
import { DateField } from '../components/DateField';
import { TimeField } from '../components/TimeField';
import {
  Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal,
  Segmented, Select, Textarea, Toggle, useToast,
} from '../components/ui';
import {
  addDaysIso, formatDate, formatEur, formatMinutes, formatRon, minutesToHhMm, startOfMonthIso, todayIso,
} from '../lib/format';
import { WORK_CATEGORY, WORK_STATUS, options } from '../lib/labels';
import { cn } from '../lib/cn';
import type { AccentColor, RateSplit, WorkLog, WorkStatus } from '../lib/types';

interface FormState {
  clientId: string;
  date: string;
  start: string;
  end: string;
  description: string;
  category: WorkLog['category'];
  billable: boolean;
  manual: boolean;
  amountEur: number;
  invoiceRef: string;
}

function toForm(log?: WorkLog | null, defaultClientId?: string): FormState {
  return {
    clientId: log?.clientId ?? defaultClientId ?? '',
    date: log?.date ?? todayIso(),
    start: log ? minutesToHhMm(log.startMinutes) : '09:00',
    end: log ? minutesToHhMm(log.endMinutes) : '11:00',
    description: log?.description ?? '',
    category: log?.category ?? 'SUPORT',
    billable: log?.billable ?? true,
    manual: log?.manualAmount ?? false,
    amountEur: log?.amountEur ?? 0,
    invoiceRef: log?.invoiceRef ?? '',
  };
}

export function WorkLogForm({
  open, onClose, log, defaultClientId,
}: {
  open: boolean;
  onClose: () => void;
  log?: WorkLog | null;
  defaultClientId?: string;
}) {
  const toast = useToast();
  const { data: clients = [] } = useClients();
  const { data: settings } = useSettings();
  const [form, setForm] = useState<FormState>(toForm(log, defaultClientId));
  const [preview, setPreview] = useState<RateSplit | null>(null);
  const [error, setError] = useState('');

  const mutation = useCrudMutation((data: unknown) =>
    log ? api.put(`/worklogs/${log.id}`, data) : api.post('/worklogs', data),
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // estimare live a costului, calculata pe server cu tarifele curente
  useEffect(() => {
    if (!/^\d{1,2}:\d{2}$/.test(form.start) || !/^\d{1,2}:\d{2}$/.test(form.end)) return;
    let cancelled = false;
    api
      .post<RateSplit>('/worklogs/preview', { date: form.date, start: form.start, end: form.end })
      .then((data) => !cancelled && setPreview(data))
      .catch(() => !cancelled && setPreview(null));
    return () => {
      cancelled = true;
    };
  }, [form.date, form.start, form.end]);

  async function submit() {
    setError('');
    if (!form.clientId) return setError('Selectează clientul');
    try {
      await mutation.mutateAsync({
        clientId: form.clientId,
        date: form.date,
        start: form.start,
        end: form.end,
        description: form.description,
        category: form.category,
        billable: form.billable,
        amountEur: form.manual ? form.amountEur : null,
        invoiceRef: form.invoiceRef,
      });
      toast(log ? 'Interventie actualizată' : 'Intervenție înregistrată');
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
      title={log ? 'Editează intervenția' : 'Intervenție nouă'}
      subtitle="Tariful se calculează automat în funcție de interval"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Client *">
          <Select
            value={form.clientId}
            onChange={(e) => set('clientId', e.target.value)}
            options={[{ value: '', label: '— alege clientul —' }, ...clients.map((c) => ({ value: c.id, label: c.company || c.name }))]}
          />
        </Field>
        <Field label="Categorie">
          <Select value={form.category} onChange={(e) => set('category', e.target.value as WorkLog['category'])} options={options(WORK_CATEGORY)} />
        </Field>
        <Field label="Data">
          <DateField value={form.date} onChange={(iso) => set('date', iso)} allowEmpty={false} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="De la">
            <TimeField value={form.start} onChange={(v) => set('start', v)} />
          </Field>
          <Field label="Până la">
            <TimeField value={form.end} onChange={(v) => set('end', v)} />
          </Field>
        </div>
        <Field label="Descriere" className="sm:col-span-2">
          <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Ce ai făcut concret…" />
        </Field>
      </div>

      {preview && settings && (
        <div className="mt-4 rounded-3xl bg-gradient-to-br from-orange-500 to-amber-500 p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Total calculat</p>
              <p className="text-2xl font-extrabold">{formatEur(preview.amountEur)}</p>
              <p className="text-xs text-white/80">{formatRon(preview.amountEur, settings.eurRon)} · {formatMinutes(preview.totalMinutes)}</p>
            </div>
            <div className="flex flex-col gap-1.5 text-xs">
              <span className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-1.5">
                <Sun className="h-3.5 w-3.5" /> {formatMinutes(preview.standardMinutes)} × {settings.standardRate}€
              </span>
              <span className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-1.5">
                <Moon className="h-3.5 w-3.5" /> {formatMinutes(preview.offHoursMinutes)} × {settings.offHoursRate}€
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        <Toggle
          checked={form.billable}
          onChange={(value) => set('billable', value)}
          label="Facturabil"
          hint="Dezactivează pentru munca inclusă în abonament sau făcută din curtoazie"
        />
        <Toggle
          checked={form.manual}
          onChange={(value) => {
            set('manual', value);
            if (value && preview) set('amountEur', preview.amountEur);
          }}
          label="Sumă impusă manual"
          hint="Folosește când ai negociat un preț fix pentru intervenție"
        />
        {form.manual && (
          <Field label="Sumă (EUR)">
            <Input type="number" min={0} step="0.01" value={form.amountEur} onChange={(e) => set('amountEur', Number(e.target.value))} />
          </Field>
        )}
      </div>

      {error && <div className="mt-4"><ErrorBlock message={error} /></div>}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Anulează</Button>
        <Button onClick={submit} loading={mutation.isPending}>{log ? 'Salvează' : 'Adaugă intervenție'}</Button>
      </div>
    </Modal>
  );
}

export function WorkLogs() {
  const [status, setStatus] = useState<WorkStatus | 'ALL'>('ALL');
  const [clientId, setClientId] = useState('');
  const [from, setFrom] = useState(startOfMonthIso(addDaysIso(todayIso(), -60)));
  const [to, setTo] = useState(todayIso());
  const [editing, setEditing] = useState<WorkLog | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<WorkLog | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toast = useToast();

  const { data: logs = [], isLoading, error } = useWorkLogs({ from, to, clientId: clientId || undefined });
  const { data: clients = [] } = useClients();
  const { data: settings } = useSettings();
  const remove = useCrudMutation((id: string) => api.del(`/worklogs/${id}`));
  const bulk = useCrudMutation((input: { ids: string[]; status: WorkStatus }) => api.post('/worklogs/bulk', input));

  const filtered = useMemo(
    () => logs.filter((log) => status === 'ALL' || log.status === status),
    [logs, status],
  );

  const totals = useMemo(() => {
    const billable = filtered.filter((l) => l.billable);
    return {
      minutes: filtered.reduce((s, l) => s + l.standardMinutes + l.offHoursMinutes, 0),
      standard: filtered.reduce((s, l) => s + l.standardMinutes, 0),
      offHours: filtered.reduce((s, l) => s + l.offHoursMinutes, 0),
      amount: billable.reduce((s, l) => s + l.amountEur, 0),
      pending: billable.filter((l) => l.status === 'PENDING').reduce((s, l) => s + l.amountEur, 0),
    };
  }, [filtered]);

  const grouped = useMemo(() => {
    const map = new Map<string, WorkLog[]>();
    for (const log of filtered) {
      map.set(log.date, [...(map.get(log.date) ?? []), log]);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Ore & intervenții" subtitle="Suport tehnic facturat la oră, cu tarif automat pe interval">
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>Intervenție nouă</Button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-3xl bg-gradient-to-br from-orange-500 to-amber-500 p-4 text-white shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Total ore</p>
          <p className="mt-2 text-xl font-extrabold">{formatMinutes(totals.minutes)}</p>
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 p-4 text-white shadow-soft">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/80">
            <Sun className="h-3.5 w-3.5" /> Program normal
          </p>
          <p className="mt-2 text-xl font-extrabold">{formatMinutes(totals.standard)}</p>
          {settings && <p className="text-[11px] text-white/70">{settings.standardRate} €/h</p>}
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-stone-600 to-stone-800 p-4 text-white shadow-soft">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/80">
            <Moon className="h-3.5 w-3.5" /> În afara programului
          </p>
          <p className="mt-2 text-xl font-extrabold">{formatMinutes(totals.offHours)}</p>
          {settings && <p className="text-[11px] text-white/70">{settings.offHoursRate} €/h</p>}
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-stone-700 to-stone-900 p-4 text-white shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Valoare</p>
          <p className="mt-2 text-xl font-extrabold">{formatEur(totals.amount)}</p>
          <p className="text-[11px] text-white/70">{formatEur(totals.pending)} nefacturat</p>
        </div>
      </div>

      <Card className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Client" className="w-full sm:max-w-xs">
            <Select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              options={[{ value: '', label: 'Toți clienții' }, ...clients.map((c) => ({ value: c.id, label: c.company || c.name }))]}
            />
          </Field>
          <Field label="De la" className="w-full sm:w-44">
            <DateField value={from} onChange={setFrom} allowEmpty={false} />
          </Field>
          <Field label="Până la" className="w-full sm:w-44">
            <DateField value={to} onChange={setTo} allowEmpty={false} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: 'ALL', label: 'Toate', count: logs.length },
              { value: 'PENDING', label: 'De facturat', count: logs.filter((l) => l.status === 'PENDING').length },
              { value: 'INVOICED', label: 'Facturate', count: logs.filter((l) => l.status === 'INVOICED').length },
              { value: 'PAID', label: 'Încasate', count: logs.filter((l) => l.status === 'PAID').length },
              { value: 'NONBILLABLE', label: 'Nefacturabile', count: logs.filter((l) => l.status === 'NONBILLABLE').length },
            ]}
          />
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-stone-500">{selected.size} selectate</span>
              <Button
                size="sm"
                variant="secondary"
                icon={<CheckCheck className="h-3.5 w-3.5" />}
                onClick={async () => {
                  await bulk.mutateAsync({ ids: [...selected], status: 'INVOICED' });
                  toast('Marcate ca facturate');
                  setSelected(new Set());
                }}
              >
                Facturate
              </Button>
              <Button
                size="sm"
                variant="success"
                icon={<BadgeCheck className="h-3.5 w-3.5" />}
                onClick={async () => {
                  await bulk.mutateAsync({ ids: [...selected], status: 'PAID' });
                  toast('Marcate ca încasate');
                  setSelected(new Set());
                }}
              >
                Încasate
              </Button>
            </div>
          )}
        </div>
      </Card>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={error instanceof Error ? error.message : 'Eroare la încărcare'} />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<Clock4 className="h-6 w-6" />}
          title="Nicio intervenție"
          message="Înregistrează orele de suport ca să nu se piardă la facturare."
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>Intervenție nouă</Button>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([date, dayLogs]) => (
            <div key={date}>
              <div className="mb-2 flex items-center gap-3 px-1">
                <h3 className="text-sm font-bold text-stone-700">{formatDate(date)}</h3>
                <span className="h-px flex-1 bg-stone-200" />
                <span className="text-xs font-semibold text-stone-400">
                  {formatMinutes(dayLogs.reduce((s, l) => s + l.standardMinutes + l.offHoursMinutes, 0))} ·{' '}
                  {formatEur(dayLogs.filter((l) => l.billable).reduce((s, l) => s + l.amountEur, 0))}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {dayLogs.map((log) => (
                  <Card
                    key={log.id}
                    className={cn(
                      'flex flex-col gap-3 p-4 transition sm:flex-row sm:items-center sm:justify-between',
                      selected.has(log.id) && 'ring-2 ring-orange-300',
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1.5 h-4 w-4 shrink-0 rounded-md border-stone-300 text-orange-600 focus:ring-orange-300"
                        checked={selected.has(log.id)}
                        onChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            next.has(log.id) ? next.delete(log.id) : next.add(log.id);
                            return next;
                          })
                        }
                      />
                      <Avatar name={log.client?.company || log.client?.name || '?'} color={(log.client?.color ?? 'violet') as AccentColor} size="sm" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/clienti/${log.clientId}`} className="text-sm font-bold text-stone-800 hover:text-orange-700">
                            {log.client?.company || log.client?.name}
                          </Link>
                          <Badge className={WORK_CATEGORY[log.category].chip}>{WORK_CATEGORY[log.category].text}</Badge>
                          <Badge className={WORK_STATUS[log.status].chip}>{WORK_STATUS[log.status].text}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-stone-600">{log.description || '—'}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-400">
                          <span className="flex items-center gap-1">
                            <Clock4 className="h-3 w-3" /> {minutesToHhMm(log.startMinutes)}–{minutesToHhMm(log.endMinutes)}
                          </span>
                          {log.standardMinutes > 0 && (
                            <span className="flex items-center gap-1"><Sun className="h-3 w-3" /> {formatMinutes(log.standardMinutes)} × {log.standardRate}€</span>
                          )}
                          {log.offHoursMinutes > 0 && (
                            <span className="flex items-center gap-1"><Moon className="h-3 w-3" /> {formatMinutes(log.offHoursMinutes)} × {log.offHoursRate}€</span>
                          )}
                          {log.manualAmount && <span className="font-semibold text-amber-600">sumă manuală</span>}
                          {log.invoiceRef && <span>· {log.invoiceRef}</span>}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="text-right">
                        <p className={cn('text-lg font-extrabold', log.billable ? 'text-stone-900' : 'text-stone-400 line-through')}>
                          {formatEur(log.amountEur)}
                        </p>
                        {settings && log.billable && (
                          <p className="text-[11px] text-stone-400">{formatRon(log.amountEur, settings.eurRon)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditing(log)} className="rounded-xl p-2 text-stone-400 transition hover:bg-orange-50 hover:text-orange-600" aria-label="Editează">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleting(log)} className="rounded-xl p-2 text-stone-400 transition hover:bg-red-50 hover:text-red-600" aria-label="Șterge">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== undefined && <WorkLogForm open onClose={() => setEditing(undefined)} log={editing} />}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Ștergi intervenția?"
        message="Înregistrarea va fi ștearsă definitiv."
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          toast('Intervenție ștearsă');
          setDeleting(null);
        }}
      />
    </div>
  );
}
