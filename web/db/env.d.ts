declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    PUSHOVER_API_TOKEN?: string;
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
    // Untested integrations: require manual setup, cannot be tested by automated tests
    ONESIGNAL_APP_ID?: string;
    ONESIGNAL_API_KEY?: string;
    OPENROUTER_API_KEY?: string;
    OPENROUTER_MODEL?: string;
    MEM0_API_KEY?: string;
  }
}
