import { useEffect, useState, type FormEvent } from 'react';
import { Clock4, Lock, Mail, Repeat, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Button, ErrorBlock, Field, Input } from '../components/ui';

const HIGHLIGHTS = [
  { icon: Users, text: 'Toți clienții într-un singur loc' },
  { icon: Repeat, text: 'Abonamente lunare, la 6 sau 12 luni' },
  { icon: Clock4, text: 'Ore de intervenție cu tarif automat' },
];

export function Login() {
  const { login } = useAuth();
  // datele de identitate sunt publice, ca sigla sa apara si inainte de autentificare
  const [branding, setBranding] = useState<{ companyName: string; logoUrl: string } | null>(null);

  useEffect(() => {
    api
      .get<{ companyName: string; logoUrl: string }>('/branding')
      .then(setBranding)
      .catch(() => setBranding(null));
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Autentificare eșuată');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-50 p-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-indigo-400/30 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-[26rem] w-[26rem] animate-float rounded-full bg-violet-400/30 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-72 w-72 rounded-full bg-violet-200/40 blur-3xl" />
      </div>

      <div className="animate-fade-up relative grid w-full max-w-4xl overflow-hidden rounded-4xl border border-white/60 bg-white/80 shadow-soft backdrop-blur-xl md:grid-cols-2">
        {/* prezentare */}
        <div className="hidden flex-col justify-between bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 p-8 text-white md:flex">
          <div>
            {branding?.logoUrl ? (
              <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-white p-2">
                <img src={branding.logoUrl} alt={branding.companyName} className="max-h-full max-w-full object-contain" />
              </span>
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20 text-xl font-extrabold backdrop-blur">
                {(branding?.companyName ?? 'A').slice(0, 1).toUpperCase()}
              </span>
            )}
            <h1 className="mt-6 text-3xl font-extrabold leading-tight">
              Ordine în firmă,
              <br />
              într-un singur loc.
            </h1>
            <p className="mt-3 text-sm text-white/80">
              Clienți, abonamente de găzduire și mentenanță, ore de suport tehnic și scadențar — fără foi de calcul.
            </p>
          </div>
          <ul className="mt-8 flex flex-col gap-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item.text} className="flex items-center gap-3 text-sm font-medium">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/20 backdrop-blur">
                  <item.icon className="h-4 w-4" />
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        {/* formular */}
        <div className="p-8 sm:p-10">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            {branding?.logoUrl ? (
              <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-white p-1 ring-1 ring-slate-200">
                <img src={branding.logoUrl} alt={branding.companyName} className="max-h-full max-w-full object-contain" />
              </span>
            ) : (
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-lg font-extrabold text-white">
                {(branding?.companyName ?? 'A').slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <p className="font-extrabold text-slate-900">{branding?.companyName || 'Andaxi'}</p>
              <p className="text-xs text-slate-500">mini-CRM</p>
            </div>
          </div>

          <h2 className="text-2xl font-extrabold text-slate-900">Bine ai revenit 👋</h2>
          <p className="mt-1 text-sm text-slate-500">Intră în cont ca să continui.</p>

          <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
            <Field label="Email">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nume@andaxi.ro"
                  className="pl-10"
                />
              </div>
            </Field>

            <Field label="Parolă">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                />
              </div>
            </Field>

            {error && <ErrorBlock message={error} />}

            <Button type="submit" loading={loading} className="mt-1 w-full py-3">
              Intră în cont
            </Button>
          </form>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Sesiune securizată, cookie httpOnly
          </p>
        </div>
      </div>
    </div>
  );
}
