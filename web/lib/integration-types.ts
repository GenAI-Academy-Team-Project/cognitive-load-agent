export const integrationKeys = {
  onesignal: ['ONESIGNAL_APP_ID', 'ONESIGNAL_API_KEY'],
  llm: ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL'],
  calendar: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_TOKEN_KEY'],
  memory: ['MEM0_API_KEY'],
  whatsapp: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM_NUMBER'],
  sms: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
  email: ['RESEND_API_KEY', 'NOTIFICATION_EMAIL_FROM'],
  push: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'],
} as const;
export type IntegrationId = keyof typeof integrationKeys;
export type IntegrationStatus = { id: IntegrationId; configured: boolean; enabled: boolean; fields?: { key: typeof integrationKeys[IntegrationId][number]; source: 'override' | 'environment' | 'missing' }[] };
