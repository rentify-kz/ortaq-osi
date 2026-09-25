import { Building2 } from 'lucide-react';

export function Logo() {
  return (
    <div className="flex items-center gap-2 text-h3 font-bold text-text-primary">
      <span className="flex size-8 items-center justify-center rounded-md bg-accent-600 text-text-on-accent">
        <Building2 size={18} />
      </span>
      Ortaq
    </div>
  );
}
