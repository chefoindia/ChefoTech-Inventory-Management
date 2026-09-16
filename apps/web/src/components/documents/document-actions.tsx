'use client';

import * as React from 'react';
import { Printer, Download, Mail, ExternalLink, History, MessageCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { DocumentTemplateType, ShareLinkDto } from '@pharmaos/shared';
import { openDocument, useEmailDocument, useDocumentHistory, useTemplates, useShareLink } from '@/features/documents/api';
import { usePermission } from '@/features/auth/permissions';
import { useSession } from '@/stores/session';
import { errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input, Textarea, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';

/**
 * Print / download / email buttons for a rendered document. Handles template choice when the
 * organization has more than one template for the type (plan permitting).
 */
export function DocumentActions({ type, refId, refType, emailTo, emailPermission = 'sales.email', printPermission = 'sales.print', range, compact, sharePhone, shareLabel }: { type: DocumentTemplateType; refId: string; refType?: string; emailTo?: string; emailPermission?: string; printPermission?: string; range?: { from?: string; to?: string }; compact?: boolean; /** Customer/supplier phone for the WhatsApp deep link. */ sharePhone?: string; shareLabel?: string }) {
  const share = useShareLink();
  const [shareLink, setShareLink] = React.useState<ShareLinkDto | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [emailOpen, setEmailOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const canPrint = usePermission(printPermission);
  const canEmail = usePermission(emailPermission);
  const features = useSession((s) => s.me?.organization.subscription);
  const hasDesigner = usePermission('templates.view');
  const templates = useTemplates(type);
  const choices = hasDesigner && templates.data ? templates.data : [];
  const [templateId, setTemplateId] = React.useState<string | undefined>(undefined);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(null); }
  };
  if (!canPrint && !canEmail) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {choices.length > 1 ? (
        <Select className="h-8 w-44" value={templateId ?? ''} onChange={(e) => setTemplateId(e.target.value || undefined)} aria-label="Template">
          <option value="">Default template</option>
          {choices.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      ) : null}
      {canPrint ? (
        <>
          <Button variant={compact ? 'secondary' : 'primary'} size="sm" loading={busy === 'print'} onClick={() => run('print', () => openDocument(type, refId, { print: true, templateId, ...range }))}>
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
          <Button variant="secondary" size="sm" loading={busy === 'view'} onClick={() => run('view', () => openDocument(type, refId, { templateId, ...range }))}>
            <ExternalLink className="h-3.5 w-3.5" /> View PDF
          </Button>
          <Button variant="secondary" size="sm" loading={busy === 'download'} onClick={() => run('download', () => openDocument(type, refId, { download: true, templateId, ...range }))}>
            <Download className="h-3.5 w-3.5" /> Download
          </Button>
        </>
      ) : null}
      {canEmail && features?.planKey ? (
        <Button variant="secondary" size="sm" onClick={() => setEmailOpen(true)}>
          <Mail className="h-3.5 w-3.5" /> Email
        </Button>
      ) : null}
      {canPrint ? (
        <Button variant="secondary" size="sm" loading={share.isPending} onClick={() => share.mutate({ type, refId, phone: sharePhone, label: shareLabel, from: range?.from, to: range?.to }, { onSuccess: (link) => setShareLink(link), onError: (err) => toast.error(errorMessage(err)) })}>
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </Button>
      ) : null}
      {refType ? (
        <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
          <History className="h-3.5 w-3.5" /> History
        </Button>
      ) : null}
      <Dialog open={!!shareLink} onOpenChange={(o) => !o && setShareLink(null)}>
        <DialogContent title="Share on WhatsApp" description="A secure link to the PDF, valid for 7 days. The customer does not need an account." size="sm">
          {shareLink ? (
            <div className="space-y-3 text-sm">
              <p className="rounded-[var(--radius-control)] border border-border bg-surface-subtle p-2 text-[13px] break-all">{shareLink.message}</p>
              <p className="text-[12px] text-fg-subtle">Expires {formatDateTime(shareLink.expiresAt)}</p>
              <div className="flex flex-wrap gap-2">
                <a href={shareLink.whatsappUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'sm' })}><MessageCircle className="h-3.5 w-3.5" /> Open WhatsApp</a>
                <Button variant="secondary" size="sm" onClick={() => { void navigator.clipboard?.writeText(shareLink.url).then(() => toast.success('Link copied')); }}><Copy className="h-3.5 w-3.5" /> Copy link</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <EmailDialog open={emailOpen} onOpenChange={setEmailOpen} type={type} refId={refId} defaultTo={emailTo} templateId={templateId} />
      {refType ? <HistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} refType={refType} refId={refId} /> : null}
    </div>
  );
}

export function EmailDialog({ open, onOpenChange, type, refId, defaultTo, templateId }: { open: boolean; onOpenChange: (o: boolean) => void; type: DocumentTemplateType; refId: string; defaultTo?: string; templateId?: string }) {
  const email = useEmailDocument();
  const [to, setTo] = React.useState(defaultTo ?? '');
  const [message, setMessage] = React.useState('');
  React.useEffect(() => { if (open) setTo(defaultTo ?? ''); }, [open, defaultTo]);
  return (
    <Dialog open={open} onOpenChange={(o) => !email.isPending && onOpenChange(o)}>
      <DialogContent title="Email document" description="The PDF is attached and sent from your organization's sender address." size="sm">
        <div className="space-y-4">
          <FormField info="The email address this document will be sent to. It is filled in from the customer record when there is one." label="To" htmlFor="email-to" required>
            <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
          </FormField>
          <FormField info="A short line in the body of the email. The document itself is attached as a PDF." label="Message" htmlFor="email-msg" hint="Optional note above the attachment.">
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={email.isPending}>Cancel</Button>
          <Button loading={email.isPending} disabled={!to} onClick={() => email.mutate({ type, refId, to, message: message || undefined, templateId }, { onSuccess: (r) => { toast.success(r.status === 'sent' ? `Sent to ${r.to}` : `Queued for ${r.to}`); onOpenChange(false); setMessage(''); }, onError: (err) => toast.error(errorMessage(err)) })}>
            <Mail className="h-4 w-4" /> Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ open, onOpenChange, refType, refId }: { open: boolean; onOpenChange: (o: boolean) => void; refType: string; refId: string }) {
  const history = useDocumentHistory(refType, open ? refId : null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Document history" description="Every generated PDF and email attempt for this record." size="md">
        {history.isPending ? <p className="text-sm text-fg-subtle">Loading…</p> : !history.data?.length ? <p className="text-sm text-fg-subtle">No documents generated yet.</p> : (
          <ul className="divide-y divide-border">
            {history.data.map((d) => (
              <li key={d.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{d.fileName}</span>
                  <span className="text-[12px] text-fg-subtle">{formatDateTime(d.generatedAt)} · v{d.templateVersion}</span>
                </div>
                <div className="text-[12px] text-fg-subtle">{d.generatedBy?.name ?? 'System'} · {Math.round(d.bytes / 1024)} KB</div>
                {d.emails.length ? (
                  <ul className="mt-1 space-y-0.5">
                    {d.emails.map((e, i) => (
                      <li key={i} className="flex items-center gap-2 text-[12px]">
                        <Badge variant={e.status === 'sent' ? 'success' : 'danger'}>{e.status}</Badge>
                        <span>{e.to}</span>
                        <span className="text-fg-subtle">{formatDateTime(e.sentAt)}</span>
                        {e.error ? <span className="text-danger-600">{e.error}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Small "⋯ documents" menu for list rows. */
export function DocumentMenu({ type, refId, label = 'Documents' }: { type: DocumentTemplateType; refId: string; label?: string }) {
  const run = (opts: Parameters<typeof openDocument>[2]) => openDocument(type, refId, opts).catch((err) => toast.error(errorMessage(err)));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={label}><Printer className="h-3.5 w-3.5" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void run({ print: true })}>Print</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run({})}>View PDF</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run({ download: true })}>Download</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
