import type { ChatMessage } from '@/lib/types';

export function CareEvidence({ evidence }: { evidence: ChatMessage['evidence'] }) {
  if (!evidence.length) return null;
  return <details className="mt-2 rounded-xl border bg-card px-3 py-2"><summary className="cursor-pointer text-xs font-medium text-primary">Evidence used · {evidence.length}</summary><div className="mt-2 space-y-2">{evidence.map((item, index) => <div key={`${item.label}-${index}`} className="border-l-2 border-border pl-2"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--care-success-ink)]">{item.label}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.detail}</p></div>)}</div></details>;
}
