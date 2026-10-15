import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'min-h-11 w-full min-w-0 rounded-lg border border-ds-border bg-ds-surface px-3 py-2 text-base leading-[1.375rem] text-ds-text placeholder:text-ds-text-muted transition-colors duration-120 motion-reduce:transition-none file:border-0 file:bg-transparent file:text-ds-text disabled:cursor-not-allowed disabled:bg-ds-surface-muted disabled:text-ds-text-muted',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus aria-invalid:border-ds-danger',
        className
      )}
      {...props}
    />
  );
}

export { Input };
