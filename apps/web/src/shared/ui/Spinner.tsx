import { LoaderCircle } from 'lucide-react';

export function Spinner({ size = 20 }: { size?: number }) {
  return <LoaderCircle size={size} className="animate-spin" aria-hidden />;
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-text-tertiary">
      <Spinner size={28} />
    </div>
  );
}
