'use client';

import { CategorySelect } from '@/components/category-select';
import { useState } from 'react';
import { LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DashboardState, TemplateResponsibility } from '@/lib/types';

export function CreateRecipientDialog({ open, onOpenChange, onCreate, templates, busy, initialTemplateKey, canCreateCategory = false, categories = [] }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: Record<string, unknown>) => void;
  templates: DashboardState['templates'];
  busy: string | null;
  initialTemplateKey?: string;
  canCreateCategory?: boolean;
  categories?: string[];
}) {
  const [templateKey, setTemplateKey] = useState(initialTemplateKey ?? templates[0]?.template_key ?? '');
  const template = templates.find((item) => item.template_key === templateKey);
  const [customize, setCustomize] = useState(false);
  const [items, setItems] = useState<TemplateResponsibility[]>(template?.responsibilities ?? []);
  function update(index: number, patch: Partial<TemplateResponsibility>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
  function submit(event: { preventDefault: () => void; currentTarget: HTMLFormElement }) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (key: string) => { const value = data.get(key); return typeof value === 'string' ? value : ''; };
    onCreate({ displayName: text('displayName'), timezone: text('timezone'), templateKey, consentAccepted: data.get('consentAccepted') === 'on', nonClinicalAcknowledged: data.get('nonClinicalAcknowledged') === 'on', ...(customize ? { responsibilities: items } : {}) });
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <form onSubmit={submit}>
        <DialogHeader>
          <DialogTitle>Create a care plan for someone</DialogTitle>
          <DialogDescription>Choose a starting template and optionally customize the new plan’s responsibilities.</DialogDescription>
        </DialogHeader>
        <fieldset disabled={!!busy} className="mt-5 grid min-w-0 gap-4">
          <label htmlFor="recipient-name" className="grid gap-1.5 text-sm font-medium">Person&apos;s display name<Input id="recipient-name" name="displayName" placeholder="e.g. Jordan" maxLength={100} required /></label>
          <label htmlFor="recipient-timezone" className="grid gap-1.5 text-sm font-medium">Timezone<Input id="recipient-timezone" name="timezone" defaultValue="America/Toronto" required /></label>
          <label htmlFor="recipient-template" className="grid gap-1.5 text-sm font-medium">Starting template
            <select id="recipient-template" value={templateKey} onChange={(event) => { setTemplateKey(event.target.value); setItems(templates.find((item) => item.template_key === event.target.value)?.responsibilities ?? []); }} className="h-9 min-w-0 rounded-lg border bg-background px-3 text-sm" required>
              {templates.map((item) => <option key={item.id} value={item.template_key}>{item.name} · v{item.version}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={customize} onChange={(event) => setCustomize(event.target.checked)} />Customize responsibilities</label>
          {customize && <section className="bg-[var(--care-inset)] grid gap-3 rounded-xl border p-4" aria-label="Customize responsibilities">
            <p className="text-sm text-muted-foreground">Edit, add, or remove responsibilities for this person. Due dates are measured in days from creation. Switching templates resets these edits. The original template stays unchanged.</p>
            <p className="text-xs text-muted-foreground">{'{{recipient_name}} will be replaced with the person’s display name.'}</p>
            {items.map((item, index) => <fieldset key={index} className="grid min-w-0 gap-3 rounded-lg border p-3">
              <legend className="px-1 text-xs font-medium">Responsibility {index + 1}</legend>
              <label htmlFor={`responsibility-title-${index}`} className="grid gap-1 text-sm">Title<Input id={`responsibility-title-${index}`} value={item.title} onChange={(event) => update(index, { title: event.target.value })} maxLength={200} pattern=".*\S.*" required /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <CategorySelect id={`responsibility-category-${index}`} value={item.category} onChange={(category) => update(index, { category })} categories={[...categories, ...items.map((item) => item.category)]} canCreate={canCreateCategory} disabled={!!busy} />
                <label htmlFor={`responsibility-due-${index}`} className="grid gap-1 text-sm">Due in days<Input id={`responsibility-due-${index}`} type="number" min={0} max={3650} step={1} value={item.due_offset_days} onChange={(event) => update(index, { due_offset_days: event.target.value })} required /></label>
              </div>
              <Button type="button" variant="ghost" className="justify-self-start" onClick={() => setItems((current) => current.filter((_, i) => i !== index))} aria-label={`Remove responsibility ${index + 1}`}><Trash2 />Remove</Button>
            </fieldset>)}
            {!items.length && <p className="text-sm">Add at least one responsibility to create the plan.</p>}
            <Button type="button" variant="outline" disabled={items.length >= 100} onClick={() => setItems((current) => [...current, { title: '', category: 'general', due_offset_days: '1' }])}><Plus />Add responsibility</Button>
          </section>}
          <label className="flex items-start gap-3 text-sm leading-5"><input name="consentAccepted" type="checkbox" className="mt-1 size-4" required /><span>I confirm that appropriate consent has been obtained for care coordination and storage.</span></label>
          <label className="flex items-start gap-3 text-sm leading-5"><input name="nonClinicalAcknowledged" type="checkbox" className="mt-1 size-4" required /><span>I understand Carestead is not a clinical or emergency-response system.</span></label>
        </fieldset>
        <DialogFooter className="mt-5" showCloseButton><Button type="submit" disabled={!!busy || !template || (customize && !items.length)}>{busy === 'create_recipient' ? <LoaderCircle className="animate-spin" /> : <Plus />}Create plan</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
