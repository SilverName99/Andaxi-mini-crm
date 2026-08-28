import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Building2, CalendarClock, Clock4, Globe, Mail, MapPin, Paperclip, Pencil, Phone, Plus, Repeat,
  StickyNote, Wallet,
} from 'lucide-react';
import { useClient, useSettings } from '../lib/queries';
import { Avatar, Badge, Button, Card, CardTitle, ErrorBlock, LoadingBlock, Segmented, StatCard } from '../components/ui';
import { ClientForm } from './Clients';
import { SubscriptionForm } from './Subscriptions';
import { WorkLogDetail } from './WorkLogs';
import { PortalClient } from '../components/PortalClient';
import { OreAbonament } from '../components/OreAbonament';
import { formatDate, formatEur, formatMinutes, formatRon, minutesToHhMm } from '../lib/format';
import {
  BILLING_STATUS, CLIENT_STATUS, CYCLE, PRODUCT, SUBSCRIPTION_KIND, SUBSCRIPTION_STATUS, WORK_CATEGORY, WORK_STATUS,
} from '../lib/labels';
import type { AccentColor } from '../lib/types';

type Tab = 'abonamente' | 'ore' | 'scadentar' | 'detalii';

export function ClientDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: client, isLoading, error } = useClient(id);
  const { data: settings } = useSettings();
  const [tab, setTab] = useState<Tab>('abonamente');
  const [editingClient, setEditingClient] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [detaliiLog, setDetaliiLog] = useState<string | null>(null);

  if (isLoading) return <LoadingBlock />;
  if (error || !client) return <ErrorBlock message={error instanceof Error ? error.message : 'Client inexistent'} />;

  const subscriptions = client.subscriptions ?? [];
  const workLogs = client.workLogs ?? [];
  const billingItems = client.billingItems ?? [];

  const mrr = subscriptions
    .filter((s) => s.status === 'ACTIVE')
    .reduce((sum, s) => sum + s.amountEur / CYCLE[s.cycle].months, 0);
  const minutes = workLogs.reduce((s, l) => s + l.standardMinutes + l.offHoursMinutes, 0);
  const unbilled =
    billingItems.filter((i) => i.status === 'PENDING').reduce((s, i) => s + i.amountEur, 0) +
    workLogs.filter((l) => l.status === 'PENDING').reduce((s, l) => s + l.amountEur, 0);

  return (
    <div className="animate-fade-up">
      <Link to="/clienti" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-indigo-600">
        <ArrowLeft className="h-4 w-4" /> Înapoi la clienți
      </Link>

      <Card className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={client.company || client.name} color={client.color as AccentColor} logoUrl={client.logoUrl} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold text-slate-900">{client.company || client.name}</h1>
              <Badge className={CLIENT_STATUS[client.status].chip}>{CLIENT_STATUS[client.status].text}</Badge>
            </div>
            {client.company && <p className="text-sm text-slate-500">{client.contact || client.name}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditingClient(true)}>Editează</Button>
          <Button variant="secondary" icon={<Repeat className="h-4 w-4" />} onClick={() => setAddingSub(true)}>Abonament</Button>
          <Button icon={<Clock4 className="h-4 w-4" />} onClick={() => navigate(`/clienti/${client.id}/calendar`)}>
            Ore lucrate
          </Button>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Recurent lunar"
          value={formatEur(mrr)}
          hint={`${formatEur(mrr * 12)} / an${settings ? ` · ${formatRon(mrr, settings.eurRon)}` : ''}`}
          icon={<Repeat className="h-5 w-5" />}
          tone="accent"
        />
        <StatCard
          label="Abonamente active"
          value={String(subscriptions.filter((s) => s.status === 'ACTIVE').length)}
          hint={`${subscriptions.length} în total`}
          icon={<CalendarClock className="h-5 w-5" />}
        />
        <StatCard
          label="Ore lucrate"
          value={formatMinutes(minutes)}
          hint={`${workLogs.length} intervenții`}
          icon={<Clock4 className="h-5 w-5" />}
        />
        <StatCard
          label="De facturat"
          value={formatEur(unbilled)}
          hint="abonamente + ore"
          icon={<Wallet className="h-5 w-5" />}
          tone={unbilled > 0 ? 'danger' : 'success'}
        />
      </div>

      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'abonamente', label: 'Abonamente', count: subscriptions.length },
            { value: 'ore', label: 'Ore & intervenții', count: workLogs.length },
            { value: 'scadentar', label: 'Scadențar', count: billingItems.length },
            { value: 'detalii', label: 'Detalii' },
          ]}
        />
      </div>

      {tab === 'abonamente' && (
        <div className="flex flex-col gap-3">
          {subscriptions.length === 0 ? (
            <Card className="py-10 text-center text-sm text-slate-400">
              Niciun abonament.{' '}
              <button onClick={() => setAddingSub(true)} className="font-semibold text-indigo-600 hover:underline">
                Adaugă unul
              </button>
            </Card>
          ) : (
            subscriptions.map((sub) => (
              <Card key={sub.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-800">{sub.label}</p>
                    <Badge className={SUBSCRIPTION_STATUS[sub.status].chip}>{SUBSCRIPTION_STATUS[sub.status].text}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge className={SUBSCRIPTION_KIND[sub.kind].chip}>{SUBSCRIPTION_KIND[sub.kind].text}</Badge>
                    <Badge className={PRODUCT[sub.product].chip}>{PRODUCT[sub.product].text}</Badge>
                    <Badge className={CYCLE[sub.cycle].chip}>{CYCLE[sub.cycle].text}</Badge>
                  </div>
                  <OreAbonament
                    paidHours={sub.paidHours}
                    remainingMinutes={sub.paidRemainingMinutes}
                    className="mt-3 max-w-xs"
                  />
                  {sub.notes && <p className="mt-2 text-xs text-slate-500">{sub.notes}</p>}
                </div>
                <div className="text-right">
                  <p className="text-lg font-extrabold text-slate-900">{formatEur(sub.amountEur)}</p>
                  <p className="flex items-center justify-end gap-1 text-xs text-slate-400">
                    <CalendarClock className="h-3.5 w-3.5" /> {formatDate(sub.nextDueDate)}
                  </p>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'ore' && (
        <div className="flex flex-col gap-2">
          {workLogs.length === 0 ? (
            <Card className="py-10 text-center text-sm text-slate-400">
              Nicio intervenție înregistrată.{' '}
              <Link to={`/clienti/${client.id}/calendar`} className="font-semibold text-indigo-600 hover:underline">
                Deschide calendarul de lucru
              </Link>
            </Card>
          ) : (
            workLogs.map((log) => (
              <Card
                key={log.id}
                onClick={() => setDetaliiLog(log.id)}
                className="flex cursor-pointer flex-col gap-2 p-4 transition hover:border-slate-300 hover:shadow-soft sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">{formatDate(log.date)}</span>
                    <span className="text-xs text-slate-400">
                      {log.entryMode === 'DURATION'
                        ? formatMinutes(log.standardMinutes + log.offHoursMinutes)
                        : `${minutesToHhMm(log.startMinutes)}–${minutesToHhMm(log.endMinutes)}`}
                    </span>
                    <Badge className={WORK_CATEGORY[log.category].chip}>{WORK_CATEGORY[log.category].text}</Badge>
                    <Badge className={WORK_STATUS[log.status].chip}>{WORK_STATUS[log.status].text}</Badge>
                    {log.attachments?.length ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                        <Paperclip className="h-3 w-3" /> {log.attachments.length}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{log.description || '—'}</p>
                </div>
                <div className="text-right">
                  <p className="font-extrabold text-slate-900">{formatEur(log.amountEur)}</p>
                  <p className="text-xs text-slate-400">{formatMinutes(log.standardMinutes + log.offHoursMinutes)}</p>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'scadentar' && (
        <Card className="overflow-hidden p-0">
          {billingItems.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">Nicio poziție generată încă.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">Serviciu</th>
                    <th className="px-4 py-3 font-semibold">Perioadă</th>
                    <th className="px-4 py-3 font-semibold">Scadență</th>
                    <th className="px-4 py-3 text-right font-semibold">Valoare</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {billingItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-700">{item.subscription?.label}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(item.periodStart)} – {formatDate(item.periodEnd)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(item.dueDate)}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{formatEur(item.amountEur)}</td>
                      <td className="px-4 py-3">
                        <Badge className={BILLING_STATUS[item.status].chip}>{BILLING_STATUS[item.status].text}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'detalii' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle title="Date de contact" icon={<Mail className="h-5 w-5" />} />
            <dl className="flex flex-col gap-3 text-sm">
              {[
                { icon: Mail, label: 'Email', value: client.email },
                { icon: Phone, label: 'Telefon', value: client.phone },
                { icon: Globe, label: 'Website', value: client.website },
                { icon: MapPin, label: 'Adresă', value: [client.address, client.city, client.county, client.country].filter(Boolean).join(', ') },
                { icon: Building2, label: 'CUI', value: client.cui },
                { icon: Building2, label: 'Reg. com.', value: client.regCom },
              ]
                .filter((row) => row.value)
                .map((row) => (
                  <div key={row.label} className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                      <row.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{row.label}</dt>
                      <dd className="text-slate-700">{row.value}</dd>
                    </div>
                  </div>
                ))}
            </dl>
          </Card>

          <PortalClient clientId={client.id} clientName={client.company || client.name} />

          <Card>
            <CardTitle title="Notițe" icon={<StickyNote className="h-5 w-5" />} />
            <p className="whitespace-pre-wrap text-sm text-slate-600">{client.notes || 'Fără notițe.'}</p>
          </Card>

          {(client.tasks?.length ?? 0) > 0 && (
            <Card className="lg:col-span-2">
              <CardTitle title="Task-uri legate de client" icon={<Plus className="h-5 w-5" />} />
              <ul className="flex flex-col gap-2">
                {client.tasks!.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className={task.done ? 'text-slate-400 line-through' : 'text-slate-700'}>{task.title}</span>
                    <span className="text-xs text-slate-400">{task.dueDate ? formatDate(task.dueDate) : '—'}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {editingClient && <ClientForm open onClose={() => setEditingClient(false)} client={client} />}
      {addingSub && <SubscriptionForm open onClose={() => setAddingSub(false)} defaultClientId={client.id} />}
      {detaliiLog && <WorkLogDetail logId={detaliiLog} onClose={() => setDetaliiLog(null)} />}
    </div>
  );
}
