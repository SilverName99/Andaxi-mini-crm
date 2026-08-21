import type {
  BillingStatus, ClientStatus, Cycle, Priority, Product, SubscriptionKind,
  SubscriptionStatus, WorkCategory, WorkStatus,
} from './types';

interface Label {
  text: string;
  chip: string;
}

export const CLIENT_STATUS: Record<ClientStatus, Label> = {
  ACTIVE: { text: 'Activ', chip: 'bg-indigo-100 text-indigo-700' },
  PROSPECT: { text: 'Prospect', chip: 'bg-slate-200 text-slate-700' },
  INACTIVE: { text: 'Inactiv', chip: 'bg-slate-100 text-slate-500' },
};

export const SUBSCRIPTION_KIND: Record<SubscriptionKind, Label> = {
  HOSTING: { text: 'Găzduire', chip: 'bg-slate-100 text-slate-600' },
  MENTENANTA: { text: 'Mentenanță', chip: 'bg-slate-100 text-slate-600' },
  HOSTING_MENTENANTA: { text: 'Găzduire + mentenanță', chip: 'bg-slate-100 text-slate-600' },
  PACHET_ORE: { text: 'Pachet de ore', chip: 'bg-indigo-50 text-indigo-700' },
};

export const PRODUCT: Record<Product, Label> = {
  LANDING_PAGE: { text: 'Landing page', chip: 'bg-slate-100 text-slate-600' },
  PREZENTARE: { text: 'Site prezentare', chip: 'bg-slate-100 text-slate-600' },
  ECOMMERCE: { text: 'Magazin online', chip: 'bg-slate-100 text-slate-600' },
  CRM: { text: 'CRM', chip: 'bg-slate-100 text-slate-600' },
  ERP: { text: 'ERP', chip: 'bg-slate-100 text-slate-600' },
  PACHET_ORE: { text: 'Ore preplătite', chip: 'bg-indigo-50 text-indigo-700' },
  ALTUL: { text: 'Altul', chip: 'bg-slate-100 text-slate-500' },
};

export const CYCLE: Record<Cycle, Label & { months: number }> = {
  MONTHLY: { text: 'Lunar', chip: 'bg-violet-50 text-violet-800', months: 1 },
  SEMIANNUAL: { text: 'La 6 luni', chip: 'bg-violet-50 text-violet-800', months: 6 },
  ANNUAL: { text: 'Anual', chip: 'bg-violet-50 text-violet-800', months: 12 },
};

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, Label> = {
  ACTIVE: { text: 'Activ', chip: 'bg-indigo-100 text-indigo-700' },
  PAUSED: { text: 'Suspendat', chip: 'bg-violet-100 text-violet-800' },
  CANCELLED: { text: 'Anulat', chip: 'bg-slate-100 text-slate-500' },
};

export const BILLING_STATUS: Record<BillingStatus, Label> = {
  PENDING: { text: 'De facturat', chip: 'bg-indigo-100 text-indigo-700' },
  INVOICED: { text: 'Facturat', chip: 'bg-slate-200 text-slate-700' },
  PAID: { text: 'Încasat', chip: 'bg-emerald-100 text-emerald-700' },
  SKIPPED: { text: 'Ignorat', chip: 'bg-slate-100 text-slate-500' },
};

export const WORK_CATEGORY: Record<WorkCategory, Label> = {
  SUPORT: { text: 'Suport tehnic', chip: 'bg-slate-100 text-slate-600' },
  INTERVENTIE: { text: 'Intervenție', chip: 'bg-slate-100 text-slate-600' },
  DEZVOLTARE: { text: 'Dezvoltare', chip: 'bg-slate-100 text-slate-600' },
  CONSULTANTA: { text: 'Consultanță', chip: 'bg-slate-100 text-slate-600' },
  ALTUL: { text: 'Altul', chip: 'bg-slate-100 text-slate-500' },
};

export const WORK_STATUS: Record<WorkStatus, Label> = {
  PENDING: { text: 'De facturat', chip: 'bg-indigo-100 text-indigo-700' },
  INVOICED: { text: 'Facturat', chip: 'bg-slate-200 text-slate-700' },
  PAID: { text: 'Încasat', chip: 'bg-emerald-100 text-emerald-700' },
  NONBILLABLE: { text: 'Nefacturabil', chip: 'bg-slate-100 text-slate-500' },
};

export const PRIORITY: Record<Priority, Label> = {
  LOW: { text: 'Scăzută', chip: 'bg-slate-100 text-slate-500' },
  MEDIUM: { text: 'Medie', chip: 'bg-violet-100 text-violet-800' },
  HIGH: { text: 'Ridicată', chip: 'bg-red-100 text-red-700' },
};

/** Transforma o harta de etichete in optiuni pentru <select> */
export function options<T extends string>(map: Record<T, Label>): { value: T; label: string }[] {
  return (Object.keys(map) as T[]).map((value) => ({ value, label: map[value].text }));
}
