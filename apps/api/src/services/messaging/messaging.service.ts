import { env, isTest } from '@/config/env';
import { logger } from '@/lib/logger';

/**
 * SMS and WhatsApp delivery behind small provider interfaces. Providers are chosen from the
 * environment at startup: MSG91 (India) or Twilio for SMS, Meta WhatsApp Cloud API for WhatsApp.
 * With no keys configured the console providers log and record messages (tests assert on them).
 */
export interface TextMessage {
  /** E.164 or 10-digit Indian mobile number. */
  to: string;
  text: string;
  tags?: string[];
}

export interface TextSendResult {
  provider: string;
  messageId?: string;
}

export interface TextProvider {
  readonly name: string;
  send(message: TextMessage): Promise<TextSendResult>;
}

/** Normalises Indian numbers to E.164 (+91…); leaves other E.164 numbers untouched. */
export function toE164(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (/^0?\d{10}$/.test(digits)) return `+91${digits.slice(-10)}`;
  if (/^91\d{10}$/.test(digits)) return `+${digits}`;
  return `+${digits}`;
}

export class ConsoleTextProvider implements TextProvider {
  readonly sent: TextMessage[] = [];
  constructor(readonly name: string) {}
  async send(message: TextMessage): Promise<TextSendResult> {
    this.sent.push(message);
    if (!isTest) logger.info({ channel: this.name, to: message.to, text: message.text.slice(0, 80) }, 'message (console provider)');
    return { provider: this.name, messageId: `console-${Date.now()}` };
  }
}

/** MSG91 Flow API: the approved DLT template must expose a `{{message}}` variable. */
export class Msg91SmsProvider implements TextProvider {
  readonly name = 'msg91';
  async send(message: TextMessage): Promise<TextSendResult> {
    const res = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { authkey: env.MSG91_AUTH_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ template_id: env.MSG91_TEMPLATE_ID, sender: env.MSG91_SENDER_ID, short_url: '0', recipients: [{ mobiles: toE164(message.to).replace('+', ''), message: message.text }] }),
    });
    const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || body.type === 'error') throw new Error(`MSG91 rejected the SMS: ${body.message ?? res.status}`);
    return { provider: this.name, messageId: body.message };
  }
}

export class TwilioSmsProvider implements TextProvider {
  readonly name = 'twilio';
  async send(message: TextMessage): Promise<TextSendResult> {
    const form = new URLSearchParams({ To: toE164(message.to), From: env.TWILIO_FROM_NUMBER, Body: message.text });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const body = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) throw new Error(`Twilio rejected the SMS: ${body.message ?? res.status}`);
    return { provider: this.name, messageId: body.sid };
  }
}

/** Meta WhatsApp Cloud API free-form text (delivered inside the 24-hour customer-care window). */
export class WhatsAppCloudProvider implements TextProvider {
  readonly name = 'whatsapp-cloud';
  async send(message: TextMessage): Promise<TextSendResult> {
    const res = await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: toE164(message.to).replace('+', ''), type: 'text', text: { preview_url: true, body: message.text } }),
    });
    const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message: string } };
    if (!res.ok) throw new Error(`WhatsApp rejected the message: ${body.error?.message ?? res.status}`);
    return { provider: this.name, messageId: body.messages?.[0]?.id };
  }
}

function pickSms(): TextProvider {
  if (isTest) return new ConsoleTextProvider('sms');
  if (env.MSG91_AUTH_KEY && env.MSG91_SENDER_ID && env.MSG91_TEMPLATE_ID) return new Msg91SmsProvider();
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER) return new TwilioSmsProvider();
  return new ConsoleTextProvider('sms');
}
function pickWhatsApp(): TextProvider {
  if (!isTest && env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) return new WhatsAppCloudProvider();
  return new ConsoleTextProvider('whatsapp');
}

export const smsProvider: TextProvider = pickSms();
export const whatsappProvider: TextProvider = pickWhatsApp();

export const messagingStatus = () => ({
  sms: smsProvider.name === 'sms' ? 'console' : smsProvider.name,
  whatsapp: whatsappProvider.name === 'whatsapp' ? 'console' : whatsappProvider.name,
});

export const sendSms = (m: TextMessage) => smsProvider.send(m);
export const sendWhatsApp = (m: TextMessage) => whatsappProvider.send(m);
