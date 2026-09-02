import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Clock4, Download, Moon, Receipt, Repeat, Sun, Wallet } from 'lucide-react';
import { useReports } from '../lib/queries';
import { PageHeader } from '../components/Layout';
import { DateField } from '../components/DateField';
import { Avatar, Button, Card, CardTitle, EmptyState, ErrorBlock, Field, LoadingBlock, StatCard } from '../components/ui';
import { formatEur, formatMinutes, formatMonth, formatRon, startOfMonthIso, todayIso } from '../lib/format';
import type { AccentColor } from '../lib/types';

/** Exporta tabelul in CSV (separator ";" — se deschide direct in Excel romanesc) */
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function Reports() {
  const [from, setFrom] = useState(`${todayIso().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(todayIso());
  const { data, isLoading, error } = useReports({ from, to });

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Rapoarte"
        subtitle="Cât ai facturat și cât mai ai de facturat, pe client și pe lună · sumele sunt fără TVA"
      >
        {data && (
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            onClick={() =>
              downloadCsv(`raport-andaxi-${from}_${to}.csv`, [
                [
                  'Client', 'Recurent EUR', 'Ore EUR', 'Reducere EUR', 'Minute lucrate', 'Total fara TVA EUR',
                  `TVA ${data.settings.vatRate}% EUR`, 'Total cu TVA EUR', 'Incasat EUR', 'De facturat EUR',
                ],
                ...data.rows.map((row) => [
                  row.company || row.name, row.recurent, row.ore, row.reducere, row.minutes, row.total,
                  row.tva, row.totalCuTva, row.incasat, row.deFacturat,
                ]),
                [
                  'TOTAL', data.totals.recurent, data.totals.ore, data.totals.reducere,
                  data.totals.standardMinutes + data.totals.offHoursMinutes, data.totals.total,
                  data.totals.tva, data.totals.totalCuTva, data.totals.incasat, data.totals.deFacturat,
                ],
              ])
            }
          >
            Export CSV
          </Button>
        )}
      </PageHeader>

      <Card className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="De la" className="w-full sm:w-48">
          <DateField value={from} onChange={setFrom} allowEmpty={false} />
        </Field>
        <Field label="Până la" className="w-full sm:w-48">
          <DateField value={to} onChange={setTo} allowEmpty={false} />
        </Field>
        <div className="flex flex-wrap gap-2 sm:pb-1">
          {[
            { label: 'Anul curent', from: `${todayIso().slice(0, 4)}-01-01`, to: todayIso() },
            { label: 'Luna curentă', from: startOfMonthIso(todayIso()), to: todayIso() },
            { label: 'Anul trecut', from: `${Number(todayIso().slice(0, 4)) - 1}-01-01`, to: `${Number(todayIso().slice(0, 4)) - 1}-12-31` },
          ].map((preset) => (
            <Button key={preset.label} size="sm" variant="secondary" onClick={() => { setFrom(preset.from); setTo(preset.to); }}>
              {preset.label}
            </Button>
          ))}
        </div>
      </Card>

      {isLoading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorBlock message={error instanceof Error ? error.message : 'Eroare la încărcare'} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard
              label="Total fără TVA"
              value={formatEur(data.totals.total)}
              hint={formatRon(data.totals.total, data.settings.eurRon)}
              icon={<BarChart3 className="h-5 w-5" />}
              tone="accent"
            />
            <StatCard
              label={`Total cu TVA (${data.settings.vatRate}%)`}
              value={formatEur(data.totals.totalCuTva)}
              hint={`TVA ${formatEur(data.totals.tva)} · ${formatRon(data.totals.totalCuTva, data.settings.eurRon)}`}
              icon={<Receipt className="h-5 w-5" />}
              tone="accent"
            />
            <StatCard
              label="Din abonamente"
              value={formatEur(data.totals.recurent)}
              hint={formatRon(data.totals.recurent, data.settings.eurRon)}
              icon={<Repeat className="h-5 w-5" />}
            />
            <StatCard
              label="Din ore"
              value={formatEur(data.totals.ore - data.totals.reducere)}
              hint={
                data.totals.reducere > 0
                  ? `${formatEur(data.totals.ore)} − ${formatEur(data.totals.reducere)} reducere`
                  : formatRon(data.totals.ore, data.settings.eurRon)
              }
              icon={<Clock4 className="h-5 w-5" />}
            />
            <StatCard
              label="De facturat"
              value={formatEur(data.totals.deFacturat)}
              hint={`${formatEur(data.totals.deFacturatCuTva)} cu TVA`}
              icon={<Wallet className="h-5 w-5" />}
              tone={data.totals.deFacturat > 0 ? 'danger' : 'success'}
            />
          </div>

          <Card className="mb-4">
            <CardTitle title="Pe luni" subtitle="Recurent vs. ore de intervenție" icon={<BarChart3 className="h-5 w-5" />} />
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.months.map((m) => ({ ...m, label: formatMonth(m.month) }))} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(value: number, name) => [formatEur(value), name === 'recurent' ? 'Recurent' : 'Ore']}
                    contentStyle={{ borderRadius: 16, border: '1px solid #e2e8f0', fontSize: 13 }}
                    cursor={{ fill: '#f1f5f9' }}
                  />
                  <Legend formatter={(value) => (value === 'recurent' ? 'Recurent' : 'Ore intervenție')} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="recurent" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="ore" stackId="a" fill="#94a3b8" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card className="flex items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-100 text-indigo-600">
                <Sun className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ore în program normal</p>
                <p className="text-lg font-extrabold text-slate-900">{formatMinutes(data.totals.standardMinutes)}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-200 text-slate-600">
                <Moon className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ore în afara programului</p>
                <p className="text-lg font-extrabold text-slate-900">{formatMinutes(data.totals.offHoursMinutes)}</p>
              </div>
            </Card>
          </div>

          {data.rows.length === 0 ? (
            <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Fără date în perioadă" message="Alege alt interval sau adaugă abonamente și intervenții." />
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-semibold">Client</th>
                      <th className="px-4 py-3 text-right font-semibold">Recurent</th>
                      <th className="px-4 py-3 text-right font-semibold">Ore</th>
                      <th className="px-4 py-3 text-right font-semibold">Reducere</th>
                      <th className="px-4 py-3 text-right font-semibold">Timp</th>
                      <th className="px-4 py-3 text-right font-semibold">Total fără TVA</th>
                      <th className="px-4 py-3 text-right font-semibold">TVA {data.settings.vatRate}%</th>
                      <th className="px-4 py-3 text-right font-semibold">Total cu TVA</th>
                      <th className="px-4 py-3 text-right font-semibold">Încasat</th>
                      <th className="px-4 py-3 text-right font-semibold">De facturat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.rows.map((row) => (
                      <tr key={row.id} className="transition hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={row.company || row.name} color={row.color as AccentColor} logoUrl={row.logoUrl} size="sm" />
                            <span className="font-semibold text-slate-800">{row.company || row.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{formatEur(row.recurent)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{formatEur(row.ore)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">
                          {row.reducere > 0 ? `−${formatEur(row.reducere)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">{formatMinutes(row.minutes)}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{formatEur(row.total)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{formatEur(row.tva)}</td>
                        <td className="px-4 py-3 text-right font-bold text-indigo-600">{formatEur(row.totalCuTva)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">{formatEur(row.incasat)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-violet-600">{formatEur(row.deFacturat)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 text-sm font-bold text-slate-900">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right">{formatEur(data.totals.recurent)}</td>
                      <td className="px-4 py-3 text-right">{formatEur(data.totals.ore)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">
                        {data.totals.reducere > 0 ? `−${formatEur(data.totals.reducere)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">{formatMinutes(data.totals.standardMinutes + data.totals.offHoursMinutes)}</td>
                      <td className="px-4 py-3 text-right">{formatEur(data.totals.total)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatEur(data.totals.tva)}</td>
                      <td className="px-4 py-3 text-right text-indigo-700">{formatEur(data.totals.totalCuTva)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{formatEur(data.totals.incasat)}</td>
                      <td className="px-4 py-3 text-right text-violet-700">{formatEur(data.totals.deFacturat)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
