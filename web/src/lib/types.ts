export type ClientStatus = 'ACTIVE' | 'PROSPECT' | 'INACTIVE';
export type SubscriptionKind = 'HOSTING' | 'MENTENANTA' | 'HOSTING_MENTENANTA' | 'PACHET_ORE';
export type Product = 'LANDING_PAGE' | 'PREZENTARE' | 'ECOMMERCE' | 'CRM' | 'ERP' | 'PACHET_ORE' | 'ALTUL';
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
  /** Adresa portalului clienților (ex. https://client.andaxi.ro); gol = același domeniu */
  portalBaseUrl: string;
  /* Trimiterea emailurilor */
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpFrom: string;
  /** Unde ajung anunțurile despre cererile din portal; gol = emailul firmei */
  notifyEmail: string;
  /** Serverul nu trimite niciodată parola înapoi; doar dacă există una salvată */
  smtpHasPassword?: boolean;
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
  erpTier1StorageGb: number;
  erpTier2StorageGb: number;
  erpTier3StorageGb: number;
  crmTier1StorageGb: number;
  crmTier2StorageGb: number;
  crmTier3StorageGb: number;
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

export interface HourPackage {
  id: string;
  name: string;
  hoursPerMonth: number;
  standardRate: number;
  offHoursRate: number;
  active: boolean;
  sortOrder: number;
}

export interface ClientRef {
  id: string;
  name: string;
  company?: string;
  color: AccentColor;
  /** Sigla clientului, daca a fost incarcata */
  logoUrl?: string;
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
  /** Sigla clientului (ex. "/uploads/client-abc-123.png"); gol = fara sigla */
  logoUrl: string;
  notes: string;
  subscriptions?: Subscription[];
  workLogs?: WorkLog[];
  billingItems?: BillingItem[];
  tasks?: Task[];
  _count?: { workLogs: number; subscriptions: number };
  /** Cifrele din capul fișei, calculate pe tot istoricul */
  stats?: {
    workLogCount: number;
    minutes: number;
    unbilledSubscriptionsEur: number;
    unbilledHoursEur: number;
    discountEur: number;
    unbilledEur: number;
  };
}

export interface SubscriptionDocument {
  id: string;
  subscriptionId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
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
  /** Ore de intervenție incluse în fiecare lună */
  includedHoursPerMonth: number;
  /** Ore plătite prin abonament: un rezervor consumat o singură dată */
  paidHours: number;
  /** Cât s-a consumat și cât a mai rămas din rezervor (calculate de server) */
  paidUsedMinutes?: number;
  paidRemainingMinutes?: number;
  /** Câte acte are atașate (contract etc.) */
  _count?: { documents: number };
  /** Pentru abonamentele de tip pachet de ore */
  hourPackageId: string | null;
  hourPackage?: HourPackage | null;
  /** Spațiu ocupat de client (GB), completat manual */
  storageUsedGb: number | null;
  storageUpdatedAt: string | null;
  /** Spațiul inclus la pragul curent de utilizatori (calculat de server) */
  storageIncludedGb?: number | null;
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

/** Reducere aplicată orelor unei luni la un client */
export interface MonthlyDiscount {
  id: string;
  clientId: string;
  month: string;
  type: 'PERCENT' | 'AMOUNT';
  value: number;
  note: string;
}

/** Document atașat unei luni de lucru la un client */
export interface MonthlyDocument {
  id: string;
  clientId: string;
  month: string;
  fileName: string;
  mimeType: string;
  size: number;
  note: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  workLogId: string;
  fileName: string;
  mimeType: string;
  /** Mărimea în bytes */
  size: number;
  createdAt: string;
}

export interface WorkLog {
  id: string;
  clientId: string;
  client?: ClientRef;
  date: string;
  /** INTERVAL = de la ora X la Y · DURATION = doar numărul de ore */
  entryMode: 'INTERVAL' | 'DURATION';
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
  /** Ore acoperite de abonament / pachet: nu se facturează, dar consumă din credit */
  includedInPackage: boolean;
  status: WorkStatus;
  invoiceRef: string;
  attachments?: Attachment[];
  /** Etichetă liberă pentru gruparea orelor pe lucrări */
  projectTag: string;
  /** Cât rămâne de facturat după scăderea orelor incluse (calculat pe lună) */
  billableEur?: number;
  /** Minute acoperite din orele plătite prin abonament */
  paidMinutes?: number;
  /** Minute acoperite din orele incluse în abonament */
  includedMinutes?: number;
  /** Minute acoperite din pachetul preplătit */
  packageMinutes?: number;
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
  /** Cerere venită din portalul clientului */
  fromPortal?: boolean;
  /** Discuție deschisă de tine, dar vizibilă clientului în portal */
  sharedWithClient?: boolean;
  /** NORMAL (24 ore de lucru) · URGENT (12 ore de lucru) */
  requestKind?: string;
  /** Termenul de răspuns (ISO) */
  dueAt?: string | null;
  chatClosed?: boolean;
  /** Mesajele discuției, pentru punctul de „mesaj nou" */
  messages?: { author: string; readByAdmin: boolean }[];
}

export interface RequestMessage {
  id: string;
  author: 'ADMIN' | 'CLIENT';
  authorName: string;
  body: string;
  createdAt: string;
}

export interface RequestThread {
  id: string;
  title: string;
  details: string;
  kind: string;
  dueAt: string | null;
  chatClosed: boolean;
  done: boolean;
  client?: ClientRef | null;
  createdAt: string;
  messages: RequestMessage[];
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

/* ────────────────────────────────────────────────────────── fișa lunară ── */

export interface MonthlySheetRow {
  id: string;
  date: string;
  entryMode: 'INTERVAL' | 'DURATION';
  timeLabel: string;
  startMinutes: number;
  endMinutes: number;
  description: string;
  category: WorkCategory;
  projectTag: string;
  status: WorkStatus;
  billable: boolean;
  includedInPackage: boolean;
  manualAmount: boolean;
  minutes: number;
  standardMinutes: number;
  offHoursMinutes: number;
  standardRate: number;
  offHoursRate: number;
  /** Minute acoperite din orele plătite prin abonamentul lucrării */
  paidMinutes: number;
  includedMinutes: number;
  packageMinutes: number;
  billableMinutes: number;
  grossEur: number;
  billableEur: number;
}

export interface MonthlyApproval {
  confirmedAt: string;
  confirmedBy: string;
  note: string;
  minutes: number;
  billableEur: number;
  /** Luna s-a mai schimbat după ce clientul a confirmat-o */
  changedSince: boolean;
}

export interface MonthlySheet {
  month: string;
  client: ClientRef & { cui: string };
  settings: Settings;
  includedFrom: { id: string; label: string; hours: number }[];
  documents: MonthlyDocument[];
  discount: MonthlyDiscount | null;
  /** Confirmarea clientului din portal */
  approval: MonthlyApproval | null;
  packages: {
    id: string;
    label: string;
    packageName: string;
    hours: number;
    standardRate: number;
    offHoursRate: number;
  }[];
  packageStatement: {
    openingMinutes: number;
    creditedMinutes: number;
    usedMinutes: number;
    closingMinutes: number;
  };
  rows: MonthlySheetRow[];
  totals: {
    minutes: number;
    includedMinutes: number;
    usedIncludedMinutes: number;
    remainingIncludedMinutes: number;
    packageMinutes: number;
    billableMinutes: number;
    grossEur: number;
    coveredEur: number;
    billableEur: number;
    /** Cât s-a scăzut din reducerea lunii */
    discountEur: number;
    /** Ce rămâne după reducere, înainte de TVA */
    netEur: number;
    tva: number;
    totalCuTva: number;
  };
}

/** O modificare a numărului de utilizatori la un abonament ERP/CRM */
export interface SubscriptionUserChange {
  id: string;
  subscriptionId: string;
  effectiveDate: string;
  previousUsers: number;
  newUsers: number;
  previousAmountEur: number;
  newAmountEur: number;
  /** Diferența calculată pentru restul perioadei în curs */
  proratedEur: number;
  billingItemId: string | null;
  applied: boolean;
  note: string;
}

/* ─────────────────────────────────────────── portalul clientului (admin) ── */

export interface ClientPortal {
  /** Partea secreta din link */
  token: string;
  hasPin: boolean;
  enabled: boolean;
  showMoney: boolean;
  showVat: boolean;
  allowRequests: boolean;
  lastSeenAt: string | null;
  updatedAt: string;
  /** PIN-ul în clar, ca să-l poți reciti oricând (doar în interfața ta) */
  pin?: string | null;
}
