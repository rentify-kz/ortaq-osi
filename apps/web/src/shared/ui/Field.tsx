import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useId,
} from 'react';

interface FieldProps {
  label: string;
  error?: string | null;
  hint?: ReactNode;
}

const control =
  'h-11 w-full rounded-md border bg-bg-surface px-3 text-body text-text-primary placeholder:text-text-tertiary outline-none transition-colors focus:border-border-focus';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(
  function Input({ label, error, hint, className = '', ...rest }, ref) {
    const id = useId();
    return (
      <div className={className}>
        <label htmlFor={id} className="mb-1.5 block text-label font-medium text-text-primary">
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? `${id}-desc` : undefined}
          className={`${control} ${error ? 'border-danger' : 'border-border-default'}`}
          {...rest}
        />
        <FieldNote id={`${id}-desc`} error={error} hint={hint} />
      </div>
    );
  },
);

export function Select({
  label,
  error,
  hint,
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-label font-medium text-text-primary">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        className={`${control} ${error ? 'border-danger' : 'border-border-default'}`}
        {...rest}
      >
        {children}
      </select>
      <FieldNote id={`${id}-desc`} error={error} hint={hint} />
    </div>
  );
}

function FieldNote({ id, error, hint }: { id: string; error?: string | null; hint?: ReactNode }) {
  if (error) {
    return (
      <p id={id} role="alert" className="mt-1.5 text-body-sm text-danger">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="mt-1.5 text-body-sm text-text-secondary">
        {hint}
      </p>
    );
  }
  return null;
}
