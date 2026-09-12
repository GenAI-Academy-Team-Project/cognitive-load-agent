export const integrationKeys = {
  ntfy: ['NTFY_SERVER_URL', 'NTFY_ACCESS_TOKEN'],
  calendar: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_TOKEN_KEY'],
  sms: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
  email: ['RESEND_API_KEY', 'NOTIFICATION_EMAIL_FROM'],
  push: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'],
} as const;
export type IntegrationId = keyof typeof integrationKeys;
export type IntegrationStatus = { id: IntegrationId; configured: boolean; enabled: boolean; fields?: { key: typeof integrationKeys[IntegrationId][number]; source: 'override' | 'environment' | 'missing' }[] };
