import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

type FieldAccessibility = {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
};

export function FormField({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  error?: string;
  children: (a11y: FieldAccessibility) => ReactNode;
}) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="grid min-w-0 content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': [helpId, errorId].filter(Boolean).join(' ') || undefined,
      })}
      {help && (
        <p id={helpId} className="m-0 text-sm leading-5 text-ds-text-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="m-0 text-sm leading-5 text-ds-danger">
          {error}
        </p>
      )}
    </div>
  );
}
