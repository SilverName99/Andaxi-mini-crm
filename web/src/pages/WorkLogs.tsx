import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck, CheckCheck, Clock4, Download, FileText, Moon, Paperclip, Pencil, Plus, Sun, Trash2, Wallet,
} from 'lucide-react';
import { api, uploadFile } from '../lib/api';
import { useClients, useCrudMutation, useSettings, useWorkLog, useWorkLogs } from '../lib/queries';
import { PageHeader } from '../components/Layout';
import { DateField } from '../components/DateField';
import { TimeField } from '../components/TimeField';
import {
  Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal,
  Segmented, Select, StatCard, Textarea, Toggle, useToast,
} from '../components/ui';
import {
  addDaysIso, formatDate, formatEur, formatFileSize, formatMinutes, formatRon, minutesToHhMm, startOfMonthIso,
  todayIso,
} from '../lib/format';
import { WORK_CATEGORY, WORK_STATUS, options } from '../lib/labels';
import { cn } from '../lib/cn';
import type { AccentColor, Attachment, RateSplit, WorkLog, WorkStatus } from '../lib/types';

interface FormState {
  clientId: string;
  date: string;
  start: string;
  end: string;
  description: string;
  category: WorkLog['category'];
  projectTag: string;
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
    projectTag: log?.projectTag ?? '',
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
  // etichetele deja folosite, ca sa nu fie rescrise de fiecare data
  const { data: toateLogurile = [] } = useWorkLogs();
  const etichete = useMemo(
    () => [...new Set(toateLogurile.map((l) => l.projectTag).filter(Boolean))].sort(),
    [toateLogurile],
  );

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
        projectTag: form.projectTag,
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
        <Field
          label="Lucrare / proiect"
          hint="Etichetă liberă, pentru gruparea orelor (ex. Dezvoltare CRM)"
          className="sm:col-span-2"
        >
          <Input
            list="etichete-proiect"
            value={form.projectTag}
            onChange={(e) => set('projectTag', e.target.value)}
            placeholder="fără etichetă"
          />
          <datalist id="etichete-proiect">
            {etichete.map((eticheta) => (
              <option key={eticheta} value={eticheta} />
            ))}
          </datalist>
        </Field>
        <Field label="Descriere" className="sm:col-span-2">
          <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Ce ai făcut concret…" />
        </Field>
      </div>

      {preview && settings && (
        <div className="mt-4 rounded-3xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400">Total calculat</p>
              <p className="text-2xl font-extrabold text-indigo-700">{formatEur(preview.amountEur)}</p>
              <p className="text-xs text-slate-500">{formatRon(preview.amountEur, settings.eurRon)} · {formatMinutes(preview.totalMinutes)}</p>
            </div>
            <div className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
              <span className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5">
                <Sun className="h-3.5 w-3.5 text-indigo-500" /> {formatMinutes(preview.standardMinutes)} × {settings.standardRate}€
              </span>
              <span className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5">
                <Moon className="h-3.5 w-3.5 text-indigo-500" /> {formatMinutes(preview.offHoursMinutes)} × {settings.offHoursRate}€
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
  const [detalii, setDetalii] = useState<string | null>(null);
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
      amount: billable.reduce((s, l) => s + (l.billableEur ?? l.amountEur), 0),
      pending: billable
        .filter((l) => l.status === 'PENDING')
        .reduce((s, l) => s + (l.billableEur ?? l.amountEur), 0),
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
        <StatCard label="Total ore" value={formatMinutes(totals.minutes)} icon={<Clock4 className="h-5 w-5" />} />
        <StatCard
          label="Program normal"
          value={formatMinutes(totals.standard)}
          hint={settings && `${settings.standardRate} €/h`}
          icon={<Sun className="h-5 w-5" />}
        />
        <StatCard
          label="În afara programului"
          value={formatMinutes(totals.offHours)}
          hint={settings && `${settings.offHoursRate} €/h`}
          icon={<Moon className="h-5 w-5" />}
        />
        <StatCard
          label="Valoare"
          value={formatEur(totals.amount)}
          hint={`${formatEur(totals.pending)} nefacturat`}
          icon={<Wallet className="h-5 w-5" />}
          tone="accent"
        />
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
              <span className="text-xs font-semibold text-slate-500">{selected.size} selectate</span>
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
                <h3 className="text-sm font-bold text-slate-700">{formatDate(date)}</h3>
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-semibold text-slate-400">
                  {formatMinutes(dayLogs.reduce((s, l) => s + l.standardMinutes + l.offHoursMinutes, 0))} ·{' '}
                  {formatEur(
                    dayLogs.filter((l) => l.billable).reduce((s, l) => s + (l.billableEur ?? l.amountEur), 0),
                  )}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {dayLogs.map((log) => (
                  <Card
                    key={log.id}
                    onClick={() => setDetalii(log.id)}
                    className={cn(
                      'flex cursor-pointer flex-col gap-3 p-4 transition hover:border-slate-300 hover:shadow-soft sm:flex-row sm:items-center sm:justify-between',
                      selected.has(log.id) && 'ring-2 ring-indigo-300',
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1.5 h-4 w-4 shrink-0 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-300"
                        checked={selected.has(log.id)}
                        onClick={(e) => e.stopPropagation()}
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
                          <Link
                            to={`/clienti/${log.clientId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm font-bold text-slate-800 hover:text-indigo-700"
                          >
                            {log.client?.company || log.client?.name}
                          </Link>
                          <Badge className={WORK_CATEGORY[log.category].chip}>{WORK_CATEGORY[log.category].text}</Badge>
                          <Badge className={WORK_STATUS[log.status].chip}>{WORK_STATUS[log.status].text}</Badge>
                          {log.projectTag && (
                            <Badge className="bg-indigo-50 text-indigo-600">{log.projectTag}</Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{log.description || '—'}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock4 className="h-3 w-3" /> {minutesToHhMm(log.startMinutes)}–{minutesToHhMm(log.endMinutes)}
                          </span>
                          {log.standardMinutes > 0 && (
                            <span className="flex items-center gap-1"><Sun className="h-3 w-3" /> {formatMinutes(log.standardMinutes)} × {log.standardRate}€</span>
                          )}
                          {log.offHoursMinutes > 0 && (
                            <span className="flex items-center gap-1"><Moon className="h-3 w-3" /> {formatMinutes(log.offHoursMinutes)} × {log.offHoursRate}€</span>
                          )}
                          {log.manualAmount && <span className="font-semibold text-violet-600">sumă manuală</span>}
                          {log.invoiceRef && <span>· {log.invoiceRef}</span>}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="text-right">
                        <p className={cn('text-lg font-extrabold', log.billable ? 'text-slate-900' : 'text-slate-400 line-through')}>
                          {formatEur(log.billableEur ?? log.amountEur)}
                        </p>
                        {/* cand o parte din ore intra in abonament, aratam si valoarea bruta */}
                        {log.includedMinutes || log.packageMinutes ? (
                          <p className="text-[11px] font-medium text-emerald-600">
                            {[
                              log.includedMinutes ? `${formatMinutes(log.includedMinutes)} din abonament` : '',
                              log.packageMinutes ? `${formatMinutes(log.packageMinutes)} din pachet` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        ) : (
                          settings &&
                          log.billable && (
                            <p className="text-[11px] text-slate-400">
                              {formatRon(log.billableEur ?? log.amountEur, settings.eurRon)}
                            </p>
                          )
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(log);
                          }}
                          className="rounded-xl p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                          aria-label="Editează"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleting(log);
                          }}
                          className="rounded-xl p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          aria-label="Șterge"
                        >
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
      {detalii && <WorkLogDetail logId={detalii} onClose={() => setDetalii(null)} />}

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

/* ─────────────────────────────────────────────── detaliile unei intervenții ── */

/** Tipurile pe care le acceptă serverul ca atașament */
const TIPURI_ACCEPTATE =
  '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp';

export function WorkLogDetail({ logId, onClose }: { logId: string; onClose: () => void }) {
  const toast = useToast();
  const { data: log, isLoading } = useWorkLog(logId);
  const { data: settings } = useSettings();
  const input = useRef<HTMLInputElement>(null);
  const [editez, setEditez] = useState(false);
  const [confirmStergere, setConfirmStergere] = useState(false);
  const [error, setError] = useState('');

  const incarca = useCrudMutation((file: File) => uploadFile<Attachment>(`/worklogs/${logId}/attachments`, file));
  const stergeFisier = useCrudMutation((attachmentId: string) =>
    api.del(`/worklogs/${logId}/attachments/${attachmentId}`),
  );
  const schimbaStatus = useCrudMutation((status: WorkStatus) => api.patch(`/worklogs/${logId}/status`, { status }));
  const stergeLog = useCrudMutation(() => api.del(`/worklogs/${logId}`));

  async function laAlegereFisier(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      await incarca.mutateAsync(file);
      toast('Fișier atașat');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca fișierul');
    }
  }

  if (editez && log) {
    return <WorkLogForm open onClose={() => setEditez(false)} log={log} />;
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Detalii intervenție"
      subtitle={log ? `${log.client?.company || log.client?.name} · ${formatDate(log.date)}` : undefined}
    >
      {isLoading || !log ? (
        <LoadingBlock />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-4">
            {[
              { eticheta: 'Data', valoare: formatDate(log.date) },
              { eticheta: 'Interval', valoare: `${minutesToHhMm(log.startMinutes)}–${minutesToHhMm(log.endMinutes)}` },
              { eticheta: 'Durată', valoare: formatMinutes(log.standardMinutes + log.offHoursMinutes) },
              { eticheta: 'Categorie', valoare: WORK_CATEGORY[log.category].text },
            ].map((item) => (
              <div key={item.eticheta}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{item.eticheta}</p>
                <p className="font-semibold text-slate-800">{item.valoare}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Descriere</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{log.description || '—'}</p>
          </div>

          <div className="rounded-3xl border border-indigo-200 bg-indigo-50 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-400">Total</p>
                <p className="text-2xl font-extrabold text-indigo-700">{formatEur(log.amountEur)}</p>
                {settings && (
                  <p className="text-xs text-slate-500">
                    {formatRon(log.amountEur, settings.eurRon)}
                    {log.manualAmount && ' · sumă impusă manual'}
                    {!log.billable && ' · nefacturabil'}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5 text-xs font-medium text-slate-600">
                {log.standardMinutes > 0 && (
                  <span className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5">
                    <Sun className="h-3.5 w-3.5 text-indigo-500" /> {formatMinutes(log.standardMinutes)} × {log.standardRate}€
                  </span>
                )}
                {log.offHoursMinutes > 0 && (
                  <span className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5">
                    <Moon className="h-3.5 w-3.5 text-indigo-500" /> {formatMinutes(log.offHoursMinutes)} × {log.offHoursRate}€
                  </span>
                )}
              </div>
            </div>
          </div>

          <Field label="Status facturare">
            <Segmented
              value={log.status}
              onChange={(status) => schimbaStatus.mutate(status)}
              options={(Object.keys(WORK_STATUS) as WorkStatus[]).map((key) => ({
                value: key,
                label: WORK_STATUS[key].text,
              }))}
            />
            {log.invoiceRef && <p className="mt-2 text-xs text-slate-500">Factură: {log.invoiceRef}</p>}
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Fișiere atașate {log.attachments?.length ? `(${log.attachments.length})` : ''}
              </p>
              <input ref={input} type="file" accept={TIPURI_ACCEPTATE} className="hidden" onChange={laAlegereFisier} />
              <Button
                size="sm"
                variant="secondary"
                icon={<Paperclip className="h-3.5 w-3.5" />}
                loading={incarca.isPending}
                onClick={() => input.current?.click()}
              >
                Adaugă fișier
              </Button>
            </div>

            {log.attachments?.length ? (
              <ul className="flex flex-col gap-2">
                {log.attachments.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{attachment.fileName}</p>
                      <p className="text-xs text-slate-400">{formatFileSize(attachment.size)}</p>
                    </div>
                    <a
                      href={`/api/worklogs/${logId}/attachments/${attachment.id}`}
                      className="rounded-xl p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                      title="Descarcă"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <button
                      onClick={async () => {
                        await stergeFisier.mutateAsync(attachment.id);
                        toast('Fișier șters');
                      }}
                      className="rounded-xl p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      title="Șterge fișierul"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed border-slate-200 py-6 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <Paperclip className="h-5 w-5 text-slate-300" />
                <span className="text-sm text-slate-400">Atașează un PDF, Word sau altă dovadă a lucrării</span>
                <span className="text-xs text-slate-300">maximum 10 MB per fișier</span>
              </button>
            )}
          </div>

          {error && <ErrorBlock message={error} />}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmStergere(true)}>
              Șterge intervenția
            </Button>
            <Button variant="secondary" onClick={onClose}>Închide</Button>
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditez(true)}>Editează</Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmStergere}
        title="Ștergi intervenția?"
        message="Se șterg definitiv și fișierele atașate."
        loading={stergeLog.isPending}
        onCancel={() => setConfirmStergere(false)}
        onConfirm={async () => {
          await stergeLog.mutateAsync(undefined);
          toast('Intervenție ștearsă');
          setConfirmStergere(false);
          onClose();
        }}
      />
    </Modal>
  );
}
