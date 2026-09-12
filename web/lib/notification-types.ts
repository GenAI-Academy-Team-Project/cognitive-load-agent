export const notificationChannels = ['in_app', 'email', 'sms', 'push', 'pushover'] as const;
export type NotificationChannel = typeof notificationChannels[number];
export type NotificationConfig = {
  PUSHOVER_API_TOKEN?: string;
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
    ...(config.PUSHOVER_API_TOKEN ? ['pushover' as const] : []),
    ...(config.RESEND_API_KEY && config.NOTIFICATION_EMAIL_FROM ? ['email' as const] : []),
    ...(config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_FROM_NUMBER ? ['sms' as const] : []),
    ...(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY && config.VAPID_SUBJECT ? ['push' as const] : []),
  ];
}
