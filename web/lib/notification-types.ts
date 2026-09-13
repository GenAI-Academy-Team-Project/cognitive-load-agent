export const notificationChannels = ['in_app', 'email', 'sms', 'push', 'ntfy'] as const;

export function notificationDeliveryHint(channel: string, errorCode: string | null): string | null {
  if (channel !== 'sms') return null;
  switch (errorCode) {
    case 'twilio_21211': return 'Check the receiving caregiver’s phone number, including the country code. The sender and recipient must be different numbers.';
    case 'twilio_21606': return 'Check that the configured sender belongs to your SMS account and supports messaging.';
    case 'twilio_21608': return 'The receiving number is not verified for this account. Check verified recipients and account restrictions in the SMS provider console.';
    case 'twilio_21610': return 'This recipient opted out of SMS. They must choose to resubscribe before SMS can resume.';
    case 'provider_http_400': return 'The SMS provider rejected this request. Check its error logs for the specific reason; this record contains only the HTTP status.';
    default: return errorCode?.startsWith('twilio_') ? 'Check this error code in the SMS provider console for the required correction.' : null;
  }
}
export type NotificationChannel = typeof notificationChannels[number];
export type NotificationConfig = {
  NTFY_SERVER_URL?: string;
  NTFY_ACCESS_TOKEN?: string;
  RESEND_API_KEY?: string;
  NOTIFICATION_EMAIL_FROM?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};
export type NotificationInput = { channel: NotificationChannel; memberId: string; title: string; detail: string };
export type NotificationPreferences = {
  recipient_id: string; member_id: string; email_enabled: number; sms_enabled: number; phone: string; push_json: string | null;
};

// A strict function tool contract usable by a future model-backed planner as well as chat.
export const sendNotificationTool = {
  type: 'function', name: 'send_notification',
  description: 'Prepare a notification to an active care-circle member. Requires caregiver approval before delivery; never invoke a provider during proposal.',
  strict: true,
  parameters: {
    type: 'object', additionalProperties: false,
    properties: {
      channel: { type: 'string', enum: notificationChannels },
      memberId: { type: 'string', description: 'An exact member ID from the current care circle.' },
      title: { type: 'string' }, detail: { type: 'string', description: 'Exact message to show for approval and send.' },
    },
    required: ['channel', 'memberId', 'title', 'detail'],
  },
} as const;

export function configuredChannels(config: NotificationConfig): NotificationChannel[] {
  return ['in_app',
    ...(ntfyServerUrl(config.NTFY_SERVER_URL) ? ['ntfy' as const] : []),
    ...(config.RESEND_API_KEY && config.NOTIFICATION_EMAIL_FROM ? ['email' as const] : []),
    ...(config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_FROM_NUMBER ? ['sms' as const] : []),
    ...(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY && config.VAPID_SUBJECT ? ['push' as const] : []),
  ];
}

// Server selection belongs to the operator, never to chat or caregiver input.
export function ntfyServerUrl(value?: string): string | null {
  try {
    const url = new URL(value || '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return url.origin;
  } catch { return null; }
}
export function validNtfyTopic(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) && !['app', 'docs', 'static', 'file', 'v1', 'health', 'metrics'].includes(value);
}
