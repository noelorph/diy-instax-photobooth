import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export function FormFeedback({
  kind,
  children,
  feedbackRef,
  tabIndex,
}: {
  kind: 'error' | 'success' | 'status';
  children: ReactNode;
  feedbackRef?: Ref<HTMLDivElement>;
  tabIndex?: number;
}) {
  const Icon = kind === 'error' ? CircleAlert : kind === 'success' ? CircleCheck : Info;
  return (
    <Alert
      ref={feedbackRef}
      tabIndex={tabIndex}
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn(
        kind === 'error' && 'border-ds-danger bg-ds-danger-soft text-ds-danger',
        kind === 'success' && 'border-ds-success bg-ds-success-soft text-ds-success',
        kind === 'status' && 'border-ds-info bg-ds-info-soft text-ds-info'
      )}
    >
      <Icon aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
