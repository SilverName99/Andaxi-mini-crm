import type {
  BillingStatus, ClientStatus, Cycle, Priority, Product, SubscriptionKind,
  SubscriptionStatus, WorkCategory, WorkStatus,
} from './types';

interface Label {
  text: string;
  chip: string;
}

export const CLIENT_STATUS: Record<ClientStatus, Label> = {
  ACTIVE: { text: 'Activ', chip: 'bg-emerald-100 text-emerald-700' },
  PROSPECT: { text: 'Prospect', chip: 'bg-amber-100 text-amber-700' },
  INACTIVE: { text: 'Inactiv', chip: 'bg-slate-200 text-slate-600' },
};

export const SUBSCRIPTION_KIND: Record<SubscriptionKind, Label> = {
  HOSTING: { text: 'Găzduire', chip: 'bg-cyan-100 text-cyan-700' },
  MENTENANTA: { text: 'Mentenanță', chip: 'bg-violet-100 text-violet-700' },
  HOSTING_MENTENANTA: { text: 'Găzduire + mentenanță', chip: 'bg-indigo-100 text-indigo-700' },
};

export const PRODUCT: Record<Product, Label> = {
  LANDING_PAGE: { text: 'Landing page', chip: 'bg-rose-100 text-rose-700' },
  PREZENTARE: { text: 'Site prezentare', chip: 'bg-blue-100 text-blue-700' },
  ECOMMERCE: { text: 'Magazin online', chip: 'bg-emerald-100 text-emerald-700' },
  CRM: { text: 'CRM', chip: 'bg-fuchsia-100 text-fuchsia-700' },
  ERP: { text: 'ERP', chip: 'bg-amber-100 text-amber-700' },
  ALTUL: { text: 'Altul', chip: 'bg-slate-200 text-slate-600' },
};

export const CYCLE: Record<Cycle, Label & { months: number }> = {
  MONTHLY: { text: 'Lunar', chip: 'bg-violet-100 text-violet-700', months: 1 },
  SEMIANNUAL: { text: 'La 6 luni', chip: 'bg-cyan-100 text-cyan-700', months: 6 },
  ANNUAL: { text: 'Anual', chip: 'bg-amber-100 text-amber-700', months: 12 },
};

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, Label> = {
  ACTIVE: { text: 'Activ', chip: 'bg-emerald-100 text-emerald-700' },
  PAUSED: { text: 'Suspendat', chip: 'bg-amber-100 text-amber-700' },
  CANCELLED: { text: 'Anulat', chip: 'bg-slate-200 text-slate-600' },
};

export const BILLING_STATUS: Record<BillingStatus, Label> = {
  PENDING: { text: 'De facturat', chip: 'bg-amber-100 text-amber-700' },
  INVOICED: { text: 'Facturat', chip: 'bg-blue-100 text-blue-700' },
  PAID: { text: 'Încasat', chip: 'bg-emerald-100 text-emerald-700' },
  SKIPPED: { text: 'Ignorat', chip: 'bg-slate-200 text-slate-600' },
};

export const WORK_CATEGORY: Record<WorkCategory, Label> = {
  SUPORT: { text: 'Suport tehnic', chip: 'bg-blue-100 text-blue-700' },
  INTERVENTIE: { text: 'Intervenție', chip: 'bg-rose-100 text-rose-700' },
  DEZVOLTARE: { text: 'Dezvoltare', chip: 'bg-violet-100 text-violet-700' },
  CONSULTANTA: { text: 'Consultanță', chip: 'bg-emerald-100 text-emerald-700' },
  ALTUL: { text: 'Altul', chip: 'bg-slate-200 text-slate-600' },
};

export const WORK_STATUS: Record<WorkStatus, Label> = {
  PENDING: { text: 'De facturat', chip: 'bg-amber-100 text-amber-700' },
  INVOICED: { text: 'Facturat', chip: 'bg-blue-100 text-blue-700' },
  PAID: { text: 'Încasat', chip: 'bg-emerald-100 text-emerald-700' },
  NONBILLABLE: { text: 'Nefacturabil', chip: 'bg-slate-200 text-slate-600' },
};

export const PRIORITY: Record<Priority, Label> = {
  LOW: { text: 'Scăzută', chip: 'bg-slate-200 text-slate-600' },
  MEDIUM: { text: 'Medie', chip: 'bg-blue-100 text-blue-700' },
  HIGH: { text: 'Ridicată', chip: 'bg-rose-100 text-rose-700' },
};

/** Transforma o harta de etichete in optiuni pentru <select> */
export function options<T extends string>(map: Record<T, Label>): { value: T; label: string }[] {
  return (Object.keys(map) as T[]).map((value) => ({ value, label: map[value].text }));
}
