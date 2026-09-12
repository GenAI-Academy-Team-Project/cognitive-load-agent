import { CircleAlert, TriangleAlert } from 'lucide-react';

// Existing chat history stores notification outcomes as server-generated text.
// Match only those outcome sentences so unrelated chat messages stay unchanged.
export function notificationProblem(content: string): 'failed' | 'unknown' | null {
  if (/^The (email|sms|whatsapp|push|pushover) notification failed\./.test(content)) return 'failed';
  if (/^The (email|sms|whatsapp|push|pushover) delivery result is unknown\./.test(content)) return 'unknown';
  return null;
}

export function NotificationOutcome({ content }: { content: string }) {
  const problem = notificationProblem(content);
  if (!problem) return <output className="block whitespace-pre-wrap text-sm">{content}</output>;
  const Icon = problem === 'failed' ? CircleAlert : TriangleAlert;
  return <div role="alert" className={`flex items-start gap-3 rounded-xl border-l-4 p-4 ${problem === 'failed' ? 'border-[#b42318] bg-[#fff1f0] text-[#802018]' : 'border-[#a15c00] bg-[#fff7e6] text-[#754000]'}`}>
    <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
    <div className="min-w-0"><p className="font-semibold">{problem === 'failed' ? 'Notification failed' : 'Delivery not confirmed'}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{content}</p><p className="mt-2 text-sm font-medium">{problem === 'failed' ? 'Open Recent delivery attempts to review the error before trying again.' : 'Do not resend yet. Check the provider’s delivery status to avoid a duplicate notification.'}</p></div>
  </div>;
}
