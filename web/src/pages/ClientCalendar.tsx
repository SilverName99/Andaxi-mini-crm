import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock4, Moon, Plus, Sun } from 'lucide-react';
import { api } from '../lib/api';
import { useClient, useCrudMutation, useMonthlyDiscount, useSettings, useWorkLogs } from '../lib/queries';
import { WorkLogDetail } from './WorkLogs';
import { MonthlyDocuments } from '../components/MonthlyDocuments';
import { ImportOre } from '../components/ImportOre';
import { ReducereLunara, calculeazaReducere } from '../components/ReducereLunara';
import {
  Avatar, Badge, Button, Card, ErrorBlock, Field, Input, LoadingBlock, Segmented, Select, Textarea, useToast,
} from '../components/ui';
import { formatDate, formatEur, formatMinutes, minutesToHhMm, todayIso } from '../lib/format';
import { grilaLunii, numeLuna, numeZi, schimbaLuna, ZILE_SCURTE } from '../lib/calendar';
import { WORK_CATEGORY, options } from '../lib/labels';
import { optiuniLucrare } from '../lib/lucrari';
import { cn } from '../lib/cn';
import type { AccentColor, Subscription, WorkCategory, WorkLog } from '../lib/types';

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
  const [detalii, setDetalii] = useState<string | null>(null);

  const zile = useMemo(() => grilaLunii(month), [month]);
  const { data: logs = [] } = useWorkLogs({
    clientId: id,
    from: zile[0].iso,
    to: zile[zile.length - 1].iso,
  });

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

  const aleZilei = peZile.get(ziSelectata) ?? [];

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
                  const selectata = zi.iso === ziSelectata;
                  return (
                    <button
                      key={zi.iso}
                      type="button"
                      onClick={() => setZiSelectata(zi.iso)}
                      className={cn(
                        'group flex min-h-[5rem] flex-col gap-1 rounded-2xl border p-1.5 text-left transition sm:min-h-[6rem]',
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
                          zi.iso === todayIso() ? 'bg-indigo-600 text-white' : 'text-slate-600',
                        )}
                      >
                        {Number(zi.iso.slice(8))}
                      </span>

                      {minute > 0 ? (
                        <span className="rounded-lg bg-indigo-100 px-1.5 py-0.5 text-center text-xs font-bold text-indigo-700">
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
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{numeZi(ziSelectata)}</p>
              <h2 className="text-lg font-extrabold text-slate-900">{formatDate(ziSelectata)}</h2>
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
                      <p className="mt-1 text-sm text-slate-600">{log.description || '—'}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {log.projectTag && (
                          <Badge className="bg-indigo-50 text-indigo-600">{log.projectTag}</Badge>
                        )}
                        {log.includedInPackage && (
                          <Badge className="bg-emerald-50 text-emerald-700">Inclus în pachet</Badge>
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
              onSaved={() => toast('Ore adăugate')}
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
  onSaved,
}: {
  clientId: string;
  date: string;
  abonamente: Subscription[];
  etichete: string[];
  rateStandard?: number;
  rateOffHours?: number;
  onSaved: () => void;
}) {
  const [hours, setHours] = useState('');
  const [rateType, setRateType] = useState<'STANDARD' | 'OFF_HOURS'>('STANDARD');
  const [description, setDescription] = useState('');
  const [projectTag, setProjectTag] = useState('');
  const [category, setCategory] = useState<WorkCategory>('SUPORT');
  const [error, setError] = useState('');

  const salveaza = useCrudMutation((payload: unknown) => api.post('/worklogs', payload));
  const ore = Number(hours.replace(',', '.'));
  const tarif = rateType === 'STANDARD' ? rateStandard : rateOffHours;

  async function trimite() {
    setError('');
    if (!ore || ore <= 0) return setError('Scrie câte ore ai lucrat');
    try {
      await salveaza.mutateAsync({ clientId, date, hours: ore, rateType, description, projectTag, category });
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

        {ore > 0 && tarif && (
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
