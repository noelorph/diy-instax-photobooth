import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

const badgeVariants = cva(
  'inline-flex w-fit max-w-full items-center justify-center gap-1.5 rounded-full border border-transparent px-2.5 py-0.5 text-sm leading-5 font-medium whitespace-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus [&>svg]:pointer-events-none [&>svg]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-ds-primary-soft text-ds-primary-hover',
        secondary: 'bg-ds-surface-muted text-ds-text',
        destructive: 'bg-ds-danger-soft text-ds-danger',
        outline: 'border-ds-border text-ds-text',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
