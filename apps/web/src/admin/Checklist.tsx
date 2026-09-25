import { CircleCheck, CircleDashed } from 'lucide-react';
import type { ReactNode } from 'react';

export function ChecklistItem({ done, label, value }: { done: boolean; label: string; value?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      {done ? (
        <CircleCheck size={20} className="shrink-0 text-success" aria-label="✓" />
      ) : (
        <CircleDashed size={20} className="shrink-0 text-text-tertiary" aria-label="○" />
      )}
      <span className={`flex-1 text-body ${done ? 'text-text-primary' : 'text-text-secondary'}`}>
        {label}
      </span>
      {value !== undefined && <span className="tabular text-body-sm text-text-secondary">{value}</span>}
    </li>
  );
}
