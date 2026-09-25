import type { ReactNode } from 'react';
import { Logo } from '../../app/Logo';
import { LocaleSwitch } from '../../app/LocaleSwitch';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-subtle px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <LocaleSwitch />
        </div>
        <div className="rounded-xl bg-bg-surface p-8 shadow-md">
          <h1 className="text-h1 font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-body text-text-secondary">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
