'use client';

import { useState } from 'react';
import { Clock } from 'lucide-react';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from './popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

const hours = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

export function TimePicker({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hour24, minute = '00'] = (value || '09:00').split(':');
  const hour = String(Number(hour24) % 12 || 12).padStart(2, '0');
  const period = Number(hour24) >= 12 ? 'PM' : 'AM';

  function update(nextHour: string, nextMinute: string, nextPeriod: string) {
    const converted = Number(nextHour) % 12 + (nextPeriod === 'PM' ? 12 : 0);
    onChange(`${String(converted).padStart(2, '0')}:${nextMinute}`);
  }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button type="button" variant="outline" className="w-full justify-between border-input bg-transparent px-2.5 font-normal tabular-nums" aria-label={label} />}>
      {value ? `${hour}:${minute} ${period}` : 'Choose time'}
      <Clock className="size-4 text-primary" />
    </PopoverTrigger>
    <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] rounded-xl p-3">
      <PopoverTitle>{label}</PopoverTitle>
      <div className="grid grid-cols-3 gap-2">
        {[
          { title: 'Hour', value: hour, options: hours, change: (next: string) => update(next, minute, period) },
          { title: 'Minute', value: minute, options: minutes, change: (next: string) => update(hour, next, period) },
          { title: 'AM/PM', value: period, options: ['AM', 'PM'], change: (next: string) => update(hour, minute, next) },
        ].map((part) => <div key={part.title} className="space-y-1.5">
          <span className="text-xs text-muted-foreground">{part.title}</span>
          <Select value={part.value} onValueChange={(next) => { if (next !== null) part.change(next); }}>
            <SelectTrigger aria-label={`${label} ${part.title.toLowerCase()}`} className="h-11 w-full tabular-nums"><SelectValue /></SelectTrigger>
            <SelectContent alignItemWithTrigger={false} className="max-h-60 min-w-20 p-1">
              {part.options.map((option) => <SelectItem key={option} value={option} className="min-h-11 tabular-nums data-selected:bg-primary data-selected:text-primary-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground">{option}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>)}
      </div>
      <Button type="button" className="mt-1 w-full" onClick={() => { if (!value) update(hour, minute, period); setOpen(false); }}>Done</Button>
    </PopoverContent>
  </Popover>;
}
