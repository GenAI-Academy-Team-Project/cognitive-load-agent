'use client';

import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function PasswordInput({ label, className, ...props }: Omit<ComponentProps<typeof Input>, 'type'> & { label: string }) {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <Input {...props} type={visible ? 'text' : 'password'} className={cn(className, 'pr-11')} />
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
      onClick={() => setVisible(!visible)}
      aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
      aria-controls={props.id}
      aria-pressed={visible}
      disabled={props.disabled}
    >
      {visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
    </Button>
  </div>;
}
