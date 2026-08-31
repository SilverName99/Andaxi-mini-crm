import { useMemo, useState, type MouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, BadgeCheck, CheckCheck, ChevronLeft, ChevronRight, Clock4, FileDown, Moon, Plus, Sun, Undo2,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  useClient, useCrudMutation, useMonthlyApproval, useMonthlyDiscount, useSettings, useWorkLogs,
} from '../lib/queries';
import { WorkLogDetail } from './WorkLogs';
import { MonthlyDocuments } from '../components/MonthlyDocuments';
import { CeasZi, etichetaInterval, LegendaCeas } from '../components/CeasZi';
import { TimeField } from '../components/TimeField';
import { ImportOre } from '../components/ImportOre';
import { ReducereLunara, calculeazaReducere } from '../components/ReducereLunara';
import { StareConfirmare } from '../components/StareConfirmare';
import {
  Avatar, Badge, Button, Card, ErrorBlock, Field, Input, LoadingBlock, Segmented, Select, Textarea, useToast,
} from '../components/ui';
import { formatDate, formatEur, formatMinutes, minutesToHhMm, todayIso } from '../lib/format';
import { grilaLunii, numeLuna, numeZi, schimbaLuna, ZILE_SCURTE } from '../lib/calendar';
import { minuteSegmente, segmenteInterval, segmenteleZilei, type FereastraProgram } from '../lib/ceas';
import { WORK_CATEGORY, WORK_STATUS, options } from '../lib/labels';
import { optiuniLucrare } from '../lib/lucrari';
import { cn } from '../lib/cn';
import type { AccentColor, Subscription, WorkCategory, WorkLog, WorkStatus } from '../lib/types';

/**
 * Cum arata o zi in ansamblu: incasata daca tot ce e facturabil in ea e
 * incasat, facturata daca tot e cel putin facturat, altfel ramane de facturat.
 */
function stareaZilei(logs: WorkLog[]): WorkStatus | null {
  const facturabile = logs.filter((l) => l.billable);
  if (facturabile.length === 0) return null;
  if (facturabile.every((l) => l.status === 'PAID')) return 'PAID';
  if (facturabile.every((l) => l.status === 'PAID' || l.status === 'INVOICED')) return 'INVOICED';
  return 'PENDING';
}

/** Culoarea pastilei cu orele zilei, dupa starea de facturare */
const PASTILA_ZI: Record<WorkStatus, string> = {
  PENDING: 'bg-indigo-100 text-indigo-700',
  INVOICED: 'bg-slate-200 text-slate-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  NONBILLABLE: 'bg-slate-100 text-slate-500',
};

/**
 * Calendarul de lucru al unui client: o lună pe zile, în care notezi direct
 * câte ore ai lucrat și ce ai făcut. Gândit pentru facturarea la final de lună.
 */
export function ClientCalendar() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { data: client, isLoading } = useClient(id);
  const { data: settings } = useSettings();

  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [ziSelectata, setZiSelectata] = useState(todayIso());
  /** Zilele alese cu Ctrl/Shift, ca sa le poti factura pe toate odata */
  const [zileMarcate, setZileMarcate] = useState<string[]>([]);
  const [detalii, setDetalii] = useState<string | null>(null);
  /** Intervalul desenat acum pe ceas, folosit de formularul de adaugare */
  const [selectie, setSelectie] = useState<{ start: number; end: number } | null>(null);

  const zile = useMemo(() => grilaLunii(month), [month]);
  const { data: logs = [] } = useWorkLogs({
    clientId: id,
    from: zile[0].iso,
    to: zile[zile.length - 1].iso,
  });

  // fereastra programului normal, cu care se coloreaza ceasurile
  const program: FereastraProgram = {
    standardStart: settings?.standardStart ?? 540,
    standardEnd: settings?.standardEnd ?? 960,
    weekendOffHours: settings?.weekendOffHours ?? false,
  };

  const peZile = useMemo(() => {
    const map = new Map<string, WorkLog[]>();
    for (const log of logs) map.set(log.date, [...(map.get(log.date) ?? []), log]);
    return map;
  }, [logs]);

  const etichete = useMemo(
    () => [...new Set(logs.map((l) => l.projectTag).filter(Boolean))].sort(),
    [logs],
  );

  const dinLuna = logs.filter((l) => l.date.startsWith(month));
  const minuteLuna = dinLuna.reduce((s, l) => s + l.standardMinutes + l.offHoursMinutes, 0);
  const valoareLuna = dinLuna
    .filter((l) => l.billable)
    .reduce((s, l) => s + (l.billableEur ?? l.amountEur), 0);

  const { data: discount } = useMonthlyDiscount(id, month);
  const reducere = calculeazaReducere(valoareLuna, discount);

  // confirmarea clientului din portal, comparata cu cifrele de acum
  const { data: confirmare } = useMonthlyApproval(id, month);
  const stareConfirmare = confirmare
    ? {
        ...confirmare,
        changedSince: confirmare.minutes !== minuteLuna || confirmare.billableEur !== valoareLuna,
      }
    : null;

  const aleZilei = peZile.get(ziSelectata) ?? [];

  /* ── alegerea mai multor zile deodata, pentru marcarea in bloc ───────── */

  const zileAlese = zileMarcate.length > 0 ? zileMarcate : [ziSelectata];
  const deMarcat = logs.filter((l) => zileAlese.includes(l.date) && l.billable);
  const valoareAleasa = deMarcat.reduce((s, l) => s + (l.billableEur ?? l.amountEur), 0);

  const marcheaza = useCrudMutation((input: { ids: string[]; status: WorkStatus }) =>
    api.post('/worklogs/bulk', input),
  );

  /**
   * Click simplu = o singura zi. Cu Ctrl (sau ⌘) adaugi/scoti zile una cate
   * una, cu Shift iei tot intervalul de la ultima zi apasata pana aici.
   */
  function apasaZi(zi: string, event: MouseEvent) {
    setSelectie(null); // intervalul desenat era al zilei de dinainte
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
      setZiSelectata(zi);
      setZileMarcate([]);
      return;
    }

    const baza = zileMarcate.length > 0 ? zileMarcate : [ziSelectata];
    if (event.shiftKey) {
      const [de, pana] = ziSelectata <= zi ? [ziSelectata, zi] : [zi, ziSelectata];
      const interval = zile.filter((z) => z.iso >= de && z.iso <= pana).map((z) => z.iso);
      setZileMarcate([...new Set([...baza, ...interval])].sort());
    } else {
      const alese = new Set(baza);
      if (alese.has(zi)) alese.delete(zi);
      else alese.add(zi);
      setZileMarcate([...alese].sort());
    }
    setZiSelectata(zi);
  }

  async function marcheazaZilele(status: WorkStatus, mesaj: string) {
    if (deMarcat.length === 0) return;
    await marcheaza.mutateAsync({ ids: deMarcat.map((l) => l.id), status });
    toast(mesaj);
    setZileMarcate([]);
  }

  /** Intervalele orare ale unei zile, singurele care se pot desena pe ceas */
  const intervaleZilei = (zi: string) =>
    (peZile.get(zi) ?? [])
      .filter((l) => l.entryMode === 'INTERVAL' && l.endMinutes !== l.startMinutes)
      .map((l) => ({ start: l.startMinutes, end: l.endMinutes }));

  const segmenteZiSelectata = segmenteleZilei(ziSelectata, intervaleZilei(ziSelectata), program);
  const minuteCeas = minuteSegmente(segmenteZiSelectata);
  const faraOra = aleZilei.filter((l) => l.entryMode !== 'INTERVAL');

  if (isLoading || !client) return <LoadingBlock />;

  return (
    <div className="animate-fade-up">
      <Link
        to={`/clienti/${id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-indigo-600"
      >
        <ArrowLeft className="h-4 w-4" /> Înapoi la fișa clientului
      </Link>

      <Card className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={client.company || client.name} color={client.color as AccentColor} logoUrl={client.logoUrl} />
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">{client.company || client.name}</h1>
            <p className="text-sm text-slate-500">
              {formatMinutes(minuteLuna)} lucrate în {numeLuna(month)} ·{' '}
              {reducere > 0 ? (
                <>
                  <span className="line-through">{formatEur(valoareLuna)}</span>{' '}
                  <span className="font-bold text-indigo-700">{formatEur(valoareLuna - reducere)}</span> de facturat
                  <span className="text-emerald-700"> (−{formatEur(reducere)})</span>
                </>
              ) : (
                <>{formatEur(valoareLuna)} de facturat</>
              )}
            </p>
            <div className="mt-1.5">
              <StareConfirmare approval={stareConfirmare} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ReducereLunara clientId={id} month={month} billableEur={valoareLuna} />
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
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr),24rem]">
        <Card className="p-3 sm:p-4">
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
                  const ale = peZile.get(zi.iso) ?? [];
                  const minute = ale.reduce((s, l) => s + l.standardMinutes + l.offHoursMinutes, 0);
                  const selectata = zileAlese.includes(zi.iso);
                  const stare = stareaZilei(ale);
                  return (
                    <button
                      key={zi.iso}
                      type="button"
                      onClick={(event) => apasaZi(zi.iso, event)}
                      className={cn(
                        'group flex min-h-[5rem] flex-col gap-1 rounded-2xl border p-1.5 text-left transition sm:min-h-[6rem]',
                        selectata
                          ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200'
                          : 'border-transparent hover:border-slate-200 hover:bg-slate-50',
                        !zi.inLuna && 'opacity-40',
                        zi.weekend && !selectata && 'bg-slate-50/70',
                      )}
                    >
                      <span className="flex items-start justify-between gap-1">
                        <span
                          className={cn(
                            'grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-bold',
                            zi.iso === todayIso() ? 'bg-indigo-600 text-white' : 'text-slate-600',
                          )}
                        >
                          {Number(zi.iso.slice(8))}
                        </span>
                        {(() => {
                          const segmente = segmenteleZilei(zi.iso, intervaleZilei(zi.iso), program);
                          return segmente.length > 0 ? <CeasZi segmente={segmente} marime="mic" /> : null;
                        })()}
                      </span>

                      {minute > 0 ? (
                        <span
                          className={cn(
                            'rounded-lg px-1.5 py-0.5 text-center text-xs font-bold',
                            PASTILA_ZI[stare ?? 'NONBILLABLE'],
                          )}
                        >
                          {formatMinutes(minute)}
                        </span>
                      ) : (
                        <span className="grid flex-1 place-items-center text-slate-300 opacity-0 transition group-hover:opacity-100">
                          <Plus className="h-4 w-4" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {deMarcat.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5">
              <span className="text-xs font-semibold text-slate-600">
                {zileAlese.length === 1 ? formatDate(zileAlese[0]) : `${zileAlese.length} zile alese`} ·{' '}
                {deMarcat.length} {deMarcat.length === 1 ? 'intervenție' : 'intervenții'} ·{' '}
                <span className="text-slate-900">{formatEur(valoareAleasa)}</span>
              </span>
              {zileMarcate.length > 0 && (
                <button
                  onClick={() => setZileMarcate([])}
                  className="text-xs font-semibold text-slate-400 transition hover:text-indigo-600"
                >
                  renunță
                </button>
              )}
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Undo2 className="h-3.5 w-3.5" />}
                  loading={marcheaza.isPending}
                  onClick={() => marcheazaZilele('PENDING', 'Trecute înapoi la de facturat')}
                >
                  De facturat
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<CheckCheck className="h-3.5 w-3.5" />}
                  loading={marcheaza.isPending}
                  onClick={() => marcheazaZilele('INVOICED', 'Marcate ca facturate')}
                >
                  Facturate
                </Button>
                <Button
                  size="sm"
                  variant="success"
                  icon={<BadgeCheck className="h-3.5 w-3.5" />}
                  loading={marcheaza.isPending}
                  onClick={() => marcheazaZilele('PAID', 'Marcate ca încasate')}
                >
                  Încasate
                </Button>
              </span>
            </div>
          )}

          <p className="mt-2 text-center text-xs text-slate-400">
            Ține <kbd className="rounded bg-slate-100 px-1 font-sans font-semibold text-slate-500">Ctrl</kbd> apăsat
            ca să alegi mai multe zile, sau{' '}
            <kbd className="rounded bg-slate-100 px-1 font-sans font-semibold text-slate-500">Shift</kbd> pentru un
            interval de zile.
          </p>

          <a
            href={`/api/month-report?clientId=${id}&month=${month}`}
            className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700"
          >
            <FileDown className="h-4 w-4" /> Descarcă fișier explicativ (PDF)
          </a>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{numeZi(ziSelectata)}</p>
              <h2 className="text-lg font-extrabold text-slate-900">{formatDate(ziSelectata)}</h2>
            </div>

            <div className="mb-4 flex flex-col items-center gap-2">
              <CeasZi
                segmente={segmenteZiSelectata}
                selectie={selectie}
                onSelectie={setSelectie}
                program={program}
                date={ziSelectata}
                marime="mare"
              />
              <p className="flex items-center gap-2 text-sm font-bold text-slate-700">
                {selectie
                  ? etichetaInterval(selectie.start, selectie.end)
                  : minuteCeas.standard + minuteCeas.offHours > 0
                    ? formatMinutes(minuteCeas.standard + minuteCeas.offHours)
                    : 'Nicio oră notată'}
                {selectie && (
                  <button
                    onClick={() => setSelectie(null)}
                    className="text-xs font-semibold text-slate-400 transition hover:text-indigo-600"
                  >
                    renunță
                  </button>
                )}
              </p>
              <LegendaCeas />
              {faraOra.length > 0 && (
                <p className="text-xs text-slate-400">
                  + {formatMinutes(faraOra.reduce((s, l) => s + l.standardMinutes + l.offHoursMinutes, 0))} fără
                  interval orar
                </p>
              )}
            </div>

            {aleZilei.length > 0 && (
              <ul className="mb-4 flex flex-col gap-2">
                {aleZilei.map((log) => (
                  <li key={log.id}>
                    <button
                      onClick={() => setDetalii(log.id)}
                      className="w-full rounded-2xl border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-800">
                          {formatMinutes(log.standardMinutes + log.offHoursMinutes)}
                          {log.entryMode === 'INTERVAL' && (
                            <span className="ml-2 text-xs font-medium text-slate-400">
                              {minutesToHhMm(log.startMinutes)}–{minutesToHhMm(log.endMinutes)}
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            'text-sm font-extrabold',
                            log.billable ? 'text-slate-900' : 'text-slate-400',
                          )}
                        >
                          {formatEur(log.billableEur ?? log.amountEur)}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{log.description || '—'}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {log.projectTag && (
                          <Badge className="bg-indigo-50 text-indigo-600">{log.projectTag}</Badge>
                        )}
                        {log.includedInPackage && (
                          <Badge className="bg-emerald-50 text-emerald-700">Inclus în pachet</Badge>
                        )}
                        {log.billable && (
                          <Badge className={WORK_STATUS[log.status].chip}>{WORK_STATUS[log.status].text}</Badge>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <AdaugaOre
              clientId={id}
              date={ziSelectata}
              abonamente={client.subscriptions ?? []}
              etichete={etichete}
              rateStandard={settings?.standardRate}
              rateOffHours={settings?.offHoursRate}
              selectie={selectie}
              setSelectie={setSelectie}
              program={program}
              onSaved={() => {
                setSelectie(null);
                toast('Ore adăugate');
              }}
            />
          </Card>

          <Card>
            <ImportOre clientId={id} clientName={client.company || client.name} />
          </Card>

          <Card>
            <MonthlyDocuments clientId={id} month={month} />
          </Card>
        </div>
      </div>

      {detalii && <WorkLogDetail logId={detalii} onClose={() => setDetalii(null)} />}
    </div>
  );
}

/** Formularul scurt de adăugare a orelor pentru o zi */
function AdaugaOre({
  clientId,
  date,
  abonamente,
  etichete,
  rateStandard,
  rateOffHours,
  selectie,
  setSelectie,
  program,
  onSaved,
}: {
  clientId: string;
  date: string;
  abonamente: Subscription[];
  etichete: string[];
  rateStandard?: number;
  rateOffHours?: number;
  selectie: { start: number; end: number } | null;
  setSelectie: (interval: { start: number; end: number } | null) => void;
  program: FereastraProgram;
  onSaved: () => void;
}) {
  const [mod, setMod] = useState<'interval' | 'durata'>('interval');
  const [hours, setHours] = useState('');
  const [rateType, setRateType] = useState<'STANDARD' | 'OFF_HOURS'>('STANDARD');
  const [description, setDescription] = useState('');
  const [projectTag, setProjectTag] = useState('');
  const [category, setCategory] = useState<WorkCategory>('SUPORT');
  const [error, setError] = useState('');

  const salveaza = useCrudMutation((payload: unknown) => api.post('/worklogs', payload));
  const ore = Number(hours.replace(',', '.'));
  const tarif = rateType === 'STANDARD' ? rateStandard : rateOffHours;

  // cat costa intervalul desenat, dupa aceeasi impartire ca pe server
  const segmenteSelectie = selectie ? segmenteInterval(date, selectie.start, selectie.end, program) : [];
  const minuteSelectie = minuteSegmente(segmenteSelectie);
  const valoareSelectie =
    ((minuteSelectie.standard / 60) * (rateStandard ?? 0)) +
    ((minuteSelectie.offHours / 60) * (rateOffHours ?? 0));

  function schimbaOra(capat: 'start' | 'end', valoare: string) {
    const [h, m] = valoare.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const minut = h * 60 + m;
    const curent = selectie ?? { start: minut, end: minut + 60 };
    const nou = capat === 'start' ? { ...curent, start: minut } : { ...curent, end: minut };
    setSelectie(nou.end > nou.start ? nou : { start: Math.min(nou.start, nou.end), end: Math.max(nou.start, nou.end) });
  }

  async function trimite() {
    setError('');
    const dateComune = { clientId, date, description, projectTag, category };

    if (mod === 'interval') {
      if (!selectie || selectie.end <= selectie.start) {
        return setError('Desenează pe ceas intervalul în care ai lucrat');
      }
      try {
        await salveaza.mutateAsync({
          ...dateComune,
          start: minutesToHhMm(selectie.start),
          end: minutesToHhMm(selectie.end % 1440),
        });
        setDescription('');
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Eroare la salvare');
      }
      return;
    }

    if (!ore || ore <= 0) return setError('Scrie câte ore ai lucrat');
    try {
      await salveaza.mutateAsync({ ...dateComune, hours: ore, rateType });
      setHours('');
      setDescription('');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la salvare');
    }
  }

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Clock4 className="h-3.5 w-3.5" /> Adaugă ore în această zi
      </p>

      <div className="flex flex-col gap-3">
        <Segmented
          value={mod}
          onChange={(v) => {
            setMod(v);
            if (v === 'durata') setSelectie(null);
          }}
          options={[
            { value: 'interval', label: 'Interval orar' },
            { value: 'durata', label: 'Doar durata' },
          ]}
        />

        {mod === 'interval' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="De la">
              <TimeField
                value={selectie ? minutesToHhMm(selectie.start) : ''}
                onChange={(v) => schimbaOra('start', v)}
              />
            </Field>
            <Field label="Până la">
              <TimeField
                value={selectie ? minutesToHhMm(selectie.end % 1440) : ''}
                onChange={(v) => schimbaOra('end', v)}
              />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-[6rem,1fr] gap-3">
            <Field label="Ore">
              <Input
                type="number"
                min={0}
                step="0.25"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="2"
              />
            </Field>
            <Field label="Tarif">
              <Segmented
                value={rateType}
                onChange={setRateType}
                options={[
                  { value: 'STANDARD', label: 'Program normal' },
                  { value: 'OFF_HOURS', label: 'În afara programului' },
                ]}
              />
            </Field>
          </div>
        )}

        <Field label="Ce ai lucrat">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex. Stoc ofertă (opțional) — bug"
            className="min-h-[70px]"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Lucrare / proiect"
            hint={abonamente.length ? undefined : 'Clientul nu are abonamente'}
          >
            <Select
              value={projectTag}
              onChange={(e) => setProjectTag(e.target.value)}
              options={optiuniLucrare(abonamente, etichete, projectTag)}
            />
          </Field>
          <Field label="Categorie">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as WorkCategory)}
              options={options(WORK_CATEGORY)}
            />
          </Field>
        </div>

        {mod === 'interval' && selectie && selectie.end > selectie.start && rateStandard && rateOffHours && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Clock4 className="h-4 w-4 text-indigo-500" />
            {etichetaInterval(selectie.start, selectie.end)} ·{' '}
            {formatMinutes(minuteSelectie.standard + minuteSelectie.offHours)}
            {minuteSelectie.offHours > 0 && (
              <span className="text-xs text-fuchsia-600">
                ({formatMinutes(minuteSelectie.offHours)} în afara programului)
              </span>
            )}
            <span className="font-bold text-indigo-700">= {formatEur(valoareSelectie)}</span>
          </p>
        )}

        {mod === 'durata' && ore > 0 && tarif && (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            {rateType === 'STANDARD' ? (
              <Sun className="h-4 w-4 text-indigo-500" />
            ) : (
              <Moon className="h-4 w-4 text-indigo-500" />
            )}
            {ore} h × {tarif} € ={' '}
            <span className="font-bold text-indigo-700">{formatEur(ore * tarif)}</span>
            <span className="text-xs text-slate-400">înainte de orele incluse</span>
          </p>
        )}

        {error && <ErrorBlock message={error} />}

        <Button icon={<Plus className="h-4 w-4" />} loading={salveaza.isPending} onClick={trimite}>
          Adaugă
        </Button>
      </div>
    </div>
  );
}
