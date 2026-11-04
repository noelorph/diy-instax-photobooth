import { Badge } from '@/components/ui/badge';

export function StatusBadge({ status }: { status: 'Draft' | 'Live' }) {
  return (
    <Badge
      className={
        status === 'Live'
          ? 'border-transparent bg-ds-success-soft text-ds-success'
          : 'border-ds-border-subtle bg-ds-surface text-ds-text-muted'
      }
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-current" />
      {status}
    </Badge>
  );
}
