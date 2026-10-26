import { Badge } from '@/components/ui/badge';

export function StatusBadge({ status }: { status: 'Draft' | 'Live' }) {
  return (
    <Badge
      className={
        status === 'Live'
          ? 'border-transparent bg-ds-success-soft text-ds-success'
          : 'border-transparent bg-ds-surface-muted text-ds-text'
      }
    >
      {status}
    </Badge>
  );
}
