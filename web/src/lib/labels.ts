import type {
  BillingStatus, ClientStatus, Cycle, Priority, Product, SubscriptionKind,
  SubscriptionStatus, WorkCategory, WorkStatus,
} from './types';

interface Label {
  text: string;
  chip: string;
}

export const CLIENT_STATUS: Record<ClientStatus, Label> = {
  ACTIVE: { text: 'Activ', chip: 'bg-orange-100 text-orange-700' },
  PROSPECT: { text: 'Prospect', chip: 'bg-stone-200 text-stone-700' },
  INACTIVE: { text: 'Inactiv', chip: 'bg-stone-100 text-stone-500' },
};

export const SUBSCRIPTION_KIND: Record<SubscriptionKind, Label> = {
  HOSTING: { text: 'Găzduire', chip: 'bg-stone-100 text-stone-600' },
  MENTENANTA: { text: 'Mentenanță', chip: 'bg-stone-100 text-stone-600' },
  HOSTING_MENTENANTA: { text: 'Găzduire + mentenanță', chip: 'bg-stone-100 text-stone-600' },
};

export const PRODUCT: Record<Product, Label> = {
  LANDING_PAGE: { text: 'Landing page', chip: 'bg-stone-100 text-stone-600' },
  PREZENTARE: { text: 'Site prezentare', chip: 'bg-stone-100 text-stone-600' },
  ECOMMERCE: { text: 'Magazin online', chip: 'bg-stone-100 text-stone-600' },
  CRM: { text: 'CRM', chip: 'bg-stone-100 text-stone-600' },
  ERP: { text: 'ERP', chip: 'bg-stone-100 text-stone-600' },
  ALTUL: { text: 'Altul', chip: 'bg-stone-100 text-stone-500' },
};

export const CYCLE: Record<Cycle, Label & { months: number }> = {
  MONTHLY: { text: 'Lunar', chip: 'bg-amber-50 text-amber-800', months: 1 },
  SEMIANNUAL: { text: 'La 6 luni', chip: 'bg-amber-50 text-amber-800', months: 6 },
  ANNUAL: { text: 'Anual', chip: 'bg-amber-50 text-amber-800', months: 12 },
};

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, Label> = {
  ACTIVE: { text: 'Activ', chip: 'bg-orange-100 text-orange-700' },
  PAUSED: { text: 'Suspendat', chip: 'bg-amber-100 text-amber-800' },
  CANCELLED: { text: 'Anulat', chip: 'bg-stone-100 text-stone-500' },
};

export const BILLING_STATUS: Record<BillingStatus, Label> = {
  PENDING: { text: 'De facturat', chip: 'bg-orange-100 text-orange-700' },
  INVOICED: { text: 'Facturat', chip: 'bg-stone-200 text-stone-700' },
  PAID: { text: 'Încasat', chip: 'bg-emerald-100 text-emerald-700' },
  SKIPPED: { text: 'Ignorat', chip: 'bg-stone-100 text-stone-500' },
};

export const WORK_CATEGORY: Record<WorkCategory, Label> = {
  SUPORT: { text: 'Suport tehnic', chip: 'bg-stone-100 text-stone-600' },
  INTERVENTIE: { text: 'Intervenție', chip: 'bg-stone-100 text-stone-600' },
  DEZVOLTARE: { text: 'Dezvoltare', chip: 'bg-stone-100 text-stone-600' },
  CONSULTANTA: { text: 'Consultanță', chip: 'bg-stone-100 text-stone-600' },
  ALTUL: { text: 'Altul', chip: 'bg-stone-100 text-stone-500' },
};

export const WORK_STATUS: Record<WorkStatus, Label> = {
  PENDING: { text: 'De facturat', chip: 'bg-orange-100 text-orange-700' },
  INVOICED: { text: 'Facturat', chip: 'bg-stone-200 text-stone-700' },
  PAID: { text: 'Încasat', chip: 'bg-emerald-100 text-emerald-700' },
  NONBILLABLE: { text: 'Nefacturabil', chip: 'bg-stone-100 text-stone-500' },
};

export const PRIORITY: Record<Priority, Label> = {
  LOW: { text: 'Scăzută', chip: 'bg-stone-100 text-stone-500' },
  MEDIUM: { text: 'Medie', chip: 'bg-amber-100 text-amber-800' },
  HIGH: { text: 'Ridicată', chip: 'bg-red-100 text-red-700' },
};

/** Transforma o harta de etichete in optiuni pentru <select> */
export function options<T extends string>(map: Record<T, Label>): { value: T; label: string }[] {
  return (Object.keys(map) as T[]).map((value) => ({ value, label: map[value].text }));
}
