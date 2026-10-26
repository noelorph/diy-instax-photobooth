'use client';

import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function PasswordInput({
  label,
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type'> & { label: string }) {
  const [visible, setVisible] = useState(false);
  const action = `${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`;
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-12', className)} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-0 right-0 text-ds-text-muted"
        aria-label={action}
        aria-pressed={visible}
        aria-controls={props.id}
        title={action}
        disabled={props.disabled}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  );
}
