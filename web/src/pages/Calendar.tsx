import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock4, ListChecks } from 'lucide-react';
import { useCalendar } from '../lib/queries';
import { PageHeader } from '../components/Layout';
import { Badge, Button, Card, ErrorBlock, LoadingBlock, Segmented } from '../components/ui';
import { formatDate, formatEur, todayIso } from '../lib/format';
import { grilaLunii, numeLuna, numeZi, schimbaLuna, ZILE_SCURTE } from '../lib/calendar';
import { BILLING_STATUS, PRIORITY, WORK_STATUS } from '../lib/labels';
import { cn } from '../lib/cn';
import type { CalendarEvent, CalendarEventType } from '../lib/types';

type Filtru = 'ALL' | CalendarEventType;

/** Culoarea unui eveniment: roșu doar pentru ce e restant, verde pentru încasat */
function stilEveniment(event: CalendarEvent, azi: string) {
  if (event.type === 'BILLING') {
    // scadență viitoare, încă negenerată în scadențar
    if (event.status === 'PROJECTED') return { punct: 'bg-indigo-300', pastila: 'bg-indigo-50/70 text-indigo-500' };
    if (event.status === 'PAID') return { punct: 'bg-emerald-500', pastila: 'bg-emerald-50 text-emerald-700' };
    if (event.status === 'PENDING' && event.date < azi) return { punct: 'bg-red-500', pastila: 'bg-red-50 text-red-700' };
    if (event.status === 'INVOICED') return { punct: 'bg-slate-400', pastila: 'bg-slate-100 text-slate-600' };
    return { punct: 'bg-indigo-500', pastila: 'bg-indigo-50 text-indigo-700' };
  }
  if (event.type === 'WORK') {
    return { punct: 'bg-violet-500', pastila: 'bg-violet-50 text-violet-700' };
  }
  if (event.status === 'DONE') return { punct: 'bg-slate-300', pastila: 'bg-slate-100 text-slate-500' };
  return { punct: 'bg-amber-500', pastila: 'bg-amber-50 text-amber-700' };
}

const ICOANE: Record<CalendarEventType, typeof Clock4> = {
  BILLING: CalendarClock,
  WORK: Clock4,
  TASK: ListChecks,
};

export function Calendar() {
  const azi = todayIso();
  const [luna, setLuna] = useState(azi.slice(0, 7));
  const [filtru, setFiltru] = useState<Filtru>('ALL');
  const [ziSelectata, setZiSelectata] = useState(azi);

  const zile = useMemo(() => grilaLunii(luna), [luna]);
  const { data, isLoading, error } = useCalendar(zile[0].iso, zile[zile.length - 1].iso);

  const evenimente = useMemo(
    () => (data?.events ?? []).filter((e) => filtru === 'ALL' || e.type === filtru),
    [data, filtru],
  );

  /** Evenimentele grupate pe zi, ca fiecare celulă să le ia direct */
  const peZile = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of evenimente) {
      map.set(event.date, [...(map.get(event.date) ?? []), event]);
    }
    return map;
  }, [evenimente]);

  const evenimenteleZilei = (peZile.get(ziSelectata) ?? []).slice().sort((a, b) => a.type.localeCompare(b.type));

  return (
    <div className="animate-fade-up">
      <PageHeader title="Calendar" subtitle="Ce urmează și ce a fost — scadențe, intervenții și task-uri">
        <Button
          variant="secondary"
          onClick={() => {
            setLuna(azi.slice(0, 7));
            setZiSelectata(azi);
          }}
        >
          Azi
        </Button>
      </PageHeader>

      <Card className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLuna(schimbaLuna(luna, -1))}
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100"
            aria-label="Luna anterioară"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[11rem] text-center text-lg font-extrabold capitalize text-slate-900">
            {numeLuna(luna)}
          </span>
          <button
            onClick={() => setLuna(schimbaLuna(luna, 1))}
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100"
            aria-label="Luna următoare"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <Segmented
          value={filtru}
          onChange={setFiltru}
          options={[
            { value: 'ALL', label: 'Toate' },
            { value: 'BILLING', label: 'Scadențe' },
            { value: 'WORK', label: 'Intervenții' },
            { value: 'TASK', label: 'Task-uri' },
          ]}
        />
      </Card>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={error instanceof Error ? error.message : 'Eroare la încărcare'} />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr),22rem]">
          <Card className="p-3 sm:p-4">
            {/* pe ecrane mici grila se derulează lateral, ca zilele să nu devină ilizibile */}
            <div className="overflow-x-auto">
            <div className="min-w-[640px]">
            <div className="mb-2 grid grid-cols-7 gap-1.5">
              {ZILE_SCURTE.map((zi) => (
                <span key={zi} className="py-1 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <span className="hidden sm:inline">{zi}</span>
                  <span className="sm:hidden">{zi.slice(0, 2)}</span>
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {zile.map((zi) => {
                const aleZilei = peZile.get(zi.iso) ?? [];
                const esteAzi = zi.iso === azi;
                const selectata = zi.iso === ziSelectata;
                return (
                  <button
                    key={zi.iso}
                    type="button"
                    onClick={() => setZiSelectata(zi.iso)}
                    className={cn(
                      'flex min-h-[5.5rem] flex-col gap-1 rounded-2xl border p-1.5 text-left transition sm:min-h-[7rem]',
                      selectata
                        ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200'
                        : 'border-transparent hover:border-slate-200 hover:bg-slate-50',
                      !zi.inLuna && 'opacity-40',
                      zi.weekend && !selectata && 'bg-slate-50/70',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-bold',
                        esteAzi ? 'bg-indigo-600 text-white' : 'text-slate-600',
                      )}
                    >
                      {Number(zi.iso.slice(8))}
                    </span>

                    <span className="flex min-w-0 flex-col gap-0.5">
                      {aleZilei.slice(0, 3).map((event) => {
                        const stil = stilEveniment(event, azi);
                        return (
                          <span
                            key={event.id}
                            className={cn('truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold', stil.pastila)}
                          >
                            {event.type === 'BILLING' && event.amountEur !== undefined
                              ? `${formatEur(event.amountEur)} · ${event.title}`
                              : event.title}
                          </span>
                        );
                      })}
                      {aleZilei.length > 3 && (
                        <span className="px-1.5 text-[11px] font-bold text-slate-400">
                          +{aleZilei.length - 3}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            </div>
            </div>
          </Card>

          <Card className="h-fit">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{numeZi(ziSelectata)}</p>
              <h2 className="text-lg font-extrabold text-slate-900">{formatDate(ziSelectata)}</h2>
            </div>

            {evenimenteleZilei.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 py-10 text-center">
                <CalendarDays className="h-6 w-6 text-slate-300" />
                <p className="text-sm text-slate-400">Nimic în această zi.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {evenimenteleZilei.map((event) => {
                  const stil = stilEveniment(event, azi);
                  const Icoana = ICOANE[event.type];
                  const continut = (
                    <div className="flex items-start gap-3 rounded-2xl border border-slate-100 p-3 transition hover:border-slate-200 hover:bg-slate-50">
                      <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl', stil.pastila)}>
                        <Icoana className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-800">{event.title}</p>
                        <p className="truncate text-xs text-slate-500">{event.subtitle}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {event.type === 'BILLING' &&
                            (event.status === 'PROJECTED' ? (
                              <Badge className="bg-indigo-50 text-indigo-500">Estimat</Badge>
                            ) : (
                              <Badge className={BILLING_STATUS[event.status as keyof typeof BILLING_STATUS]?.chip}>
                                {BILLING_STATUS[event.status as keyof typeof BILLING_STATUS]?.text ?? event.status}
                              </Badge>
                            ))}
                          {event.type === 'WORK' && (
                            <>
                              <Badge className={WORK_STATUS[event.status as keyof typeof WORK_STATUS]?.chip}>
                                {WORK_STATUS[event.status as keyof typeof WORK_STATUS]?.text ?? event.status}
                              </Badge>
                              {event.timeLabel && <span className="text-xs text-slate-400">{event.timeLabel}</span>}
                            </>
                          )}
                          {event.type === 'TASK' && (
                            <Badge className={event.priority ? PRIORITY[event.priority].chip : undefined}>
                              {event.status === 'DONE' ? 'Finalizat' : event.priority ? PRIORITY[event.priority].text : 'De făcut'}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {event.amountEur ? (
                        <span className="shrink-0 text-sm font-extrabold text-slate-900">
                          {formatEur(event.amountEur)}
                        </span>
                      ) : null}
                    </div>
                  );

                  return (
                    <li key={event.id}>
                      {event.clientId ? <Link to={`/clienti/${event.clientId}`}>{continut}</Link> : continut}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {[
                { punct: 'bg-indigo-500', text: 'de facturat' },
                { punct: 'bg-indigo-300', text: 'estimat' },
                { punct: 'bg-red-500', text: 'restant' },
                { punct: 'bg-emerald-500', text: 'încasat' },
                { punct: 'bg-violet-500', text: 'intervenție' },
                { punct: 'bg-amber-500', text: 'task' },
              ].map((item) => (
                <span key={item.text} className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', item.punct)} /> {item.text}
                </span>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
