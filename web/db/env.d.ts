declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
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
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_REDIRECT_URI?: string;
    GOOGLE_TOKEN_KEY?: string;
  }
}
