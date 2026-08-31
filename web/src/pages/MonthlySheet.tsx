import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileSpreadsheet, Printer } from 'lucide-react';
import { useClients, useMonthlySheet } from '../lib/queries';
import { PageHeader } from '../components/Layout';
import { Badge, Card, EmptyState, ErrorBlock, Field, LoadingBlock, Select } from '../components/ui';
import { formatDate, formatEur, formatMinutes, formatRon, todayIso } from '../lib/format';
import { numeLuna, schimbaLuna } from '../lib/calendar';
import { WORK_CATEGORY } from '../lib/labels';
import { MonthlyDocuments } from '../components/MonthlyDocuments';
import { ReducereLunara } from '../components/ReducereLunara';
import { StareConfirmare } from '../components/StareConfirmare';
import type { MonthlySheetRow } from '../lib/types';

/** Ce a plătit ora: abonamentul, un tarif, o sumă negociată sau nimic */
function sursa(row: MonthlySheetRow): { text: string; chip: string } {
  if (row.paidMinutes >= row.minutes && row.minutes > 0) {
    return { text: 'din orele abonamentului', chip: 'bg-emerald-50 text-emerald-700' };
  }
  if (row.includedInPackage) return { text: 'inclus în pachet', chip: 'bg-emerald-50 text-emerald-700' };
  if (!row.billable) return { text: 'nefacturabil', chip: 'bg-slate-100 text-slate-500' };
  if (row.manualAmount) return { text: 'sumă negociată', chip: 'bg-violet-50 text-violet-700' };
  if (row.includedMinutes >= row.minutes) return { text: 'inclus în pachet', chip: 'bg-emerald-50 text-emerald-700' };
  if (row.packageMinutes >= row.minutes) return { text: 'din pachetul preplătit', chip: 'bg-indigo-50 text-indigo-700' };
  if (row.paidMinutes > 0 || row.includedMinutes > 0 || row.packageMinutes > 0) {
    const parti = [
      row.paidMinutes > 0 ? `${formatMinutes(row.paidMinutes)} din orele abonamentului` : '',
      row.includedMinutes > 0 ? `${formatMinutes(row.includedMinutes)} din pachet` : '',
      row.packageMinutes > 0 ? `${formatMinutes(row.packageMinutes)} din pachet` : '',
      row.billableMinutes > 0 ? `${formatMinutes(row.billableMinutes)} facturate` : '',
    ].filter(Boolean);
    return { text: parti.join(' + '), chip: 'bg-indigo-50 text-indigo-700' };
  }
  const tarife = [
    row.standardMinutes > 0 ? `${formatMinutes(row.standardMinutes)} × ${row.standardRate}€` : '',
    row.offHoursMinutes > 0 ? `${formatMinutes(row.offHoursMinutes)} × ${row.offHoursRate}€` : '',
  ].filter(Boolean);
  return { text: tarife.join(' + '), chip: 'bg-slate-100 text-slate-600' };
}

export function MonthlySheet() {
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState('');
  const [month, setMonth] = useState(todayIso().slice(0, 7));

  // la prima încărcare alegem primul client, ca ecranul să nu fie gol degeaba
  const clientCurent = clientId || clients[0]?.id || '';
  const { data, isLoading, error } = useMonthlySheet(clientCurent, month);

  const peEtichete = useMemo(() => {
    const map = new Map<string, MonthlySheetRow[]>();
    for (const row of data?.rows ?? []) {
      map.set(row.projectTag, [...(map.get(row.projectTag) ?? []), row]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  return (
    <div className="animate-fade-up">
      <div className="no-print">
        <PageHeader title="Fișă lunară" subtitle="Ce s-a lucrat într-o lună la un client și cât se facturează" />

        <Card className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <Field label="Client" className="w-full lg:max-w-xs">
            <Select
              value={clientCurent}
              onChange={(e) => setClientId(e.target.value)}
              options={clients.map((c) => ({ value: c.id, label: c.company || c.name }))}
            />
          </Field>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMonth(schimbaLuna(month, -1))}
              className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100"
              aria-label="Luna anterioară"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="min-w-[10rem] text-center font-bold capitalize text-slate-900">{numeLuna(month)}</span>
            <button
              onClick={() => setMonth(schimbaLuna(month, 1))}
              className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100"
              aria-label="Luna următoare"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {data && (
            <ReducereLunara clientId={clientCurent} month={month} billableEur={data.totals.billableEur} />
          )}

          <button
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" /> Printează / salvează PDF
          </button>
        </Card>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorBlock message={error instanceof Error ? error.message : 'Eroare la încărcare'} />
      ) : (
        <Card className="p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              {data.client.logoUrl && (
                <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5">
                  <img
                    src={data.client.logoUrl}
                    alt={data.client.company || data.client.name}
                    className="max-h-full max-w-full object-contain"
                  />
                </span>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Fișă de lucru</p>
                <h2 className="text-xl font-extrabold text-slate-900">{data.client.company || data.client.name}</h2>
                {data.client.cui && <p className="text-sm text-slate-500">{data.client.cui}</p>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Perioada</p>
              <p className="text-lg font-bold capitalize text-slate-800">{numeLuna(month)}</p>
              <p className="text-sm text-slate-500">{data.settings.companyName}</p>
              <div className="mt-1.5 flex justify-end">
                <StareConfirmare approval={data.approval} />
              </div>
            </div>
          </div>

          {data.packages.length > 0 && (
            <div className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                Extras pachet — {data.packages.map((p) => p.packageName).join(', ')}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {[
                  { eticheta: 'Sold la început', valoare: data.packageStatement.openingMinutes },
                  { eticheta: 'Primite în lună', valoare: data.packageStatement.creditedMinutes },
                  { eticheta: 'Consumate', valoare: data.packageStatement.usedMinutes },
                  { eticheta: 'Sold rămas', valoare: data.packageStatement.closingMinutes },
                ].map((item, index) => (
                  <div key={item.eticheta}>
                    <p className="text-xs text-slate-500">{item.eticheta}</p>
                    <p className={index === 3 ? 'font-extrabold text-indigo-700' : 'font-semibold text-slate-800'}>
                      {formatMinutes(item.valoare)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.rows.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet className="h-6 w-6" />}
              title="Nicio lucrare în luna aceasta"
              message="Alege altă lună sau alt client."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Data</th>
                      <th className="py-2 pr-3 font-semibold">Lucrare</th>
                      <th className="py-2 pr-3 text-right font-semibold">Ore</th>
                      <th className="py-2 pr-3 font-semibold">Sursă</th>
                      <th className="py-2 text-right font-semibold">Valoare</th>
                    </tr>
                  </thead>

                  {peEtichete.map(([eticheta, randuri]) => (
                    <tbody key={eticheta || 'fara'} className="divide-y divide-slate-100">
                      {peEtichete.length > 1 && (
                        <tr>
                          <td colSpan={5} className="pt-4 text-xs font-bold uppercase tracking-wide text-indigo-500">
                            {eticheta || 'Fără etichetă'}
                          </td>
                        </tr>
                      )}
                      {randuri.map((row) => {
                        const s = sursa(row);
                        return (
                          <tr key={row.id} className="align-top">
                            <td className="py-2.5 pr-3 whitespace-nowrap text-slate-600">{formatDate(row.date)}</td>
                            <td className="py-2.5 pr-3">
                              <p className="whitespace-pre-wrap font-medium leading-relaxed text-slate-800">{row.description || '—'}</p>
                              <p className="text-xs text-slate-400">
                                {WORK_CATEGORY[row.category].text}
                                {row.timeLabel && ` · ${row.timeLabel}`}
                              </p>
                            </td>
                            <td className="py-2.5 pr-3 text-right font-semibold text-slate-700">
                              {formatMinutes(row.minutes)}
                            </td>
                            <td className="py-2.5 pr-3">
                              <Badge className={s.chip}>{s.text}</Badge>
                            </td>
                            <td className="py-2.5 text-right font-bold text-slate-900">{formatEur(row.billableEur)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  ))}
                </table>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <MonthlyDocuments clientId={clientCurent} month={month} documents={data.documents} />
              </div>

              <div className="mt-6 flex flex-col gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between">
                <div className="text-sm text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-800">{formatMinutes(data.totals.minutes)}</span> lucrate în
                    total
                  </p>
                  {data.totals.packageMinutes > 0 && (
                    <p className="mt-1">
                      <span className="font-semibold text-indigo-700">
                        {formatMinutes(data.totals.packageMinutes)}
                      </span>{' '}
                      acoperite din pachetul preplătit
                    </p>
                  )}
                  {data.totals.includedMinutes > 0 && (
                    <p className="mt-1">
                      din care{' '}
                      <span className="font-semibold text-emerald-700">
                        {formatMinutes(data.totals.usedIncludedMinutes)}
                      </span>{' '}
                      acoperite din pachet
                      {data.totals.remainingIncludedMinutes > 0 && (
                        <> · au rămas {formatMinutes(data.totals.remainingIncludedMinutes)} neconsumate</>
                      )}
                    </p>
                  )}
                  {data.includedFrom.length > 0 && (
                    <p className="mt-1 text-xs text-slate-400">
                      {data.includedFrom.map((sub) => `${sub.label}: ${sub.hours} h/lună`).join(' · ')}
                    </p>
                  )}
                </div>

                <div className="min-w-[16rem] rounded-2xl bg-slate-50 p-4 text-sm">
                  <div className="flex justify-between gap-4 py-1 text-slate-600">
                    <span>Ore de facturat</span>
                    <span className="font-semibold">{formatMinutes(data.totals.billableMinutes)}</span>
                  </div>
                  {data.totals.coveredEur > 0 && (
                    <div className="flex justify-between gap-4 py-1 text-emerald-700">
                      <span>
                        Deja plătit
                        {data.totals.packageMinutes > 0 && data.totals.usedIncludedMinutes > 0
                          ? ' (abonament + pachet)'
                          : data.totals.packageMinutes > 0
                            ? ' (pachet)'
                            : ' (abonament)'}
                      </span>
                      <span className="font-semibold">−{formatEur(data.totals.coveredEur)}</span>
                    </div>
                  )}
                  {data.totals.discountEur > 0 && (
                    <div className="flex justify-between gap-4 py-1 text-emerald-700">
                      <span>
                        Reducere{' '}
                        {data.discount?.type === 'PERCENT' ? `${data.discount.value}%` : ''}
                        {data.discount?.note ? ` · ${data.discount.note}` : ''}
                      </span>
                      <span className="font-semibold">−{formatEur(data.totals.discountEur)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 border-t border-slate-200 py-1.5 pt-2 text-slate-700">
                    <span>Total fără TVA</span>
                    <span className="font-bold">{formatEur(data.totals.netEur)}</span>
                  </div>
                  <div className="flex justify-between gap-4 py-1 text-slate-500">
                    <span>TVA {data.settings.vatRate}%</span>
                    <span>{formatEur(data.totals.tva)}</span>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base">
                    <span className="font-bold text-slate-800">Total cu TVA</span>
                    <span className="font-extrabold text-indigo-700">{formatEur(data.totals.totalCuTva)}</span>
                  </div>
                  <p className="mt-1 text-right text-xs text-slate-400">
                    {formatRon(data.totals.totalCuTva, data.settings.eurRon)} la curs {data.settings.eurRon.toFixed(2)}
                  </p>
                </div>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
