import { useMemo, useState } from 'react';
import { CalendarDays, Clock4, Download, FileText, Wallet } from 'lucide-react';
import { Badge, Card, EmptyState, LoadingBlock } from '../components/ui';
import { Ceas24, LegendaCeas } from '../components/Ceas24';
import { formatDate, formatEur, formatFileSize, formatMinutes, formatRon } from '../lib/format';
import { grilaLunii, numeZi, ZILE_SCURTE } from '../lib/calendar';
import { WORK_CATEGORY } from '../lib/labels';
import { minuteSegmente, segmenteleZilei, type FereastraProgram } from '../lib/ceas';
import { cn } from '../lib/cn';
import type { PortalMe, PortalMonth, PortalRow } from './api';

/** Ce a acoperit orele unei lucrări: abonamentul, pachetul sau factura */
function sursa(row: PortalRow): { text: string; chip: string } | null {
  if (row.includedInPackage) return { text: 'inclus în abonament', chip: 'bg-emerald-50 text-emerald-700' };
  if (!row.billable) return { text: 'fără cost', chip: 'bg-emerald-50 text-emerald-700' };
  if (row.includedMinutes >= row.minutes) return { text: 'inclus în abonament', chip: 'bg-emerald-50 text-emerald-700' };
  if (row.packageMinutes >= row.minutes) return { text: 'din pachetul de ore', chip: 'bg-indigo-50 text-indigo-700' };
  if (row.includedMinutes > 0 || row.packageMinutes > 0) {
    return {
      text: `${formatMinutes(row.includedMinutes + row.packageMinutes)} incluse + ${formatMinutes(row.billableMinutes)} de plată`,
      chip: 'bg-indigo-50 text-indigo-700',
    };
  }
  return null;
}

/** Cifra mare dintr-un card de sumar, în stilul restului aplicației */
function Cifra({
  eticheta,
  valoare,
  detaliu,
  icon,
  tenta = 'neutru',
}: {
  eticheta: string;
  valoare: string;
  detaliu?: string;
  icon: React.ReactNode;
  tenta?: 'neutru' | 'accent' | 'verde';
}) {
  const culori = {
    neutru: { valoare: 'text-slate-900', chip: 'bg-slate-100 text-slate-500' },
    accent: { valoare: 'text-indigo-600', chip: 'bg-indigo-100 text-indigo-600' },
    verde: { valoare: 'text-emerald-600', chip: 'bg-emerald-100 text-emerald-600' },
  }[tenta];

  return (
    <div className="card h-full p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{eticheta}</p>
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-2xl', culori.chip)}>{icon}</span>
      </div>
      <p className={cn('mt-3 text-2xl font-extrabold leading-tight', culori.valoare)}>{valoare}</p>
      {detaliu && <p className="mt-1.5 text-xs font-medium text-slate-400">{detaliu}</p>}
    </div>
  );
}

export function PortalLuna({
  luna,
  date,
  me,
  seIncarca,
}: {
  luna: string;
  date?: PortalMonth;
  me: PortalMe;
  seIncarca: boolean;
}) {
  const [ziSelectata, setZiSelectata] = useState<string | null>(null);
  const zile = useMemo(() => grilaLunii(luna), [luna]);
  const bani = me.flags.showMoney;

  const peZile = useMemo(() => {
    const map = new Map<string, PortalRow[]>();
    for (const row of date?.rows ?? []) map.set(row.date, [...(map.get(row.date) ?? []), row]);
    return map;
  }, [date]);

  const program: FereastraProgram = me.program;

  /** Ceasul unei zile: doar lucrările notate cu interval orar pot fi desenate */
  const segmenteZi = (zi: string) =>
    segmenteleZilei(
      zi,
      (peZile.get(zi) ?? [])
        .filter((r) => r.entryMode === 'INTERVAL' && r.endMinutes !== r.startMinutes)
        .map((r) => ({ start: r.startMinutes, end: r.endMinutes })),
      program,
    );

  if (seIncarca) return <LoadingBlock />;
  if (!date) return null;

  const t = date.totals;
  const afisate = ziSelectata ? (peZile.get(ziSelectata) ?? []) : (date.rows ?? []);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Cifra
          eticheta="Ore lucrate"
          valoare={formatMinutes(t.minutes)}
          detaliu={`${date.rows.length} ${date.rows.length === 1 ? 'lucrare' : 'lucrări'}`}
          icon={<Clock4 className="h-5 w-5" />}
        />
        {bani && (
          <Cifra
            eticheta="De plată"
            valoare={formatEur(t.netEur ?? 0)}
            detaliu={`${formatRon(t.netEur ?? 0, me.currency.eurRon)}${me.flags.showVat ? ' · fără TVA' : ''}`}
            icon={<Wallet className="h-5 w-5" />}
            tenta="accent"
          />
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.15fr,1fr]">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-indigo-500" />
            <p className="text-sm font-bold text-slate-800">Zilele lunii</p>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {ZILE_SCURTE.map((zi) => (
              <span key={zi} className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {zi.slice(0, 2)}
              </span>
            ))}
            {zile.map((zi) => {
              const ale = peZile.get(zi.iso) ?? [];
              const minute = ale.reduce((s, r) => s + r.minutes, 0);
              const selectata = ziSelectata === zi.iso;
              return (
                <button
                  key={zi.iso}
                  onClick={() => setZiSelectata(selectata ? null : zi.iso)}
                  disabled={!zi.inLuna}
                  className={cn(
                    'relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-2xl border text-xs transition',
                    !zi.inLuna && 'cursor-default border-transparent text-slate-300',
                    zi.inLuna && !minute && 'border-slate-100 text-slate-500 hover:border-slate-300',
                    zi.inLuna && minute > 0 && 'border-indigo-200 bg-indigo-50 font-bold text-indigo-700 hover:border-indigo-400',
                    selectata && 'border-indigo-500 ring-2 ring-indigo-200',
                  )}
                >
                  {zi.inLuna && segmenteZi(zi.iso).length > 0 && (
                    <span className="absolute right-1 top-1">
                      <Ceas24 segmente={segmenteZi(zi.iso)} marime="mic" />
                    </span>
                  )}
                  <span>{Number(zi.iso.slice(-2))}</span>
                  {minute > 0 && <span className="text-[10px] font-semibold">{formatMinutes(minute)}</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Apasă pe o zi ca să vezi doar lucrările din ea.
          </p>
        </Card>

        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-800">
              {ziSelectata ? `${numeZi(ziSelectata)}, ${formatDate(ziSelectata)}` : 'Toate lucrările lunii'}
            </p>
            {ziSelectata && (
              <button
                onClick={() => setZiSelectata(null)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Vezi toată luna
              </button>
            )}
          </div>

          {ziSelectata && segmenteZi(ziSelectata).length > 0 && (
            <div className="mb-4 flex flex-col items-center gap-2 rounded-2xl bg-slate-50 p-4">
              <Ceas24 segmente={segmenteZi(ziSelectata)} program={program} date={ziSelectata} marime="mare" />
              <p className="text-sm font-bold text-slate-700">
                {formatMinutes(
                  minuteSegmente(segmenteZi(ziSelectata)).standard +
                    minuteSegmente(segmenteZi(ziSelectata)).offHours,
                )}{' '}
                lucrate
              </p>
              <LegendaCeas />
            </div>
          )}

          {afisate.length === 0 ? (
            <EmptyState
              icon={<Clock4 className="h-6 w-6" />}
              title="Nicio lucrare"
              message={ziSelectata ? 'În ziua asta nu s-a lucrat.' : 'Luna asta nu are ore înregistrate.'}
            />
          ) : (
            <ul className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1">
              {afisate.map((row) => {
                const eticheta = sursa(row);
                return (
                  <li key={row.id} className="rounded-2xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-800">
                        {formatDate(row.date)}
                        <span className="ml-2 text-xs font-medium text-slate-400">
                          {row.timeLabel || formatMinutes(row.minutes)}
                        </span>
                      </span>
                      {bani && (
                        <span
                          className={cn(
                            'text-sm font-extrabold',
                            (row.billableEur ?? 0) > 0 ? 'text-slate-900' : 'text-emerald-600',
                          )}
                        >
                          {(row.billableEur ?? 0) > 0 ? formatEur(row.billableEur ?? 0) : 'inclus'}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{row.description || '—'}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge className={WORK_CATEGORY[row.category].chip}>{WORK_CATEGORY[row.category].text}</Badge>
                      {row.projectTag && (
                        <Badge className="bg-slate-100 text-slate-600">{row.projectTag}</Badge>
                      )}
                      {eticheta && <Badge className={eticheta.chip}>{eticheta.text}</Badge>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {date.documents.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-500" />
            <p className="text-sm font-bold text-slate-800">Documentele lunii</p>
          </div>
          <ul className="flex flex-col gap-2">
            {date.documents.map((doc) => (
              <li key={doc.id}>
                <a
                  href={`/api/portal/documents/${doc.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm transition hover:border-indigo-300 hover:bg-indigo-50/50"
                >
                  <span className="min-w-0 truncate font-semibold text-slate-700">{doc.fileName}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                    {formatFileSize(doc.size)} <Download className="h-4 w-4 text-indigo-500" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {bani && (
        <Card className="ml-auto w-full max-w-sm">
          <div className="text-sm">
            {(t.discountEur ?? 0) > 0 && (
              <div className="flex justify-between gap-4 py-1 text-emerald-700">
                <span>Reducere</span>
                <span className="font-semibold">−{formatEur(t.discountEur ?? 0)}</span>
              </div>
            )}
            <div className="flex justify-between gap-4 py-1.5 text-slate-700">
              <span>De plată</span>
              <span className="font-bold">{formatEur(t.netEur ?? 0)}</span>
            </div>
            {me.flags.showVat && (
              <>
                <div className="flex justify-between gap-4 py-1 text-slate-500">
                  <span>TVA</span>
                  <span>{formatEur(t.tva ?? 0)}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-slate-200 py-2 text-base font-extrabold text-slate-900">
                  <span>Total cu TVA</span>
                  <span>{formatEur(t.totalCuTva ?? 0)}</span>
                </div>
              </>
            )}
            <p className="mt-1 text-right text-xs text-slate-400">
              {formatRon(t.totalCuTva ?? t.netEur ?? 0, me.currency.eurRon)}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
