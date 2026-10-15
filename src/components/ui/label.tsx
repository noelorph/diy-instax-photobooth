'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label as LabelPrimitive } from 'radix-ui';

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-[1.125rem] font-medium text-ds-text peer-disabled:cursor-not-allowed peer-disabled:text-ds-text-muted',
        className
      )}
      {...props}
    />
  );
}

export { Label };
