import "server-only";

/**
 * Reads an environment variable, failing loudly at the point of use rather
 * than silently sending `undefined` to Instagram and getting a confusing
 * 400 back hours later.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const env = {
  get instagramAppId() {
    return required("INSTAGRAM_APP_ID");
  },
  get instagramAppSecret() {
    return required("INSTAGRAM_APP_SECRET");
  },
  get webhookVerifyToken() {
    return required("WEBHOOK_VERIFY_TOKEN");
  },
  get tokenEncKey() {
    return required("TOKEN_ENC_KEY");
  },
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get appUrl() {
    return required("APP_URL").replace(/\/$/, "");
  },
  get redirectUri() {
    return `${this.appUrl}/api/auth/instagram/callback`;
  },
};
