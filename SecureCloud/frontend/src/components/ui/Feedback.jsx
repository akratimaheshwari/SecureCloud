import { AlertTriangle, Loader2 } from 'lucide-react';

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={`animate-spin text-slate-400 ${className}`} aria-hidden="true" />;
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

export function LoadingBlock({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500" role="status">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icon && (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <p className="font-medium text-slate-900">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center" role="alert">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="font-medium text-slate-900">Could not load this page</p>
      <p className="mt-1 max-w-md text-sm text-slate-500">{error?.message || 'Something went wrong.'}</p>
      {onRetry && (
        <button type="button" onClick={() => onRetry()} className="mt-4 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Try again
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, tone = 'text-slate-500 bg-slate-100', hint }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      {Icon && (
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${tone}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-slate-900">{value ?? '-'}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}
