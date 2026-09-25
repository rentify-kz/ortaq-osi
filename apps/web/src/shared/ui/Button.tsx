import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'text' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent-600 text-text-on-accent hover:bg-accent-700 active:bg-accent-800',
  secondary: 'bg-bg-surface text-text-primary border border-border-default hover:bg-bg-subtle',
  text: 'text-accent-600 hover:bg-accent-50',
  danger: 'bg-bg-surface text-danger border border-danger hover:bg-danger-bg',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  loading,
  icon,
  block,
  className = '',
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-label font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${block ? 'w-full' : ''} ${className}`}
    >
      {loading ? <Spinner size={16} /> : icon}
      {children}
    </button>
  );
}
