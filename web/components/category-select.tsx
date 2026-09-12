'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { taskCategories } from '@/lib/planning-types';

const label = (value: string) => value === 'checkin' || value === 'check-in' ? 'Check-in' : value.charAt(0).toUpperCase() + value.slice(1);

export function CategorySelect({ id, value, onChange, categories = [], canCreate, disabled = false }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  categories?: string[];
  canCreate: boolean;
  disabled?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const options = [...new Set([...taskCategories.filter((item) => item !== 'checkin'), ...categories, value].filter(Boolean))];
  const normalized = name.trim().replace(/\s+/g, ' ').toLowerCase();
  function create() {
    if (!canCreate || disabled || !normalized || normalized.length > 80) return;
    const match = options.find((item) => label(item).toLowerCase() === normalized);
    onChange(match ?? normalized);
    setCreating(false);
    setName('');
  }
  return <div className="grid min-w-0 gap-1.5">
    <label htmlFor={id} className="text-sm font-medium">Category</label>
    <select id={id} name="category" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="h-9 min-w-0 rounded-lg border bg-background px-3 text-sm" required>
      {options.filter((item) => item !== 'checkin' || value === 'checkin').map((item) => <option key={item} value={item}>{label(item)}</option>)}
    </select>
    {canCreate && !creating && <Button type="button" variant="ghost" size="sm" className="justify-self-start" disabled={disabled} onClick={() => setCreating(true)}>Create category</Button>}
    {canCreate && creating && <div className="bg-[var(--care-inset)] grid gap-2 rounded-lg border p-3">
      <label htmlFor={`${id}-new`} className="text-sm">New category name</label>
      <Input id={`${id}-new`} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} disabled={disabled} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); create(); } }} />
      <p className="text-xs text-muted-foreground">The category is saved with this responsibility.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={disabled || !normalized} onClick={create}>Use category</Button><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { setCreating(false); setName(''); }}>Cancel</Button></div>
    </div>}
  </div>;
}
