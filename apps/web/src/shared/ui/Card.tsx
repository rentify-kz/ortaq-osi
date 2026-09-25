import type { HTMLAttributes, ReactNode } from 'react';

export function Card({
  className = '',
  highlighted,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { highlighted?: boolean }) {
  return (
    <div
      {...rest}
      className={`rounded-lg p-5 ${highlighted ? 'bg-bg-accent-subtle' : 'bg-bg-surface shadow-sm border border-border-subtle'} ${className}`}
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-h1 font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-body text-text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-bg-surface px-6 py-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-accent-50 text-accent-600">
        {icon}
      </div>
      <p className="text-h3 font-semibold">{title}</p>
      {text && <p className="mt-2 max-w-md text-body text-text-secondary">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';
const TONES: Record<Tone, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  neutral: 'bg-bg-subtle text-text-secondary',
  accent: 'bg-accent-50 text-accent-700',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-caption font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Alert({
  tone = 'danger',
  children,
}: {
  tone?: 'danger' | 'success' | 'info' | 'warning';
  children: ReactNode;
}) {
  const cls = {
    danger: 'bg-danger-bg text-danger',
    success: 'bg-success-bg text-success',
    info: 'bg-info-bg text-info',
    warning: 'bg-warning-bg text-warning',
  }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-md px-4 py-3 text-body-sm ${cls}`}>
      {children}
    </div>
  );
}
