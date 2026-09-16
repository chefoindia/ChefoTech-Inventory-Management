import { env, isTest } from '@/config/env';
import { logger } from '@/lib/logger';

export interface EmailAttachment {
  filename: string;
  /** Base64-encoded content. */
  content: string;
  contentType: string;
}

export interface EmailMessage {
  to: { email: string; name?: string }[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: { email: string; name?: string };
  attachments?: EmailAttachment[];
  tags?: string[];
}

export interface EmailSendResult {
  provider: string;
  messageId?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** Development / test provider: logs instead of sending and records messages for assertions. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.sent.push(message);
    if (!isTest) {
      logger.info(
        { to: message.to.map((t) => t.email), subject: message.subject, attachments: message.attachments?.length ?? 0 },
        'email (console provider)',
      );
    }
    return { provider: this.name, messageId: `console-${Date.now()}` };
  }
}

/** Brevo (Sendinblue) transactional email via REST API. */
export class BrevoEmailProvider implements EmailProvider {
  readonly name = 'brevo';
  constructor(private readonly apiKey: string) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': this.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: env.EMAIL_FROM_NAME, email: env.EMAIL_FROM_ADDRESS },
        to: message.to,
        replyTo: message.replyTo,
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        attachment: message.attachments?.map((a) => ({ name: a.filename, content: a.content })),
        tags: message.tags,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Brevo send failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { provider: this.name, messageId: data.messageId };
  }
}

function createProvider(): EmailProvider {
  if (env.BREVO_API_KEY && !isTest) return new BrevoEmailProvider(env.BREVO_API_KEY);
  return new ConsoleEmailProvider();
}

export const emailProvider: EmailProvider = createProvider();

const BRAND_FOOTER_HTML = '<p style="margin-top:24px;font-family:sans-serif;font-size:12px;color:#94a3b8">Sent by PharmaOS, a ChefoTech product.</p>';
const BRAND_FOOTER_TEXT = '\n\n--\nSent by PharmaOS, a ChefoTech product.';

/** Sends through the configured provider, appending the product/company footer once. */
export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  const html = message.html.includes('a ChefoTech product') ? message.html : `${message.html}${BRAND_FOOTER_HTML}`;
  const text = message.text === undefined || message.text.includes('a ChefoTech product') ? message.text : `${message.text}${BRAND_FOOTER_TEXT}`;
  return emailProvider.send({ ...message, html, text });
}
