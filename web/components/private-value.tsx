'use client';

import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';

type MaskKind = 'email' | 'phone' | 'secret';

function mask(value: string, kind: MaskKind) {
  if (!value) return '';
  if (kind === 'email') {
    const at = value.lastIndexOf('@');
    return at > 0 ? `${value[0]}••••${value.slice(at)}` : '••••••••';
  }
  if (kind === 'phone') {
    const digits = value.replace(/\D/g, '');
    return digits.length > 4 ? `••• ••• ${digits.slice(-4)}` : '••••';
  }
  return '••••••••';
}

function RevealButton({ label, visible, onClick, disabled }: { label: string; visible: boolean; onClick: () => void; disabled?: boolean }) {
  return <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={`${visible ? 'Hide' : 'Show'} ${label}`} aria-pressed={visible} disabled={disabled} onClick={onClick}>
    {visible ? <Eye aria-hidden="true" className="size-4" /> : <EyeOff aria-hidden="true" className="size-4" />}
  </Button>;
}

export function PrivateValue({ value, kind = 'secret', label }: { value: string; kind?: MaskKind; label: string }) {
  const [visible, setVisible] = useState(false);
  return <span className="inline-flex min-w-0 items-center gap-1"><span className="break-all">{visible ? value : mask(value, kind)}</span><RevealButton label={label} visible={visible} onClick={() => setVisible(!visible)} /></span>;
}

export function PrivateInput({ value, kind = 'secret', label, ...props }: Omit<ComponentProps<typeof Input>, 'value'> & { value: string; kind?: MaskKind; label: string }) {
  const [visible, setVisible] = useState(false);
  const masked = !visible && kind !== 'secret' && Boolean(value);
  const showMasked = kind === 'secret' && !visible && Boolean(value);
  return <span className="flex min-w-0 items-center gap-1">
    <Input {...props} onChange={(event) => { if (kind !== 'secret') setVisible(true); props.onChange?.(event); }} value={showMasked ? mask(value, kind) : value} type={visible ? (kind === 'phone' ? 'tel' : 'text') : kind === 'secret' ? 'password' : 'text'} readOnly={masked || props.readOnly} autoComplete="off" className="min-w-0 flex-1" />
    <RevealButton label={label} visible={visible} disabled={props.disabled || (kind === 'secret' && !Boolean(value))} onClick={() => setVisible(!visible)} />
  </span>;
}
