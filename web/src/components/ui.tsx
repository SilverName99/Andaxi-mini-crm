import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { ACCENT, initials } from '../lib/format';
import type { AccentColor } from '../lib/types';

/* ---------------------------------------------------------------- Butoane */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-glow hover:brightness-110 focus-visible:ring-indigo-300',
  secondary:
    'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 focus-visible:ring-slate-200',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-200',
  danger: 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:brightness-110 focus-visible:ring-red-200',
  success: 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:brightness-110 focus-visible:ring-emerald-200',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition',
        'focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm',
        BUTTON_STYLES[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ Card */

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn('card p-5', className)}>
      {children}
    </div>
  );
}

export function CardTitle({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && (
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
            {icon}
          </span>
        )}
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------- Statistici */

type StatTone = 'accent' | 'neutral' | 'success' | 'danger';

const STAT_TONES: Record<StatTone, { value: string; chip: string }> = {
  accent: { value: 'text-indigo-600', chip: 'bg-indigo-100 text-indigo-600' },
  neutral: { value: 'text-slate-900', chip: 'bg-slate-100 text-slate-500' },
  success: { value: 'text-emerald-600', chip: 'bg-emerald-100 text-emerald-600' },
  danger: { value: 'text-red-600', chip: 'bg-red-100 text-red-600' },
};

/**
 * Cifra dintr-un rand de indicatori. Cardul ramane alb; culoarea o poarta doar
 * valoarea si iconita, ca privirea sa mearga la numere, nu la fundal.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  to,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  icon: ReactNode;
  tone?: StatTone;
  to?: string;
}) {
  const content = (
    <div className={cn('card h-full p-5 transition', to && 'hover:-translate-y-0.5 hover:shadow-soft')}>
      {/* eticheta si iconita pe acelasi rand, cifra dedesubt pe toata latimea,
          ca sumele lungi sa nu intre peste iconita */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-2xl', STAT_TONES[tone].chip)}>
          {icon}
        </span>
      </div>
      <p className={cn('mt-3 text-2xl font-extrabold leading-tight', STAT_TONES[tone].value)}>{value}</p>
      {hint && <p className="mt-1.5 text-xs font-medium text-slate-400">{hint}</p>}
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

/* ----------------------------------------------------------------- Badge */

export function Badge({
  children,
  className,
  dot,
}: {
  children: ReactNode;
  className?: string;
  dot?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        className ?? 'bg-slate-100 text-slate-600',
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />}
      {children}
    </span>
  );
}

export function Avatar({
  name,
  color,
  logoUrl,
  size = 'md',
}: {
  name: string;
  color: AccentColor;
  /** Daca clientul are siglă, o aratam in locul initialelor */
  logoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dimensiune = size === 'sm' ? 'h-8 w-8 text-[11px]' : size === 'lg' ? 'h-14 w-14 rounded-3xl text-lg' : 'h-10 w-10 text-sm';

  if (logoUrl) {
    return (
      <span
        className={cn(
          'grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-1',
          size === 'lg' && 'rounded-3xl',
          dimensiune,
        )}
      >
        <img src={logoUrl} alt={name} className="max-h-full max-w-full object-contain" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br font-bold text-white',
        ACCENT[color]?.gradient ?? ACCENT.violet.gradient,
        dimensiune,
      )}
    >
      {initials(name)}
    </span>
  );
}

/* --------------------------------------------------------- Campuri form */

export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      {label && <label className="label-base">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('input-base', props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn('input-base min-h-[90px] resize-y', props.className)} />;
}

export function Select({
  options: opts,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...props} className={cn('input-base appearance-none pr-9', className)}>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300"
    >
      <span>
        <span className="block text-sm font-semibold text-slate-700">{label}</span>
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-gradient-to-r from-indigo-500 to-violet-500' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}

/** Filtre sub forma de pastile colorate */
export function Segmented<T extends string>({
  value,
  onChange,
  options: opts,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
            value === o.value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 text-slate-400">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  size?: 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        className={cn(
          'animate-fade-up w-full rounded-t-4xl bg-white shadow-soft sm:rounded-4xl',
          size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Închide"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Șterge',
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="flex gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-red-100 text-red-600">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <p className="text-sm text-slate-600">{message}</p>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Anulează
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- Stari */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-indigo-500', className)} />;
}

export function LoadingBlock({ label = 'Se încarcă…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white/60 py-16 text-sm text-slate-500">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-600">
        {icon}
      </span>
      <h3 className="text-base font-bold text-slate-800">{title}</h3>
      <p className="max-w-sm text-sm text-slate-500">{message}</p>
      {action}
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
      <AlertTriangle className="h-4 w-4 shrink-0" /> {message}
    </div>
  );
}

/* ---------------------------------------------------------------- Toasts */

interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'error';
}

const ToastContext = createContext<(text: string, tone?: 'success' | 'error') => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const push = (text: string, tone: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3800);
  };

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'animate-fade-up flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-soft',
              toast.tone === 'success'
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                : 'bg-gradient-to-r from-red-500 to-red-600',
            )}
          >
            {toast.tone === 'success' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
