import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3, CalendarClock, Clock4, LayoutDashboard, ListChecks, LogOut, Menu, Repeat, Settings as SettingsIcon,
  Users, X,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/format';

const NAV = [
  { to: '/', label: 'Panou de control', icon: LayoutDashboard, gradient: 'from-violet-500 to-fuchsia-500', end: true },
  { to: '/clienti', label: 'Clienți', icon: Users, gradient: 'from-blue-500 to-indigo-500' },
  { to: '/abonamente', label: 'Abonamente', icon: Repeat, gradient: 'from-emerald-500 to-teal-500' },
  { to: '/scadentar', label: 'Scadențar', icon: CalendarClock, gradient: 'from-amber-500 to-orange-500' },
  { to: '/interventii', label: 'Ore & intervenții', icon: Clock4, gradient: 'from-rose-500 to-pink-500' },
  { to: '/taskuri', label: 'Task-uri', icon: ListChecks, gradient: 'from-cyan-500 to-sky-500' },
  { to: '/rapoarte', label: 'Rapoarte', icon: BarChart3, gradient: 'from-fuchsia-500 to-purple-500' },
  { to: '/setari', label: 'Setări', icon: SettingsIcon, gradient: 'from-slate-500 to-slate-700' },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition',
              isActive ? 'bg-slate-900 text-white shadow-soft' : 'text-slate-600 hover:bg-white hover:text-slate-900',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br text-white transition',
                  item.gradient,
                  isActive ? 'scale-100' : 'opacity-90 group-hover:scale-105',
                )}
              >
                <item.icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </span>
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const current = NAV.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)));

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* fundal colorat, difuz */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
        <div className="absolute right-0 top-1/4 h-80 w-80 animate-float rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-fuchsia-300/30 blur-3xl" />
      </div>

      <div className="mx-auto flex max-w-[1600px] gap-6 p-4 lg:p-6">
        {/* sidebar desktop */}
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-64 shrink-0 flex-col justify-between rounded-4xl border border-white/60 bg-white/70 p-4 shadow-soft backdrop-blur-xl lg:flex">
          <div>
            <div className="mb-6 flex items-center gap-3 px-2 pt-2">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-lg font-extrabold text-white shadow-glow">
                A
              </span>
              <div>
                <p className="text-base font-extrabold leading-tight text-slate-900">Andaxi</p>
                <p className="text-xs font-medium text-slate-500">mini-CRM</p>
              </div>
            </div>
            <NavItems />
          </div>

          <div className="rounded-3xl bg-slate-900 p-4 text-white">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold">
                {initials(user?.name ?? 'A')}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{user?.name}</p>
                <p className="truncate text-xs text-slate-400">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={() => void logout()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-xs font-semibold transition hover:bg-white/20"
            >
              <LogOut className="h-4 w-4" /> Deconectare
            </button>
          </div>
        </aside>

        {/* continut */}
        <main className="min-w-0 flex-1 pb-10">
          {/* bara mobila */}
          <div className="mb-4 flex items-center justify-between rounded-3xl border border-white/60 bg-white/70 px-4 py-3 shadow-card backdrop-blur-xl lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 font-extrabold text-white">
                A
              </span>
              <span className="text-sm font-bold text-slate-900">{current?.label ?? 'Andaxi CRM'}</span>
            </div>
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100"
              aria-label="Meniu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <Outlet />
        </main>
      </div>

      {/* meniu mobil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="animate-fade-up absolute inset-y-0 left-0 flex w-72 flex-col justify-between bg-white p-4 shadow-soft">
            <div>
              <div className="mb-6 flex items-center justify-between">
                <span className="text-base font-extrabold text-slate-900">Andaxi mini-CRM</span>
                <button onClick={() => setMobileOpen(false)} className="rounded-xl p-2 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <NavItems onNavigate={() => setMobileOpen(false)} />
            </div>
            <button
              onClick={() => void logout()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white"
            >
              <LogOut className="h-4 w-4" /> Deconectare
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Titlul paginii, cu descriere si actiuni in dreapta */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
