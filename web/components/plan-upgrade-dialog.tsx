'use client';

import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

type UpgradePreview = { fromVersion: string; toVersion: string; upgradeReview: string; additions: { title: string; category: string; dueOffsetDays: number }[] };

export function PlanUpgradeDialog({ recipientId, open, onOpenChange, busy, onApply }: { recipientId: string; open: boolean; onOpenChange: (open: boolean) => void; busy: boolean; onApply: (review: string) => Promise<boolean> }) {
  const [preview, setPreview] = useState<UpgradePreview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preview_plan_upgrade', recipientId }), signal: controller.signal })
      .then(async (response) => { const result = await response.json() as UpgradePreview | { error: string }; if (!response.ok || 'error' in result) throw new Error('error' in result ? result.error : 'Unable to load the upgrade review.'); setPreview(result); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load the upgrade review.'); });
    return () => controller.abort();
  }, [open, recipientId]);
  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Review template upgrade</DialogTitle><DialogDescription>Review the new responsibilities before applying this version. Existing tasks and personal edits are preserved.</DialogDescription></DialogHeader>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!preview && !error && <output>Loading proposed changes…</output>}
    {preview && <div className="space-y-3"><p className="font-medium">Version {preview.fromVersion} → {preview.toVersion}</p><p className="text-sm">{preview.additions.length} new responsibilities</p><ul className="max-h-72 space-y-3 overflow-y-auto">{preview.additions.map((item, index) => <li key={index} className="bg-[var(--care-inset)] rounded-xl border p-3"><p className="font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{item.category} · Unassigned · Due {item.dueOffsetDays} days after applying</p></li>)}</ul>{!preview.additions.length && <p className="text-sm text-muted-foreground">All template responsibilities are already represented. Only the plan’s template version will change.</p>}</div>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy || !preview || !!error} onClick={async () => { if (preview) { const applied = await onApply(preview.upgradeReview); if (applied) onOpenChange(false); else setError('Upgrade was not applied. Close and reopen this review to check the latest changes, then try again.'); } }}>{busy ? 'Applying…' : 'Apply reviewed changes'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
