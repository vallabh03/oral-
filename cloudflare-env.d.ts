declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    RATE_KV?: KVNamespace;
    ADMIN_EMAIL?: string;
    ADMIN_EMAILS?: string;
    DOCTOR_ADMIN_EMAILS?: string;
    LIVE_INTAKE_ENABLED?: string;
    STAFF_ACCESS_ENABLED?: string;
    AUDIT_KEY?: string;
    PUBLIC_INTAKE_ENABLED?: string;
    PRIVACY_NOTICE?: string;
    CONSENT_VERSION?: string;
    CONTACT_EMAIL?: string;
    CONTACT_PHONE?: string;
    WHATSAPP_ENABLED?: string;
    WHATSAPP_PHONE_NUMBER_ID?: string;
    WHATSAPP_ACCESS_TOKEN?: string;
    WHATSAPP_REPORT_TEMPLATE_NAME?: string;
    WHATSAPP_TEMPLATE_LANGUAGE?: string;
    WHATSAPP_GRAPH_VERSION?: string;
    DEMO_MODE_ENABLED?: string;
  }
}
