import type { CreateLeadInput, LeadDto } from '@pharmaos/shared';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { LeadModel } from '@/models/lead.model';
import { sendEmail } from '@/services/email/email.service';

const TYPE_LABEL: Record<CreateLeadInput['type'], string> = { demo: 'Demo request', contact: 'Contact form', sales: 'Sales enquiry' };

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

/**
 * Stores a website enquiry and notifies the configured inbox. The lead is saved first so a mail
 * failure never loses it; the notification outcome is recorded on the document.
 */
export async function createLead(input: CreateLeadInput, meta: { ip?: string; userAgent?: string }): Promise<LeadDto> {
  const lead = await LeadModel.create({
    type: input.type,
    name: input.name,
    email: input.email,
    phone: input.phone,
    pharmacyName: input.pharmacyName,
    outlets: input.outlets,
    message: input.message,
    source: input.source,
    ip: meta.ip ?? '',
    userAgent: (meta.userAgent ?? '').slice(0, 300),
  });

  if (env.LEADS_NOTIFY_EMAIL) {
    const rows: [string, string][] = [
      ['Type', TYPE_LABEL[input.type]],
      ['Name', input.name],
      ['Email', input.email],
      ['Phone', input.phone || '—'],
      ['Pharmacy', input.pharmacyName || '—'],
      ['Outlets', input.outlets || '—'],
      ['Page', input.source || '—'],
    ];
    const html = `<h2 style="font-family:sans-serif">${escapeHtml(TYPE_LABEL[input.type])} from the PharmaOS website</h2>
<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${k}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`).join('')}</table>
${input.message ? `<p style="font-family:sans-serif;font-size:14px;white-space:pre-wrap;border-left:3px solid #e2e8f0;padding-left:12px">${escapeHtml(input.message)}</p>` : ''}
<p style="font-family:sans-serif;font-size:12px;color:#94a3b8">Reply to this email to answer ${escapeHtml(input.name)} directly.</p>`;
    const text = `${TYPE_LABEL[input.type]} from the PharmaOS website\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}${input.message ? `\n\n${input.message}` : ''}`;
    try {
      await sendEmail({
        to: [{ email: env.LEADS_NOTIFY_EMAIL }],
        replyTo: { email: input.email, name: input.name },
        subject: `[PharmaOS] ${TYPE_LABEL[input.type]}: ${input.name}${input.pharmacyName ? ` · ${input.pharmacyName}` : ''}`,
        html,
        text,
        tags: ['lead', input.type],
      });
      lead.notified = true;
    } catch (err) {
      lead.notifyError = err instanceof Error ? err.message : String(err);
      logger.warn({ err, leadId: lead._id.toString() }, 'lead notification failed');
    }
    await lead.save();
  } else {
    logger.info({ leadId: lead._id.toString(), type: input.type }, 'website lead stored (LEADS_NOTIFY_EMAIL not set, no email sent)');
  }

  return { id: lead._id.toString(), type: lead.type, receivedAt: lead.createdAt.toISOString() };
}
