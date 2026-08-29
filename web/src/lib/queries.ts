import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from './api';
import type {
  BillingItem, CalendarData, Client, Dashboard, HourPackage, MonthlySheet, ReportData, Settings, Subscription,
  MonthlyDiscount, MonthlyDocument, SubscriptionUserChange, Task, WorkLog, ClientPortal, MonthlyApproval,
  RequestThread,
} from './types';

/* Cheile de cache; invalidam larg dupa mutatii, aplicatia are volum mic de date */
export const keys = {
  dashboard: ['dashboard'] as const,
  clients: (filters?: unknown) => ['clients', filters ?? {}] as const,
  client: (id: string) => ['client', id] as const,
  subscriptions: (filters?: unknown) => ['subscriptions', filters ?? {}] as const,
  billing: (filters?: unknown) => ['billing', filters ?? {}] as const,
  worklogs: (filters?: unknown) => ['worklogs', filters ?? {}] as const,
  tasks: (filters?: unknown) => ['tasks', filters ?? {}] as const,
  settings: ['settings'] as const,
  hourPackages: ['hour-packages'] as const,
  calendar: (filters?: unknown) => ['calendar', filters ?? {}] as const,
  reports: (filters?: unknown) => ['reports', filters ?? {}] as const,
  monthlySheet: (filters?: unknown) => ['monthly-sheet', filters ?? {}] as const,
  clientPortal: (clientId: string) => ['client-portal', clientId] as const,
  monthlyApproval: (clientId: string, month: string) => ['monthly-approval', clientId, month] as const,
  taskThread: (taskId: string) => ['task-thread', taskId] as const,
};

export function useDashboard() {
  return useQuery({ queryKey: keys.dashboard, queryFn: () => api.get<Dashboard>('/dashboard') });
}

export function useClients(filters: { status?: string; q?: string } = {}) {
  return useQuery({
    queryKey: keys.clients(filters),
    queryFn: () => api.get<Client[]>(`/clients${qs(filters)}`),
  });
}

export function useClient(id: string) {
  return useQuery({ queryKey: keys.client(id), queryFn: () => api.get<Client>(`/clients/${id}`) });
}

/** Discutia pe marginea unei cereri venite din portal */
export function useTaskThread(taskId: string | null) {
  return useQuery({
    queryKey: keys.taskThread(taskId ?? ''),
    queryFn: () => api.get<RequestThread>(`/tasks/${taskId}/messages`),
    enabled: Boolean(taskId),
  });
}

/** Confirmarea lunii trimisa de client din portal; null cand nu a confirmat */
export function useMonthlyApproval(clientId: string, month: string) {
  return useQuery({
    queryKey: keys.monthlyApproval(clientId, month),
    queryFn: () =>
      api.get<(MonthlyApproval & { minutes: number; billableEur: number }) | null>(
        `/monthly-approval${qs({ clientId, month })}`,
      ),
    enabled: Boolean(clientId && month),
  });
}

/** Accesul clientului la portalul lui; null cand nu a fost pornit */
export function useClientPortal(clientId: string) {
  return useQuery({
    queryKey: keys.clientPortal(clientId),
    queryFn: () => api.get<ClientPortal | null>(`/clients/${clientId}/portal`),
    enabled: Boolean(clientId),
  });
}

export function useSubscriptions(filters: { clientId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: keys.subscriptions(filters),
    queryFn: () => api.get<Subscription[]>(`/subscriptions${qs(filters)}`),
  });
}

export function useBilling(filters: Record<string, string | undefined> = {}) {
  return useQuery({
    queryKey: keys.billing(filters),
    queryFn: () => api.get<BillingItem[]>(`/billing${qs(filters)}`),
  });
}

export function useWorkLogs(filters: Record<string, string | undefined> = {}) {
  return useQuery({
    queryKey: keys.worklogs(filters),
    queryFn: () => api.get<WorkLog[]>(`/worklogs${qs(filters)}`),
  });
}

export function useWorkLog(id: string) {
  return useQuery({ queryKey: ['worklog', id], queryFn: () => api.get<WorkLog>(`/worklogs/${id}`) });
}

export function useTasks(filters: { done?: string; clientId?: string } = {}) {
  return useQuery({ queryKey: keys.tasks(filters), queryFn: () => api.get<Task[]>(`/tasks${qs(filters)}`) });
}

export function useCalendar(from: string, to: string) {
  return useQuery({
    queryKey: keys.calendar({ from, to }),
    queryFn: () => api.get<CalendarData>(`/calendar${qs({ from, to })}`),
  });
}

export function useMonthlySheet(clientId: string, month: string) {
  return useQuery({
    queryKey: keys.monthlySheet({ clientId, month }),
    queryFn: () => api.get<MonthlySheet>(`/monthly-sheet${qs({ clientId, month })}`),
    enabled: Boolean(clientId && month),
  });
}

export function useHourPackages() {
  return useQuery({ queryKey: keys.hourPackages, queryFn: () => api.get<HourPackage[]>('/hour-packages') });
}

export function useUserChanges(subscriptionId?: string) {
  return useQuery({
    queryKey: ['user-changes', subscriptionId],
    queryFn: () => api.get<SubscriptionUserChange[]>(`/subscriptions/${subscriptionId}/user-changes`),
    enabled: Boolean(subscriptionId),
  });
}

export function useMonthlyDocuments(clientId: string, month: string) {
  return useQuery({
    queryKey: ['monthly-documents', clientId, month],
    queryFn: () => api.get<MonthlyDocument[]>(`/monthly-documents${qs({ clientId, month })}`),
    enabled: Boolean(clientId && month),
  });
}

export function useMonthlyDiscount(clientId: string, month: string) {
  return useQuery({
    queryKey: ['monthly-discount', clientId, month],
    queryFn: () => api.get<MonthlyDiscount | null>(`/monthly-discount${qs({ clientId, month })}`),
    enabled: Boolean(clientId && month),
  });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: () => api.get<Settings>('/settings') });
}

export function useReports(filters: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: keys.reports(filters),
    queryFn: () => api.get<ReportData>(`/dashboard/reports${qs(filters)}`),
  });
}

/**
 * Mutatie generica: dupa succes invalideaza tot cache-ul, pentru ca aproape
 * orice modificare afecteaza si dashboard-ul si rapoartele.
 */
export function useCrudMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
