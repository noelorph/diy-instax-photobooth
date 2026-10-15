import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

const primary =
  'border-ds-primary bg-ds-primary text-ds-on-primary enabled:hover:border-ds-primary-hover enabled:hover:bg-ds-primary-hover enabled:active:bg-ds-primary-hover [a&]:hover:bg-ds-primary-hover [a&]:active:bg-ds-primary-hover';
const secondary =
  'border-ds-border bg-ds-surface text-ds-text enabled:hover:bg-ds-surface-muted enabled:active:bg-ds-surface-muted [a&]:hover:bg-ds-surface-muted';
const quiet =
  'border-transparent bg-transparent text-ds-text enabled:hover:bg-ds-surface-muted enabled:active:bg-ds-surface-muted [a&]:hover:bg-ds-surface-muted';

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border text-base leading-[1.375rem] font-medium text-center whitespace-normal transition-colors duration-120 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus disabled:cursor-not-allowed disabled:border-ds-border disabled:bg-ds-surface-muted disabled:text-ds-text-muted [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: primary,
        primary,
        secondary,
        outline: secondary,
        quiet,
        ghost: quiet,
        destructive:
          'border-transparent bg-transparent text-ds-danger enabled:hover:bg-ds-danger-soft enabled:active:bg-ds-danger-soft',
        link: 'border-transparent text-ds-primary underline underline-offset-4',
      },
      size: {
        default: 'px-4 py-2',
        sm: 'px-3 py-2 text-sm leading-[1.125rem]',
        lg: 'min-h-12 px-6 py-3',
        icon: 'min-w-11 p-2',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
