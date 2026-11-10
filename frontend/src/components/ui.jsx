import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Loader2, Inbox } from 'lucide-react';

export function Card({ className = '', children, ...props }) {
  return (
    <div className={`card ${className}`} {...props}>
      {children}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-600">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className = '',
  children,
  type = 'button',
  ...props
}) {
  const variantes = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    ghost: 'btn-ghost',
  };
  return (
    <button
      type={type}
      className={`btn ${variantes[variant] || variantes.primary} ${
        size === 'sm' ? 'btn-sm' : ''
      } ${className}`}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2.2} />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, htmlFor, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

const TONS = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15',
  warning: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/15',
  danger: 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/15',
  brand: 'bg-brand-50 text-brand-700 ring-1 ring-brand-600/15',
  info: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/15',
};

export function Badge({ tone = 'neutral', children, className = '' }) {
  return <span className={`badge ${TONS[tone]} ${className}`}>{children}</span>;
}

export function StatCard({ label, value, unite, hint, icon: Icon, tone = 'brand' }) {
  const fonds = {
    brand: 'bg-brand-50 text-brand-700',
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    slate: 'bg-slate-100 text-slate-600',
    violet: 'bg-violet-50 text-violet-700',
  };
  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className={`rounded-xl p-2 ${fonds[tone]}`}>
            <Icon size={18} strokeWidth={2} />
          </span>
        )}
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-1.5">
        <span className="kpi-value">{value}</span>
        {unite && <span className="text-sm font-medium text-slate-500">{unite}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const TAILLES = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}) {
  useEffect(() => {
    if (!open) return undefined;
    const gererTouche = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', gererTouche);
    const overflowInitial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', gererTouche);
      document.body.style.overflow = overflowInitial;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 sm:rounded-2xl ${
          TAILLES[size] || TAILLES.md
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {description && (
              <p className="mt-0.5 text-sm text-slate-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-icon shrink-0"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirmer la suppression',
  message,
  confirmLabel = 'Supprimer',
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Suppression…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span className="mt-0.5 rounded-full bg-rose-50 p-2 text-rose-600">
          <AlertTriangle size={18} />
        </span>
        <p className="text-sm leading-relaxed text-slate-600">{message}</p>
      </div>
    </Modal>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-10 text-center">
      <span className="rounded-full bg-white p-3 text-slate-400 shadow-sm ring-1 ring-slate-200">
        <Icon size={22} />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ label = 'Chargement…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
      <Loader2 size={18} className="animate-spin text-brand-600" />
      {label}
    </div>
  );
}

export function Tabs({ items, value, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
            value === item.value
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {item.icon && <item.icon size={15} />}
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Alert({ tone = 'warning', title, children, icon: Icon = AlertTriangle }) {
  const styles = {
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-rose-200 bg-rose-50 text-rose-900',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 ${styles[tone]}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="text-sm">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
    </div>
  );
}
