'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConflictSchedule } from './conflict-schedule';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ConflictOption, PlanningState, Simulation } from '@/lib/planning-types';

// Intake responsibilities are not Google events yet. Reuse the planning approval
// boundary before offering the existing calendar invitation workflow.
export function CalendarResponsibilityReview({ recipientId, taskId, timeZone, disabled, onSchedule, onChanged }: {
  recipientId: string; taskId: string; timeZone: string; disabled: boolean;
  onSchedule: (duration: number) => void; onChanged: () => void;
}) {
  const [planning, setPlanning] = useState<PlanningState | null>(null);
  const [preview, setPreview] = useState<Simulation | null>(null);
  const [options, setOptions] = useState<ConflictOption[]>([]);
  const [proposalId, setProposalId] = useState('');
  const [owner, setOwner] = useState('');
  const [duration, setDuration] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const task = planning?.tasks.find(item => item.id === taskId);
  const when = (value: string) => new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value));
  const send = useCallback(async (action: string, fields: Record<string, unknown> = {}, path = '/api/planning') => {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, recipientId, ...fields }) });
    const result = await response.json() as { error?: string; state: PlanningState; simulation: Simulation; options?: ConflictOption[]; proposalId: string };
    if (!response.ok) throw new Error(result.error || 'The scheduling check failed.');
    return result;
  }, [recipientId]);
  useEffect(() => {
    let active = true;
    fetch(`/api/planning?recipientId=${encodeURIComponent(recipientId)}`).then(async response => {
      const result = await response.json() as { error?: string; state: PlanningState; simulation: Simulation; options?: ConflictOption[]; proposalId: string };
      if (!response.ok) throw new Error(result.error || 'Could not load the responsibility.');
      if (!active) return;
      const current: PlanningState = result.state;
      const selected = current.tasks.find(item => item.id === taskId);
      if (!selected) throw new Error('This responsibility is no longer available.');
      setPlanning(current); setOwner(selected.planning.owner_member_id); setDuration(selected.planning.duration_minutes);
      if (!disabled) {
        const checked = await send('simulate', { taskId, dueAt: selected.due_at });
        if (active) setPreview(checked.simulation);
      }
    }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
    // This component is keyed by recipient and task; no model or calendar writes on mount.
  }, [recipientId, taskId, disabled, send]);
  async function run(work: () => Promise<void>) {
    setBusy(true); setError('');
    try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Scheduling check failed.'); }
    finally { setBusy(false); }
  }
  const setupChanged = task && (owner !== task.planning.owner_member_id || duration !== task.planning.duration_minutes);
  const moved = Boolean(preview?.changes.some(change => change.before !== change.after));
  return <section aria-label="Responsibility scheduling review" className="mt-4 w-full space-y-4 rounded-xl border bg-card p-4">
    <div><h3 className="font-heading font-semibold">Review before scheduling</h3><p className="mt-2 text-sm text-muted-foreground">This responsibility is saved in the care plan and has not been added to Google Calendar. Check its time, resolve any conflicts, then review the invitation.</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!task ? <output>Loading responsibility details…</output> : <>
      <p className="text-sm">Requested time: {when(task.due_at)} · {timeZone}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Responsible caregiver<select className="mt-2 h-10 w-full rounded-lg border bg-background px-3" value={owner} disabled={disabled || busy} onChange={event => { setOwner(event.target.value); setPreview(null); setOptions([]); setProposalId(''); }}><option value="">Choose caregiver</option>{planning!.members.filter(member => member.role !== 'viewer').map(member => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select></label>
        <label htmlFor={`schedule-duration-${taskId}`} className="text-sm font-medium">Duration in minutes<Input id={`schedule-duration-${taskId}`} className="mt-2" type="number" min={5} max={480} value={duration} disabled={disabled || busy} onChange={event => { setDuration(Number(event.target.value)); setPreview(null); setOptions([]); setProposalId(''); }} /></label>
      </div>
      <Button variant="outline" disabled={disabled || busy || !owner} onClick={() => run(async () => {
        setPreview(null); setOptions([]); setProposalId('');
        const details = task.planning;
        const saved = await send('save_task_details', { taskId, ownerMemberId: owner, durationMinutes: duration, dependsOn: details.depends_on, backupMemberId: details.backup_member_id, requirements: details.requirements, factIds: details.fact_ids || [] });
        setPlanning(saved.state);
        const checked = await send('simulate', { taskId, dueAt: task.due_at });
        setPreview(checked.simulation);
      })}>Save details and check time</Button>
      <p className="text-xs text-muted-foreground">Checks use this recipient’s recorded caregiver availability and responsibilities, not personal Google calendar free/busy. Add availability, ride dependencies, or required care facts in Care Organizer if needed.</p>
      <ConflictSchedule tasks={planning!.tasks} taskId={taskId} timeZone={timeZone} preview={preview} />
      {preview && <div aria-label="Scheduling check" className="space-y-2">
        <p className="font-medium">{preview.conflicts.length ? 'Resolve scheduling conflicts' : 'No conflicts found in the recorded care plan'}</p>
        {preview.conflicts.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">{preview.conflicts.map((conflict, i) => <li key={i}>{conflict}</li>)}</ul>}
        {moved && <ul className="space-y-2 text-sm">{preview.changes.map(change => <li key={change.taskId}><strong>{change.title}</strong><br />{when(change.before)} → {when(change.after)}</li>)}</ul>}
      </div>}
      <Button variant="outline" disabled={disabled || busy || !owner || Boolean(setupChanged)} onClick={() => run(async () => {
        setOptions([]); setProposalId('');
        const result = await send('conflict_options', { taskId }, '/api/agent-workflows');
        setOptions(result.options || []);
        if (!result.options?.length) throw new Error('No workable options returned. Review availability in Care Organizer.');
      })}>Suggest workable options</Button>
      {options.length > 0 && <ul aria-label="Validated scheduling options" className="space-y-3">{options.map(option => <li key={option.dueAt} className="rounded-lg border p-3"><p className="font-medium">{when(option.dueAt)}</p><p className="mt-1 text-sm">{option.rationale}</p><p className="mt-1 text-xs text-muted-foreground">{option.uncertainty}</p><Button className="mt-2" variant="outline" disabled={disabled || busy} onClick={() => run(async () => {
        setProposalId(''); setPreview(null);
        const checked = await send('simulate', { taskId, dueAt: option.dueAt });
        setPreview(checked.simulation);
        if (!checked.simulation.conflicts.length) {
          const prepared = await send('propose_simulation', { taskId, dueAt: option.dueAt });
          setProposalId(prepared.proposalId);
        }
      })}>Review this option</Button></li>)}</ul>}
      {proposalId && preview && !preview.conflicts.length && <Button disabled={disabled || busy} onClick={() => run(async () => {
        await send('apply_proposal', { id: proposalId });
        onChanged();
      })}>Approve care-plan change</Button>}
      <Button disabled={disabled || busy || !preview || Boolean(preview.conflicts.length) || moved || Boolean(setupChanged)} onClick={() => onSchedule(duration)}>Schedule this responsibility</Button>
      {moved && <p className="text-sm text-muted-foreground">Approve the care-plan change first. Then schedule the saved time and review the Google guests before sending.</p>}
    </>}
  </section>;
}
