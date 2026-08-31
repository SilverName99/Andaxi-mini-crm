import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, KeyRound, LogOut, ShieldAlert } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Avatar, Badge, Button, Card, ErrorBlock, Input, Segmented, Spinner } from '../components/ui';
import { formatDate, formatEur, formatRon, todayIso } from '../lib/format';
import { numeLuna, schimbaLuna } from '../lib/calendar';
import { CYCLE, PRODUCT, SUBSCRIPTION_KIND, SUBSCRIPTION_STATUS, BILLING_STATUS } from '../lib/labels';
import { cn } from '../lib/cn';
import { portalLogin, usePortalMe, usePortalMonth, type PortalMe } from './api';
import { PortalLuna } from './PortalLuna';
import { CereriPortal } from './CereriPortal';
import { OreAbonament } from '../components/OreAbonament';
import type { AccentColor } from '../lib/types';

type Sectiune = 'luna' | 'abonamente' | 'plati' | 'cereri';

/** Tokenul vine dupa # ca sa nu ajunga in logurile serverului; il stergem din bara de adrese */
function ridicaToken(): string {
  const token = window.location.hash.replace(/^#/, '').trim();
  if (token) window.history.replaceState(null, '', window.location.pathname);
  return token;
}

/** Citit o singura data, la incarcarea paginii — nu la fiecare randare a componentei */
const TOKEN_DIN_LINK = ridicaToken();

export function PortalApp() {
  const [stare, setStare] = useState<'verific' | 'pin' | 'deschis' | 'blocat'>('verific');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [seTrimite, setSeTrimite] = useState(false);

  // la prima incarcare incercam fie tokenul din link, fie sesiunea ramasa in cookie
  useEffect(() => {
    const dinLink = TOKEN_DIN_LINK;

    async function intra() {
      if (dinLink) {
        try {
          const raspuns = await portalLogin(dinLink);
          setStare(raspuns.needsPin ? 'pin' : 'deschis');
          return;
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Link invalid');
          setStare('blocat');
          return;
        }
      }
      // fara token in adresa: poate mai are sesiunea deschisa de data trecuta
      try {
        await api.get('/portal/me');
        setStare('deschis');
      } catch {
        setError('Deschide linkul primit de la noi ca să intri în portal.');
        setStare('blocat');
      }
    }

    intra();
  }, []);

  async function trimitePin() {
    setError('');
    setSeTrimite(true);
    try {
      await portalLogin(TOKEN_DIN_LINK, pin);
      setStare('deschis');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'PIN greșit');
      setPin('');
    } finally {
      setSeTrimite(false);
    }
  }

  if (stare === 'verific') {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (stare !== 'deschis') {
    return (
      <PoartaIntrare
        cerePin={stare === 'pin'}
        pin={pin}
        setPin={setPin}
        error={error}
        seTrimite={seTrimite}
        onTrimite={trimitePin}
      />
    );
  }

  return <PortalContinut />;
}

/** Ecranul de dinainte de intrare: PIN sau mesajul de link invalid */
function PoartaIntrare({
  cerePin,
  pin,
  setPin,
  error,
  seTrimite,
  onTrimite,
}: {
  cerePin: boolean;
  pin: string;
  setPin: (value: string) => void;
  error: string;
  seTrimite: boolean;
  onTrimite: () => void;
}) {
  // sigla firmei e publica: clientul trebuie sa vada de la cine e portalul
  const [brand, setBrand] = useState<{ companyName: string; logoUrl: string } | null>(null);
  useEffect(() => {
    api
      .get<{ companyName: string; logoUrl: string }>('/branding')
      .then(setBrand)
      .catch(() => setBrand(null));
  }, []);

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-indigo-50 via-slate-50 to-violet-50 p-4">
      <Card className="w-full max-w-md">
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          {brand?.logoUrl ? (
            <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-3xl border border-slate-200 bg-white p-1.5">
              <img src={brand.logoUrl} alt={brand.companyName} className="max-h-full max-w-full object-contain" />
            </span>
          ) : (
            <span className="grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
              {cerePin ? <KeyRound className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
            </span>
          )}
          {brand?.companyName && (
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Portal client · {brand.companyName}
            </p>
          )}
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">
              {cerePin ? 'Introdu PIN-ul' : 'Link indisponibil'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {cerePin
                ? 'Codul din 6 cifre pe care l-ai primit separat de link.'
                : error || 'Linkul nu mai este valid.'}
            </p>
          </div>
        </div>

        {cerePin && (
          <div className="flex flex-col gap-3">
            <Input
              autoFocus
              inputMode="numeric"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && pin.length >= 4 && onTrimite()}
              placeholder="••••••"
              className="text-center text-2xl font-extrabold tracking-[0.4em]"
            />
            {error && <ErrorBlock message={error} />}
            <Button onClick={onTrimite} loading={seTrimite} disabled={pin.length < 4} className="w-full">
              Intră în portal
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function PortalContinut() {
  const [sectiune, setSectiune] = useState<Sectiune>('luna');
  const [luna, setLuna] = useState(todayIso().slice(0, 7));
  const { data: me, isLoading, error } = usePortalMe(true);
  const { data: date, isLoading: seIncarcaLuna } = usePortalMonth(luna, Boolean(me));

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (error || !me) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-4">
        <ErrorBlock message={error instanceof Error ? error.message : 'Nu am putut încărca portalul'} />
      </div>
    );
  }

  // cate mesaje de la noi n-a citit inca, ca sa vada pastila pe fila de discutii
  const necitite = me.requests.reduce((total, cerere) => total + cerere.unread, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Avatar
              name={me.client.company || me.client.name}
              color={(me.client.color ?? 'violet') as AccentColor}
              logoUrl={me.client.logoUrl || undefined}
              size="lg"
            />
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Portal client
                <span
                  className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-white shadow-sm"
                  title="Portalul e încă în dezvoltare — pot apărea mici erori"
                >
                  BETA
                </span>
              </p>
              <h1 className="text-lg font-extrabold text-slate-900">{me.client.company || me.client.name}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs text-slate-400">Portal oferit de</p>
              <p className="text-sm font-bold text-slate-700">{me.brand.companyName}</p>
            </div>
            {me.brand.logoUrl && (
              <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-1">
                <img src={me.brand.logoUrl} alt={me.brand.companyName} className="max-h-full max-w-full object-contain" />
              </span>
            )}
            <button
              onClick={async () => {
                await api.post('/portal/logout');
                window.location.reload();
              }}
              className="grid h-10 w-10 place-items-center rounded-2xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Ieși din portal"
              title="Ieși"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            value={sectiune}
            onChange={setSectiune}
            options={[
              { value: 'luna', label: 'Luna' },
              { value: 'abonamente', label: 'Abonamente' },
              { value: 'plati', label: 'Plăți' },
              { value: 'cereri', label: 'Discuții', count: necitite || undefined },
            ]}
          />

          {sectiune === 'luna' && (
            <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1">
              <button
                onClick={() => setLuna(schimbaLuna(luna, -1))}
                aria-label="Luna anterioară"
                disabled={luna <= me.firstMonth}
                className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[9rem] text-center text-sm font-bold capitalize text-slate-800">
                {numeLuna(luna)}
              </span>
              <button
                onClick={() => setLuna(schimbaLuna(luna, 1))}
                aria-label="Luna următoare"
                disabled={luna >= todayIso().slice(0, 7)}
                className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {sectiune === 'luna' && <PortalLuna luna={luna} date={date} me={me} seIncarca={seIncarcaLuna} />}
        {sectiune === 'abonamente' && <Abonamente me={me} />}
        {sectiune === 'plati' && <Plati me={me} />}
        {sectiune === 'cereri' && <CereriPortal me={me} />}

        <p className="py-6 text-center text-xs text-slate-400">
          Datele se actualizează în timp real. Pentru orice nelămurire, scrie-ne.
          <br />
          <span className="font-semibold text-amber-600">Portalul e în versiune beta</span> — încă îl
          dezvoltăm, așa că pot apărea mici erori. Dacă vezi ceva ciudat, spune-ne.
        </p>
      </main>
    </div>
  );
}

function Abonamente({ me }: { me: PortalMe }) {
  if (me.subscriptions.length === 0) {
    return <Card><p className="text-sm text-slate-500">Nu ai abonamente active.</p></Card>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {me.subscriptions.map((sub) => (
        <Card key={sub.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-bold text-slate-900">{sub.label}</p>
              <p className="text-xs text-slate-500">
                {SUBSCRIPTION_KIND[sub.kind].text} · {PRODUCT[sub.product].text}
              </p>
            </div>
            <Badge className={SUBSCRIPTION_STATUS[sub.status].chip}>{SUBSCRIPTION_STATUS[sub.status].text}</Badge>
          </div>

          {me.flags.showMoney && sub.amountEur !== null && (
            <div>
              <p className="text-2xl font-extrabold text-indigo-600">
                {formatRon(sub.amountEur, me.currency.eurRon)}
              </p>
              <p className="text-xs text-slate-400">
                {formatEur(sub.amountEur)} · {CYCLE[sub.cycle].text.toLowerCase()}
                {CYCLE[sub.cycle].months > 1 &&
                  ` · ≈ ${formatRon(sub.amountEur / CYCLE[sub.cycle].months, me.currency.eurRon)} / lună`}
              </p>
            </div>
          )}

          <OreAbonament paidHours={sub.paidHours} remainingMinutes={sub.paidRemainingMinutes} />

          <dl className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Următoarea reînnoire</dt>
              <dd className="font-semibold text-slate-800">{formatDate(sub.nextDueDate)}</dd>
            </div>
            {sub.includedHoursPerMonth > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Ore incluse</dt>
                <dd className="font-semibold text-emerald-600">{sub.includedHoursPerMonth} h / lună</dd>
              </div>
            )}
            {sub.packageHours !== null && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Ore în pachet</dt>
                <dd className="font-semibold text-indigo-600">{sub.packageHours} h / lună</dd>
              </div>
            )}
            {sub.users !== null && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Utilizatori</dt>
                <dd className="font-semibold text-slate-800">{sub.users}</dd>
              </div>
            )}
          </dl>
        </Card>
      ))}
    </div>
  );
}

function Plati({ me }: { me: PortalMe }) {
  if (me.billing.length === 0) {
    return <Card><p className="text-sm text-slate-500">Nu există plăți înregistrate.</p></Card>;
  }

  const neachitate = me.billing.filter((item) => item.status === 'INVOICED');
  const totalNeachitat = neachitate.reduce((sum, item) => sum + (item.amountEur ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
    {me.flags.showMoney && neachitate.length > 0 && (
      <Card className="flex flex-wrap items-center justify-between gap-3 border-indigo-200 bg-indigo-50/60">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">De achitat</p>
          <p className="text-sm text-slate-600">
            {neachitate.length} {neachitate.length === 1 ? 'factură emisă' : 'facturi emise'} și neîncasate
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold text-indigo-700">
            {formatRon(totalNeachitat, me.currency.eurRon)}
          </p>
          <p className="text-xs text-slate-400">{formatEur(totalNeachitat)}</p>
        </div>
      </Card>
    )}
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-3 font-semibold">Serviciu</th>
            <th className="py-2 pr-3 font-semibold">Perioada</th>
            <th className="py-2 pr-3 font-semibold">Scadență</th>
            <th className="py-2 pr-3 font-semibold">Stare</th>
            {me.flags.showMoney && <th className="py-2 text-right font-semibold">Sumă</th>}
          </tr>
        </thead>
        <tbody>
          {me.billing.map((item) => (
            <tr key={item.id} className="border-b border-slate-100 last:border-0">
              <td className="py-2.5 pr-3 font-semibold text-slate-800">{item.label || '—'}</td>
              <td className="py-2.5 pr-3 text-slate-500">
                {formatDate(item.periodStart)} – {formatDate(item.periodEnd)}
              </td>
              <td className="py-2.5 pr-3 text-slate-600">{formatDate(item.dueDate)}</td>
              <td className="py-2.5 pr-3">
                <Badge
                  className={
                    item.estimat ? 'bg-slate-100 text-slate-500' : BILLING_STATUS[item.status].chip
                  }
                >
                  {item.estimat
                    ? 'Estimat'
                    : item.status === 'PENDING'
                      ? 'Urmează factura'
                      : item.status === 'PAID'
                        ? 'Achitat'
                        : BILLING_STATUS[item.status].text}
                </Badge>
                {item.invoiceRef && <span className="ml-2 text-xs text-slate-400">{item.invoiceRef}</span>}
              </td>
              {me.flags.showMoney && (
                <td className={cn('py-2.5 text-right', item.estimat ? 'text-slate-500' : 'text-slate-900')}>
                  <span className="block font-bold">
                    {formatRon(item.amountEur ?? 0, me.currency.eurRon)}
                  </span>
                  <span className="block text-[11px] text-slate-400">{formatEur(item.amountEur ?? 0)}</span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-400">
        Pozițiile marcate „Estimat" nu sunt facturi emise, ci sume care urmează la reînnoire.
      </p>
    </Card>
    </div>
  );
}
