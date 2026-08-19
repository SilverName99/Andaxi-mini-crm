import { Link } from 'react-router-dom';
import {
  Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, ArrowUpRight, CalendarClock, Clock4, ListChecks, Repeat, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { useDashboard } from '../lib/queries';
import { PageHeader } from '../components/Layout';
import { Badge, Card, CardTitle, EmptyState, ErrorBlock, LoadingBlock } from '../components/ui';
import { formatDate, formatEur, formatMinutes, formatMonth, formatRon } from '../lib/format';
import { BILLING_STATUS, PRIORITY, PRODUCT } from '../lib/labels';
import { cn } from '../lib/cn';

const PIE_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#a855f7'];

function StatCard({
  label, value, hint, icon: Icon, gradient, to,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Users;
  gradient: string;
  to?: string;
}) {
  const content = (
    <div
      className={cn(
        'group relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-white shadow-soft transition',
        gradient,
        to && 'hover:-translate-y-0.5 hover:brightness-105',
      )}
    >
      <div className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/15" />
      <div className="absolute -bottom-10 -left-4 h-24 w-24 rounded-full bg-white/10" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{label}</p>
          <p className="mt-2 text-2xl font-extrabold leading-none">{value}</p>
          {hint && <p className="mt-2 text-xs font-medium text-white/80">{hint}</p>}
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20 backdrop-blur">
          <Icon className="h-5 w-5" strokeWidth={2.3} />
        </span>
      </div>
      {to && (
        <ArrowUpRight className="absolute bottom-4 right-4 h-4 w-4 opacity-0 transition group-hover:opacity-100" />
      )}
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

export function Dashboard() {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error instanceof Error ? error.message : 'Nu am putut încărca datele'} />;

  const { kpis, settings } = data;
  const chartData = data.series.map((point) => ({ ...point, label: formatMonth(point.month) }));
  const pieData = data.byProduct.map((p) => ({ name: PRODUCT[p.product]?.text ?? p.product, value: p.value }));

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Panou de control"
        subtitle={`Situația de astăzi, ${formatDate(data.today)} · curs ${settings.eurRon.toFixed(2)} RON/EUR`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Venit recurent lunar"
          value={formatEur(kpis.mrr)}
          hint={`${formatRon(kpis.mrr, settings.eurRon)} · ${formatEur(kpis.arr)}/an`}
          icon={TrendingUp}
          gradient="from-violet-600 to-fuchsia-500"
          to="/abonamente"
        />
        <StatCard
          label="De facturat"
          value={formatEur(kpis.pendingAmount)}
          hint={`${kpis.pendingCount} poziții în scadențar`}
          icon={CalendarClock}
          gradient="from-amber-500 to-orange-500"
          to="/scadentar"
        />
        <StatCard
          label="Ore nefacturate"
          value={formatEur(kpis.unbilledHoursAmount)}
          hint={`${formatMinutes(kpis.unbilledHoursMinutes)} de lucru`}
          icon={Clock4}
          gradient="from-rose-500 to-pink-500"
          to="/interventii"
        />
        <StatCard
          label="Clienți activi"
          value={String(kpis.clientsActive)}
          hint={`${kpis.subscriptionsActive} abonamente active · ${kpis.clientsTotal} clienți total`}
          icon={Users}
          gradient="from-emerald-500 to-teal-500"
          to="/clienti"
        />
      </div>

      {kpis.overdueCount > 0 && (
        <Link
          to="/scadentar?status=PENDING"
          className="mt-4 flex items-center gap-3 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 transition hover:bg-rose-100"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-rose-500 text-white">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-rose-800">
              {kpis.overdueCount} poziții restante · {formatEur(kpis.overdueAmount)}
            </p>
            <p className="text-xs text-rose-600">Scadența a trecut și încă nu sunt marcate ca facturate.</p>
          </div>
        </Link>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle
            title="Evoluție pe ultimele 6 luni"
            subtitle="Recurent (după scadență) vs. ore de intervenție"
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRecurent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.75} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gradOre" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value: number, name) => [formatEur(value), name === 'recurent' ? 'Recurent' : 'Ore']}
                  contentStyle={{ borderRadius: 16, border: '1px solid #e2e8f0', fontSize: 13 }}
                />
                <Legend
                  formatter={(value) => (value === 'recurent' ? 'Recurent' : 'Ore intervenție')}
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                />
                <Area type="monotone" dataKey="recurent" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#gradRecurent)" />
                <Area type="monotone" dataKey="ore" stroke="#f43f5e" strokeWidth={2.5} fill="url(#gradOre)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardTitle title="Recurent pe tip de produs" subtitle="Valoare lunară echivalentă" icon={<Repeat className="h-5 w-5" />} />
          {pieData.length === 0 ? (
            <EmptyState icon={<Repeat className="h-6 w-6" />} title="Niciun abonament" message="Adaugă primul abonament ca să vezi distribuția." />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="white" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => `${formatEur(value)}/lună`}
                    contentStyle={{ borderRadius: 16, border: '1px solid #e2e8f0', fontSize: 13 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle
            title="Următoarele scadențe"
            subtitle="Ce urmează de facturat în 30 de zile"
            icon={<CalendarClock className="h-5 w-5" />}
            action={
              <Link to="/scadentar" className="text-xs font-semibold text-violet-600 hover:underline">
                Vezi scadențarul
              </Link>
            }
          />
          {data.upcoming.length === 0 && data.overdue.length === 0 ? (
            <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="Nimic de facturat" message="Nu ai poziții scadente în perioada următoare." />
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {[...data.overdue, ...data.upcoming].slice(0, 8).map((item) => {
                const late = item.dueDate < data.today;
                return (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {item.client?.company || item.client?.name}
                      </p>
                      <p className="truncate text-xs text-slate-500">{item.subscription?.label}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-900">{formatEur(item.amountEur)}</p>
                        <p className={cn('text-xs font-medium', late ? 'text-rose-600' : 'text-slate-500')}>
                          {formatDate(item.dueDate)}
                        </p>
                      </div>
                      <Badge className={late ? 'bg-rose-100 text-rose-700' : BILLING_STATUS[item.status].chip}>
                        {late ? 'Restant' : BILLING_STATUS[item.status].text}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle title="Top clienți" subtitle="Recurent lunar + ore (6 luni)" icon={<Wallet className="h-5 w-5" />} />
            {data.topClients.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Încă niciun client cu activitate.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.topClients.map((client) => (
                  <li key={client.id}>
                    <Link to={`/clienti/${client.id}`} className="flex items-center justify-between gap-3 group">
                      <span className="min-w-0 truncate text-sm font-semibold text-slate-700 group-hover:text-violet-700">
                        {client.company || client.name}
                      </span>
                      <span className="shrink-0 text-sm font-bold text-slate-900">{formatEur(client.total)}</span>
                    </Link>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                        style={{ width: `${Math.max(6, (client.total / data.topClients[0].total) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle
              title="Task-uri deschise"
              icon={<ListChecks className="h-5 w-5" />}
              action={
                <Link to="/taskuri" className="text-xs font-semibold text-violet-600 hover:underline">
                  Toate
                </Link>
              }
            />
            {data.tasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Nimic în așteptare. 🎉</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {data.tasks.map((task) => (
                  <li key={task.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">{task.title}</p>
                      <p className="text-xs text-slate-400">
                        {task.client?.name ? `${task.client.name} · ` : ''}
                        {task.dueDate ? formatDate(task.dueDate) : 'fără termen'}
                      </p>
                    </div>
                    <Badge className={PRIORITY[task.priority].chip}>{PRIORITY[task.priority].text}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
