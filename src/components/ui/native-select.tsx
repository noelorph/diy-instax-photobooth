import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDownIcon } from 'lucide-react';

function NativeSelect({
  className,
  size = 'default',
  ...props
}: Omit<React.ComponentProps<'select'>, 'size'> & { size?: 'sm' | 'default' }) {
  return (
    <div className="group/native-select relative w-full" data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          'min-h-11 w-full min-w-0 appearance-none rounded-xl border border-ds-border bg-ds-surface px-3 py-2 pr-10 text-base leading-6 text-ds-text transition-colors duration-180 enabled:hover:border-ds-text motion-reduce:transition-none disabled:cursor-not-allowed disabled:bg-ds-surface-muted disabled:text-ds-text-muted data-[size=sm]:text-sm',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus aria-invalid:border-ds-danger',
          className
        )}
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-ds-text-muted select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<'option'>) {
  return (
    <option
      data-slot="native-select-option"
      className={cn('bg-[Canvas] text-[CanvasText]', className)}
      {...props}
    />
  );
}

function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<'optgroup'>) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn('bg-[Canvas] text-[CanvasText]', className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
