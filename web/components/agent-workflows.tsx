'use client';

import { useRef, useState } from 'react';
import { Camera, FileSearch, LoaderCircle, Sparkles, Trash2 } from 'lucide-react';

import type { PlanningAction } from './care-planning';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { localInput, localToInstant } from '@/lib/calendar-time';
import type {
  DocumentIntake,
  DraftItem,
  PlanAdaptation,
  PlanningState,
} from '@/lib/planning-types';
import { taskCategories } from '@/lib/planning-types';
import type { DashboardState } from '@/lib/types';

const panel = 'care-organizer-panel min-w-0 rounded-2xl border p-5 md:p-6';
const selectStyle =
  'min-h-10 w-full rounded-lg border bg-background px-3 text-sm';
const maxDocumentBytes = 5 * 1024 * 1024;
const documentTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
]);

function documentUploadError(reason: unknown) {
  if (
    reason instanceof DOMException &&
    (reason.name === 'SyntaxError' ||
      reason.message.includes('expected pattern'))
  )
    return 'The browser could not read the selected file. Choose the file again and retry without leaving this tab.';
  return reason instanceof Error
    ? reason.message
    : 'Unable to review this file.';
}

function documentBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function DraftEditor({
  drafts,
  setDrafts,
  zone,
}: {
  drafts: DraftItem[];
  setDrafts: (value: DraftItem[]) => void;
  zone: string;
}) {
  const change = (index: number, value: Partial<DraftItem>) =>
    setDrafts(
      drafts.map((draft, current) =>
        current === index ? { ...draft, ...value } : draft,
      ),
    );
  return (
    <div className="grid gap-3">
      {drafts.map((draft, index) => (
        <article
          key={`${draft.title}-${index}`}
          className="rounded-xl border bg-background p-4"
        >
          <div className="flex items-start gap-3">
            <label
              htmlFor={`agent-draft-title-${index}`}
              className="grid min-w-0 flex-1 gap-2 text-sm"
            >
              Responsibility
              <Input
                id={`agent-draft-title-${index}`}
                value={draft.title}
                maxLength={200}
                onChange={(event) =>
                  change(index, { title: event.target.value })
                }
              />
            </label>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Remove ${draft.title}`}
              onClick={() =>
                setDrafts(drafts.filter((_, current) => current !== index))
              }
            >
              <Trash2 />
            </Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label
              htmlFor={`agent-draft-time-${index}`}
              className="grid gap-2 text-sm"
            >
              Confirmed date and time
              <Input
                id={`agent-draft-time-${index}`}
                type="datetime-local"
                value={draft.dueAt ? localInput(draft.dueAt, zone) : ''}
                onChange={(event) => {
                  try {
                    change(index, {
                      dueAt: event.target.value
                        ? localToInstant(event.target.value, zone)
                        : '',
                    });
                  } catch {
                    change(index, { dueAt: '' });
                  }
                }}
              />
            </label>
            <label className="grid gap-2 text-sm">
              Category
              <select
                className={selectStyle}
                value={draft.category}
                onChange={(event) =>
                  change(index, { category: event.target.value })
                }
              >
                {taskCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
          </div>
          {draft.question && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
              Needs review: {draft.question}
            </p>
          )}
          <blockquote className="mt-2 text-xs text-muted-foreground">
            Source: {draft.source}
          </blockquote>
        </article>
      ))}
    </div>
  );
}

export function AdaptivePlanBuilder({
  dashboard,
  state,
  act,
  disabled,
  onError,
}: {
  dashboard: DashboardState;
  state: PlanningState;
  act: PlanningAction;
  disabled: boolean;
  onError: (value: string) => void;
}) {
  const [description, setDescription] = useState('');
  const [adaptation, setAdaptation] = useState<PlanAdaptation | null>(null);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState('');
  const zone = dashboard.selectedRecipient.timezone;
  async function generate() {
    setBusy(true);
    onError('');
    try {
      const response = await fetch('/api/agent-workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'adapt_plan',
          recipientId: dashboard.selectedRecipient.id,
          description,
        }),
      });
      const result = (await response.json()) as {
        adaptation?: PlanAdaptation;
        model?: string;
        error?: string;
      };
      if (!response.ok || !result.adaptation)
        throw new Error(result.error || 'Unable to adapt this care plan.');
      setAdaptation(result.adaptation);
      setModel(result.model ?? 'configured model');
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : 'Unable to adapt this care plan.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section data-care-tone="plum" className={panel}>
      <Sparkles className="size-7 text-primary" />
      <h2 className="mt-3 font-heading text-2xl font-semibold">
        Adapt a care plan
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Describe this person’s routines, support needs, and preferences. AI
        proposes a reusable plan; it never copies another person’s private
        history and nothing is added until you review and approve it.
      </p>
      <label
        htmlFor="adaptive-plan-description"
        className="mt-5 grid gap-2 text-sm font-medium"
      >
        What should this plan support?
        <Textarea
          id="adaptive-plan-description"
          value={description}
          maxLength={2000}
          placeholder="Example: Weekly physiotherapy, transport support, a reminder the day before, and a follow-up check-in…"
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <Button
        className="mt-3"
        disabled={disabled || busy || description.trim().length < 20}
        onClick={generate}
      >
        {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Build
        a draft plan
      </Button>
      {adaptation && (
        <div className="mt-6 grid gap-4">
          <div className="rounded-xl border bg-background p-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">AI draft</Badge>
              <Badge variant="outline">{model}</Badge>
            </div>
            <p className="mt-3 text-sm">{adaptation.summary}</p>
          </div>
          {adaptation.questions.length > 0 && (
            <div>
              <h3 className="font-medium">Questions to confirm</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {adaptation.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          )}
          <DraftEditor
            drafts={adaptation.drafts}
            setDrafts={(drafts) => setAdaptation({ ...adaptation, drafts })}
            zone={zone}
          />
          <Button
            disabled={
              disabled ||
              !adaptation.drafts.length ||
              adaptation.drafts.some(
                (draft) => !draft.title.trim() || !draft.dueAt,
              )
            }
            onClick={async () => {
              const result = await act('propose_dump', {
                drafts: adaptation.drafts,
                sourceMode: 'model',
              });
              if (result) {
                setAdaptation(null);
                setDescription('');
              }
            }}
          >
            Prepare reviewed plan for approval
          </Button>
          <p className="text-xs text-muted-foreground">
            Tool path: get recipient profile → propose template adaptation →
            request clarification → caregiver approval.
          </p>
        </div>
      )}
      {!state.tasks.length && (
        <p className="mt-4 text-xs text-muted-foreground">
          This is a new plan, so the draft will start from the profile and your
          description.
        </p>
      )}
    </section>
  );
}

export function DocumentIntakePanel({
  photoCapture = false,
  dashboard,
  act,
  disabled,
  onError,
}: {
  photoCapture?: boolean;
  dashboard: DashboardState;
  act: PlanningAction;
  disabled: boolean;
  onError: (value: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false);
  const [intake, setIntake] = useState<DocumentIntake | null>(null),
    [model, setModel] = useState('');
  const cameraInput = useRef<HTMLInputElement>(null);
  function selectFile(selected: File | undefined) {
    // Cancelling either picker preserves the file already chosen.
    if (!selected) return;
    setIntake(null);
    if (!documentTypes.has(selected.type)) {
      onError('Use PDF, TXT, PNG, JPG, or WebP.');
      setFile(null);
    } else if (selected.size > maxDocumentBytes) {
      onError('Choose a file no larger than 5 MB.');
      setFile(null);
    } else {
      onError('');
      setFile(selected);
    }
  }
  const zone = dashboard.selectedRecipient.timezone;
  async function review() {
    if (!file) return;
    setBusy(true);
    onError('');
    try {
      if (!documentTypes.has(file.type))
        throw new Error('Use PDF, TXT, PNG, JPG, or WebP.');
      if (file.size > maxDocumentBytes)
        throw new Error('Choose a file no larger than 5 MB.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const response = await fetch('/api/agent-workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'intake',
          recipientId: dashboard.selectedRecipient.id,
          processingConsent: String(consent),
          file: {
            name: file.name,
            type: file.type,
            size: file.size,
            dataBase64: documentBase64(bytes),
          },
        }),
      });
      const responseText = await response.text();
      if (response.status === 413)
        throw new Error('Choose a file no larger than 5 MB.');
      let result: {
        intake?: DocumentIntake;
        model?: string;
        error?: string;
      };
      try {
        result = JSON.parse(responseText) as typeof result;
      } catch {
        throw new Error(
          response.ok
            ? 'Carestead returned an unreadable response. Please retry.'
            : 'The upload did not reach Carestead. Choose the file again and retry.',
        );
      }
      if (!response.ok || !result.intake)
        throw new Error(result.error || 'Unable to review this file.');
      setIntake(result.intake);
      setModel(result.model ?? 'configured model');
    } catch (reason) {
      onError(documentUploadError(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section data-care-tone="amber" className={panel}>
      <FileSearch className="size-7 text-primary" />
      <h2 className="mt-3 font-heading text-2xl font-semibold">
        Review a care document
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Extract follow-ups, dates, contacts, and explicit facts from a PDF,
        image, or text file. The original file is processed transiently and is
        not stored. Extracted facts stay unverified.
      </p>
      <label
        htmlFor="care-document-upload"
        className="mt-5 grid gap-2 text-sm font-medium"
      >
        Document or image
        <Input
          id="care-document-upload"
          type="file"
          accept="application/pdf,text/plain,image/png,image/jpeg,image/webp"
          disabled={disabled || busy}
          onChange={(event) => {
            selectFile(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <span className="text-xs font-normal text-muted-foreground">
          PDF, TXT, PNG, JPG, or WebP · 5 MB maximum
        </span>
      </label>
      {photoCapture && <>
      <input
        ref={cameraInput}
        id="care-document-camera"
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Take a photo"
        hidden
        disabled={disabled || busy}
        onChange={(event) => {
          selectFile(event.target.files?.[0]);
          event.currentTarget.value = '';
        }}
      />
      <Button type="button" variant="outline" className="mt-3"
        disabled={disabled || busy} onClick={() => cameraInput.current?.click()}>
        <Camera /> Take a photo
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        Take a picture with your camera, or choose an existing image or document above.
      </p>
      </>}
      {file && <output className="mt-3 block break-all text-sm">Selected file: {file.name}</output>}
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input
          className="mt-1"
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        I confirm I have permission to process this file with OpenAI for care
        coordination.
      </label>
      <Button
        className="mt-4"
        disabled={disabled || busy || !file || !consent}
        onClick={review}
      >
        {busy ? <LoaderCircle className="animate-spin" /> : <FileSearch />}{' '}
        Extract reviewable items
      </Button>
      {intake && (
        <div className="mt-6 grid gap-4">
          <div className="rounded-xl border bg-background p-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Unverified extraction</Badge>
              <Badge variant="outline">{model}</Badge>
            </div>
            <p className="mt-3 text-sm">{intake.summary}</p>
          </div>
          {intake.warnings.length > 0 && (
            <div>
              <h3 className="font-medium">Warnings</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {intake.warnings.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <DraftEditor
            drafts={intake.drafts}
            setDrafts={(drafts) => setIntake({ ...intake, drafts })}
            zone={zone}
          />
          {intake.facts.map((fact, index) => (
            <article
              key={`${fact.kind}-${index}`}
              className="rounded-xl border bg-background p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{fact.kind}</p>
                <div className="flex gap-2">
                  <Badge variant="outline">Unverified</Badge>
                  <Badge variant="outline">{fact.confidence}</Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${fact.kind}`}
                    onClick={() =>
                      setIntake({
                        ...intake,
                        facts: intake.facts.filter(
                          (_, current) => current !== index,
                        ),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-sm">{fact.value}</p>
              <blockquote className="mt-2 text-xs text-muted-foreground">
                Source: {fact.source}
              </blockquote>
            </article>
          ))}
          {intake.contacts.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Contacts found for manual review: {intake.contacts.join(' · ')}
            </p>
          )}
          {intake.questions.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {intake.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          )}
          <Button
            disabled={
              disabled ||
              (!intake.drafts.length && !intake.facts.length) ||
              intake.drafts.some((draft) => !draft.title.trim() || !draft.dueAt)
            }
            onClick={async () => {
              const result = await act('propose_intake', {
                drafts: intake.drafts,
                facts: intake.facts,
              });
              if (result) {
                setIntake(null);
                setFile(null);
                setConsent(false);
              }
            }}
          >
            Prepare selected items for approval
          </Button>
          <p className="text-xs text-muted-foreground">
            Tool path: analyze document → propose responsibilities/facts →
            clarify ambiguity → caregiver approval. No medication inference or
            clinical interpretation.
          </p>
        </div>
      )}
    </section>
  );
}
