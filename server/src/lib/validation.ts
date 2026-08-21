import { z } from 'zod';
import { isIsoDate } from './dates.js';

export const isoDate = z.string().refine(isIsoDate, { message: 'Data trebuie sa fie in formatul YYYY-MM-DD' });

export const CLIENT_STATUSES = ['ACTIVE', 'PROSPECT', 'INACTIVE'] as const;
export const SUBSCRIPTION_KINDS = ['HOSTING', 'MENTENANTA', 'HOSTING_MENTENANTA', 'PACHET_ORE'] as const;
export const PRODUCTS = ['LANDING_PAGE', 'PREZENTARE', 'ECOMMERCE', 'CRM', 'ERP', 'PACHET_ORE', 'ALTUL'] as const;
export const CYCLES = ['MONTHLY', 'SEMIANNUAL', 'ANNUAL'] as const;
export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'PAUSED', 'CANCELLED'] as const;
export const BILLING_STATUSES = ['PENDING', 'INVOICED', 'PAID', 'SKIPPED'] as const;
export const WORK_CATEGORIES = ['SUPORT', 'INTERVENTIE', 'DEZVOLTARE', 'CONSULTANTA', 'ALTUL'] as const;
export const WORK_STATUSES = ['PENDING', 'INVOICED', 'PAID', 'NONBILLABLE'] as const;
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const COLORS = ['violet', 'blue', 'emerald', 'amber', 'rose', 'cyan', 'fuchsia', 'lime'] as const;
