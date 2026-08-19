import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Download, Moon, Sun } from 'lucide-react';
import { useReports } from '../lib/queries';
import { PageHeader } from '../components/Layout';
import { Avatar, Button, Card, CardTitle, EmptyState, ErrorBlock, Field, Input, LoadingBlock } from '../components/ui';
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
      <PageHeader title="Rapoarte" subtitle="Cât ai facturat și cât mai ai de facturat, pe client și pe lună">
        {data && (
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            onClick={() =>
              downloadCsv(`raport-andaxi-${from}_${to}.csv`, [
                ['Client', 'Recurent EUR', 'Ore EUR', 'Minute lucrate', 'Total EUR', 'Incasat EUR', 'De facturat EUR'],
                ...data.rows.map((row) => [
                  row.company || row.name, row.recurent, row.ore, row.minutes, row.total, row.incasat, row.deFacturat,
                ]),
                ['TOTAL', data.totals.recurent, data.totals.ore, data.totals.standardMinutes + data.totals.offHoursMinutes, data.totals.total, data.totals.incasat, data.totals.deFacturat],
              ])
            }
          >
            Export CSV
          </Button>
        )}
      </PageHeader>

      <Card className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="De la" className="w-full sm:w-48">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Până la" className="w-full sm:w-48">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Total perioadă', value: data.totals.total, gradient: 'from-violet-600 to-fuchsia-500' },
              { label: 'Din abonamente', value: data.totals.recurent, gradient: 'from-blue-500 to-indigo-500' },
              { label: 'Din ore', value: data.totals.ore, gradient: 'from-rose-500 to-pink-500' },
              { label: 'De facturat', value: data.totals.deFacturat, gradient: 'from-amber-500 to-orange-500' },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-3xl bg-gradient-to-br ${stat.gradient} p-4 text-white shadow-soft`}>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{stat.label}</p>
                <p className="mt-2 text-xl font-extrabold">{formatEur(stat.value)}</p>
                <p className="text-[11px] text-white/70">{formatRon(stat.value, data.settings.eurRon)}</p>
              </div>
            ))}
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
                  <Bar dataKey="recurent" stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="ore" stackId="a" fill="#f43f5e" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card className="flex items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-600">
                <Sun className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ore în program normal</p>
                <p className="text-lg font-extrabold text-slate-900">{formatMinutes(data.totals.standardMinutes)}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-100 text-indigo-600">
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
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-semibold">Client</th>
                      <th className="px-4 py-3 text-right font-semibold">Recurent</th>
                      <th className="px-4 py-3 text-right font-semibold">Ore</th>
                      <th className="px-4 py-3 text-right font-semibold">Timp</th>
                      <th className="px-4 py-3 text-right font-semibold">Total</th>
                      <th className="px-4 py-3 text-right font-semibold">Încasat</th>
                      <th className="px-4 py-3 text-right font-semibold">De facturat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.rows.map((row) => (
                      <tr key={row.id} className="transition hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={row.company || row.name} color={row.color as AccentColor} size="sm" />
                            <span className="font-semibold text-slate-800">{row.company || row.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{formatEur(row.recurent)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{formatEur(row.ore)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{formatMinutes(row.minutes)}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{formatEur(row.total)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">{formatEur(row.incasat)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-amber-600">{formatEur(row.deFacturat)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 text-sm font-bold text-slate-900">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right">{formatEur(data.totals.recurent)}</td>
                      <td className="px-4 py-3 text-right">{formatEur(data.totals.ore)}</td>
                      <td className="px-4 py-3 text-right">{formatMinutes(data.totals.standardMinutes + data.totals.offHoursMinutes)}</td>
                      <td className="px-4 py-3 text-right">{formatEur(data.totals.total)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{formatEur(data.totals.incasat)}</td>
                      <td className="px-4 py-3 text-right text-amber-700">{formatEur(data.totals.deFacturat)}</td>
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
