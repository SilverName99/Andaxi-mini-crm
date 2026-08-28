import { useQuery } from '@tanstack/react-query';
import { api, qs } from '../lib/api';
import type { Cycle, Product, SubscriptionKind, SubscriptionStatus, WorkCategory } from '../lib/types';

/* Datele care ajung la client. Sumele lipsesc (null) cand ai stins "Arată sumele". */

export interface PortalMe {
  client: { name: string; company: string; cui: string; logoUrl: string; color: string };
  brand: { companyName: string; logoUrl: string };
  flags: { showMoney: boolean; showVat: boolean; allowRequests: boolean };
  currency: { eurRon: number; vatRate: number | null };
  program: { standardStart: number; standardEnd: number; weekendOffHours: boolean };
  firstMonth: string;
  subscriptions: {
    id: string;
    label: string;
    kind: SubscriptionKind;
    product: Product;
    cycle: Cycle;
    status: SubscriptionStatus;
    users: number | null;
    includedHoursPerMonth: number;
    packageHours: number | null;
    paidHours: number;
    paidRemainingMinutes: number;
    nextDueDate: string;
    storageUsedGb: number | null;
    storageIncludedGb: number | null;
    amountEur: number | null;
  }[];
  requests: {
    id: string;
    title: string;
    details: string;
    done: boolean;
    doneAt: string | null;
    createdAt: string;
  }[];
  billing: {
    id: string;
    label: string;
    periodStart: string;
    periodEnd: string;
    dueDate: string;
    status: 'PENDING' | 'INVOICED' | 'PAID' | 'SKIPPED';
    invoiceRef: string;
    paidAt: string | null;
    estimat: boolean;
    amountEur: number | null;
  }[];
}

export interface PortalRow {
  id: string;
  date: string;
  entryMode: 'INTERVAL' | 'DURATION';
  timeLabel: string;
  startMinutes: number;
  endMinutes: number;
  description: string;
  category: WorkCategory;
  projectTag: string;
  includedInPackage: boolean;
  billable: boolean;
  minutes: number;
  paidMinutes: number;
  includedMinutes: number;
  packageMinutes: number;
  billableMinutes: number;
  billableEur: number | null;
  grossEur: number | null;
}

export interface PortalApproval {
  confirmedAt: string;
  confirmedBy: string;
  note: string;
  minutes: number;
  billableEur: number;
  /** Luna s-a mai schimbat dupa confirmare */
  changedSince: boolean;
}

export interface PortalMonth {
  month: string;
  /** Luna nu s-a incheiat: cifrele sunt estimari, nu factura finala */
  inCurs: boolean;
  includedFrom: { id: string; label: string; hours: number }[];
  packages: { id: string; label: string; packageName: string; hours: number }[];
  packageStatement: {
    openingMinutes: number;
    creditedMinutes: number;
    usedMinutes: number;
    closingMinutes: number;
  };
  documents: { id: string; fileName: string; mimeType: string; size: number; createdAt: string }[];
  discount: { type: 'AMOUNT' | 'PERCENT'; value: number } | null;
  approval: PortalApproval | null;
  rows: PortalRow[];
  totals: {
    minutes: number;
    includedMinutes: number;
    usedIncludedMinutes: number;
    remainingIncludedMinutes: number;
    packageMinutes: number;
    billableMinutes: number;
    coveredEur: number | null;
    billableEur: number | null;
    discountEur: number | null;
    netEur: number | null;
    tva: number | null;
    totalCuTva: number | null;
  };
}

export function usePortalMe(activ: boolean) {
  return useQuery({
    queryKey: ['portal', 'me'],
    queryFn: () => api.get<PortalMe>('/portal/me'),
    enabled: activ,
  });
}

export function usePortalMonth(month: string, activ: boolean) {
  return useQuery({
    queryKey: ['portal', 'month', month],
    queryFn: () => api.get<PortalMonth>(`/portal/month${qs({ month })}`),
    enabled: activ && Boolean(month),
  });
}

export function confirmaLuna(month: string, body: { confirmedBy: string; note: string }) {
  return api.post<PortalApproval>(`/portal/month/${month}/confirm`, body);
}

export function retrageConfirmarea(month: string) {
  return api.del(`/portal/month/${month}/confirm`);
}

export function trimiteCerere(body: { title: string; details: string }) {
  return api.post<PortalMe['requests'][number]>('/portal/requests', body);
}

/** Deschide sesiunea din linkul primit; raspunde daca mai e nevoie de PIN */
export function portalLogin(token: string, pin?: string) {
  return api.post<{ ok?: boolean; needsPin?: boolean }>('/portal/session', { token, pin });
}
