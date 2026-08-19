export type ClientStatus = 'ACTIVE' | 'PROSPECT' | 'INACTIVE';
export type SubscriptionKind = 'HOSTING' | 'MENTENANTA' | 'HOSTING_MENTENANTA';
export type Product = 'LANDING_PAGE' | 'PREZENTARE' | 'ECOMMERCE' | 'CRM' | 'ERP' | 'ALTUL';
export type Cycle = 'MONTHLY' | 'SEMIANNUAL' | 'ANNUAL';
export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';
export type BillingStatus = 'PENDING' | 'INVOICED' | 'PAID' | 'SKIPPED';
export type WorkCategory = 'SUPORT' | 'INTERVENTIE' | 'DEZVOLTARE' | 'CONSULTANTA' | 'ALTUL';
export type WorkStatus = 'PENDING' | 'INVOICED' | 'PAID' | 'NONBILLABLE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export type AccentColor = 'violet' | 'blue' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'fuchsia' | 'lime';

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Settings {
  id: string;
  companyName: string;
  companyCui: string;
  companyIban: string;
  companyEmail: string;
  /** Calea siglei încărcate, ex. "/uploads/logo-123.png" */
  logoUrl: string;
  standardRate: number;
  offHoursRate: number;
  standardStart: number;
  standardEnd: number;
  weekendOffHours: boolean;
  eurRon: number;
  /** Cota de TVA (%) aplicată peste prețuri; toate sumele din aplicație sunt fără TVA */
  vatRate: number;
  billingLeadDays: number;
  // preturi pe utilizator (ERP / CRM)
  erpTier1Max: number;
  erpTier1Price: number;
  erpTier2Max: number;
  erpTier2Price: number;
  erpTier3Price: number;
  crmTier1Max: number;
  crmTier1Price: number;
  crmTier2Max: number;
  crmTier2Price: number;
  crmTier3Price: number;
  discountSemiannual: number;
  discountAnnual: number;
}

/** Detalierea pretului pentru abonamentele facturate pe utilizator */
export interface PriceBreakdown {
  users: number;
  pricePerUser: number;
  months: number;
  discountPercent: number;
  fullEur: number;
  amountEur: number;
  monthlyEur: number;
}

export interface ClientRef {
  id: string;
  name: string;
  company?: string;
  color: AccentColor;
}

export interface Client {
  id: string;
  name: string;
  company: string;
  cui: string;
  regCom: string;
  email: string;
  phone: string;
  contact: string;
  website: string;
  address: string;
  city: string;
  county: string;
  country: string;
  status: ClientStatus;
  color: AccentColor;
  notes: string;
  subscriptions?: Subscription[];
  workLogs?: WorkLog[];
  billingItems?: BillingItem[];
  tasks?: Task[];
  _count?: { workLogs: number; subscriptions: number };
}

export interface Subscription {
  id: string;
  clientId: string;
  client?: ClientRef;
  label: string;
  kind: SubscriptionKind;
  product: Product;
  amountEur: number;
  /** Numar de utilizatori — doar la ERP/CRM, cand pretul e calculat automat */
  users: number | null;
  cycle: Cycle;
  startDate: string;
  nextDueDate: string;
  endDate: string | null;
  status: SubscriptionStatus;
  notes: string;
}

export interface BillingItem {
  id: string;
  subscriptionId: string;
  clientId: string;
  client?: ClientRef;
  subscription?: Pick<Subscription, 'id' | 'label' | 'kind' | 'product' | 'cycle'>;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountEur: number;
  status: BillingStatus;
  invoiceRef: string;
  invoicedAt: string | null;
  paidAt: string | null;
  notes: string;
}

export interface WorkLog {
  id: string;
  clientId: string;
  client?: ClientRef;
  date: string;
  startMinutes: number;
  endMinutes: number;
  description: string;
  category: WorkCategory;
  standardMinutes: number;
  offHoursMinutes: number;
  standardRate: number;
  offHoursRate: number;
  amountEur: number;
  manualAmount: boolean;
  billable: boolean;
  status: WorkStatus;
  invoiceRef: string;
}

export interface Task {
  id: string;
  clientId: string | null;
  client?: ClientRef | null;
  title: string;
  details: string;
  dueDate: string | null;
  priority: Priority;
  done: boolean;
  doneAt: string | null;
}

export interface RateSplit {
  standardMinutes: number;
  offHoursMinutes: number;
  totalMinutes: number;
  amountEur: number;
}

export interface MonthPoint {
  month: string;
  recurent: number;
  ore: number;
  total: number;
}

export interface Dashboard {
  settings: Settings;
  today: string;
  kpis: {
    mrr: number;
    arr: number;
    clientsActive: number;
    clientsTotal: number;
    subscriptionsActive: number;
    pendingCount: number;
    pendingAmount: number;
    overdueCount: number;
    overdueAmount: number;
    unbilledHoursMinutes: number;
    unbilledHoursAmount: number;
    monthMinutes: number;
    monthHoursAmount: number;
  };
  upcoming: BillingItem[];
  overdue: BillingItem[];
  series: MonthPoint[];
  byProduct: { product: Product; value: number }[];
  topClients: (ClientRef & { recurent: number; ore: number; total: number })[];
  tasks: Task[];
}

export interface ReportRow extends ClientRef {
  recurent: number;
  ore: number;
  minutes: number;
  /** Fără TVA */
  total: number;
  tva: number;
  totalCuTva: number;
  incasat: number;
  deFacturat: number;
}

export interface ReportData {
  from: string;
  to: string;
  settings: Settings;
  rows: ReportRow[];
  months: MonthPoint[];
  totals: {
    recurent: number;
    ore: number;
    /** Fără TVA */
    total: number;
    tva: number;
    totalCuTva: number;
    incasat: number;
    deFacturat: number;
    deFacturatCuTva: number;
    standardMinutes: number;
    offHoursMinutes: number;
  };
}

/* ─────────────────────────────────────────────────────────────── calendar ── */

export type CalendarEventType = 'BILLING' | 'WORK' | 'TASK';

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  date: string;
  title: string;
  subtitle: string;
  amountEur?: number;
  /** Statusul din modulul de origine; pentru task-uri: DONE | OPEN */
  status: string;
  clientId?: string;
  color?: AccentColor;
  /** Doar la intervenții */
  timeLabel?: string;
  minutes?: number;
  category?: WorkCategory;
  /** Doar la task-uri */
  priority?: Priority;
}

export interface CalendarData {
  from: string;
  to: string;
  events: CalendarEvent[];
}
