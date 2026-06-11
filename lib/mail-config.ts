import type {
  MailClientOptions,
  MailServerOptions,
} from "@routecraft/routecraft";
import { env } from "../env.js";

/**
 * Inline mail connection options shared by the inbox source and the
 * send-email capability.
 *
 * On 0.6.0-canary.20 the `CraftConfig.mail` accounts block is typed but
 * never applied (no config applier is registered for "mail", so the
 * MailClientManager is never constructed). Until that lands, connection
 * details ride on each adapter instead of a named account.
 */
export const imapOptions: Pick<
  MailServerOptions,
  "host" | "port" | "secure" | "auth"
> = {
  host: env.MAIL_HOST,
  port: env.MAIL_IMAP_PORT,
  secure: env.MAIL_TLS,
  auth: { user: env.MAIL_USER, pass: env.MAIL_PASSWORD },
};

export const smtpOptions: MailClientOptions = {
  host: env.MAIL_HOST,
  port: env.MAIL_SMTP_PORT,
  secure: env.MAIL_TLS,
  auth: { user: env.MAIL_USER, pass: env.MAIL_PASSWORD },
  from: env.MAIL_USER,
};
