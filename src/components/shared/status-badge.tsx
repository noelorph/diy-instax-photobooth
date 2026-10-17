import { Badge } from '@/components/ui/badge';

export function StatusBadge({ status }: { status: 'Draft' }) {
  return <Badge className="border-transparent bg-ds-info-soft text-ds-info">{status}</Badge>;
}
