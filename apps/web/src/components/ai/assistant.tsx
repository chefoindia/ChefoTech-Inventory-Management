'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sparkles, X, Send, Mic, MicOff, Loader2, Paperclip, Trash2, ExternalLink, CheckCircle2 } from 'lucide-react';
import type { AiAction, AttachmentRef } from '@pharmaos/shared';
import { useAssistant, type AssistantMessage } from '@/stores/assistant';
import { useSession } from '@/stores/session';
import { useAiAvailable, useAiChat } from '@/features/ai/api';
import { useRecordPayment } from '@/features/parties/api';
import { useEmailDocument, openDocument } from '@/features/documents/api';
import { uploadFile } from '@/components/ui/file-upload';
import { errorMessage } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/uuid';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { PAYMENT_METHOD_LABELS } from '@/components/ui/payment-lines';
import type { CartLine, CartProduct } from '@/features/sales/pos-state';

const uid = () => Math.random().toString(36).slice(2, 10);

const QUICK: { label: string; q: string; page?: string }[] = [
  { label: "Today's summary", q: "Give me today's pharmacy summary." },
  { label: 'Low stock', q: 'Which medicines should I reorder?' },
  { label: 'Expiring soon', q: 'Show medicines expiring within 30 days.' },
  { label: 'Pending Baki', q: 'Which customers have pending payments?' },
  { label: 'Supplier dues', q: 'Which supplier payments are due?' },
  { label: 'What do I do here?', q: 'What do I do on this screen?' },
];

/** Floating AI button + slide-over. Mounted once in the app shell; pages talk to it through the store. */
export function AiAssistant() {
  const { available, settings } = useAiAvailable('assistant');
  const open = useAssistant((s) => s.open);
  const setOpen = useAssistant((s) => s.setOpen);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); setOpen(!useAssistant.getState().open); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
  if (!available) return null;
  return (
    <>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} aria-label="Open AI assistant (Ctrl+/)" className="fixed bottom-5 right-5 z-40 flex h-12 items-center gap-2 rounded-full bg-primary-600 px-4 text-sm font-medium text-white shadow-lg hover:bg-primary-700">
          <Sparkles className="h-4 w-4" /> Ask AI
        </button>
      ) : null}
      {open ? <AssistantPanel voice={settings?.features.includes('voiceInput') ?? false} /> : null}
    </>
  );
}

function AssistantPanel({ voice }: { voice: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const me = useSession((s) => s.me)!;
  const outletId = useSession((s) => s.activeOutletId);
  const store = useAssistant();
  const chat = useAiChat();
  const [attachment, setAttachment] = React.useState<AttachmentRef | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const [confirm, setConfirm] = React.useState<AiAction | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const send = React.useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || chat.isPending) return;
    const history = useAssistant.getState().messages.filter((m) => !m.pending && !m.error).slice(-9).map((m) => ({ role: m.role, content: m.content }));
    const userMsg: AssistantMessage = { id: uid(), role: 'user', content };
    const pendingId = uid();
    store.push(userMsg);
    store.push({ id: pendingId, role: 'assistant', content: '', pending: true });
    store.setDraft('');
    const title = typeof document !== 'undefined' ? document.title.replace(/\s*[·|-]\s*PharmaOS.*$/, '') : undefined;
    try {
      const res = await chat.mutateAsync({ messages: [...history, { role: 'user', content }], context: { page: pathname, title, entityType: store.entity?.type, entityId: store.entity?.id, field: store.field ?? undefined, facts: Object.keys(store.facts).length ? store.facts : undefined }, attachments: attachment ? [attachment] : [] });
      store.update(pendingId, { content: res.reply, actions: res.actions, toolsUsed: res.toolsUsed, pending: false });
      setAttachment(null);
    } catch (err) {
      store.update(pendingId, { content: errorMessage(err), pending: false, error: true });
    }
  }, [chat, pathname, store, attachment]);

  // "Ask AI" buttons drop a question into the store; send it when asked to.
  React.useEffect(() => {
    if (store.autoSend && store.draft) { const q = store.draft; store.setDraft(''); void send(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.autoSend, store.draft]);
  React.useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [store.messages.length, chat.isPending]);
  React.useEffect(() => { inputRef.current?.focus(); }, []);

  const runAction = (a: AiAction) => {
    switch (a.type) {
      case 'navigate': router.push(a.href); return;
      case 'openReport': router.push(`/reports/${a.reportKey}`); return;
      case 'openDocument': void openDocument(a.documentType as 'saleInvoice', a.refId, { print: true }).catch((e) => toast.error(errorMessage(e))); return;
      case 'openSaleDraft': {
        const d = a.draft as { customerId: string | null; lines: { productId: string; unitId: string; qty: number; product: Omit<CartProduct, 'mrpMinor' | 'sellingPriceMinor'> & { pricing: { mrpMinor: number; sellingPriceMinor: number } } }[] };
        const lines: CartLine[] = d.lines.map((l) => { const { pricing, ...rest } = l.product; return { key: uid(), product: { ...rest, mrpMinor: pricing.mrpMinor, sellingPriceMinor: pricing.sellingPriceMinor }, unitId: l.unitId, qty: l.qty, discountBps: 0, discountMinor: 0, note: '' }; });
        try { localStorage.setItem(`pharmaos.posDraft.${me.user.id}.${outletId ?? 'none'}`, JSON.stringify({ lines, header: { customerId: d.customerId }, savedAt: new Date().toISOString() })); } catch { /* ignore */ }
        store.setOpen(false);
        router.push('/sales/pos');
        return;
      }
      case 'openPurchaseDraft': {
        try { localStorage.setItem(`pharmaos.purchaseDraft.${me.user.id}`, JSON.stringify(a.draft)); } catch { /* ignore */ }
        store.setOpen(false);
        router.push('/purchases/new');
        return;
      }
      case 'openPrescriptionDraft': {
        try { localStorage.setItem(`pharmaos.prescriptionDraft.${me.user.id}`, JSON.stringify(a.draft)); } catch { /* ignore */ }
        store.setOpen(false);
        router.push('/prescriptions?new=1');
        return;
      }
      case 'confirmPayment':
      case 'confirmEmail':
        setConfirm(a);
        return;
    }
  };

  const pickFile = async (f: File | null) => {
    if (!f) return;
    setUploading(true);
    try { setAttachment(await uploadFile(f, 'purchaseInvoice')); toast.success('Attached. Ask what you want done with it.'); } catch (e) { toast.error(errorMessage(e)); } finally { setUploading(false); }
  };

  return (
    <div role="dialog" aria-label="AI assistant" className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-border bg-surface shadow-xl">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Sparkles className="h-4 w-4 text-primary-600" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">AI assistant</div>
          <div className="truncate text-[11px] text-fg-subtle">Answers from your data. Money and stock change only after you confirm.</div>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Clear conversation" onClick={store.clear}><Trash2 className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Close assistant" onClick={() => store.setOpen(false)}><X className="h-4 w-4" /></Button>
      </div>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto scroll-thin p-4">
        {store.messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">How can I help? Ask in English, Hindi or Hinglish. For example: <em>“Rahul ka baki kitna hai?”</em></p>
            <div className="flex flex-wrap gap-1.5">{QUICK.map((q) => <button key={q.label} type="button" onClick={() => void send(q.q)} className="rounded-full border border-border bg-surface px-3 py-1 text-[12px] hover:bg-surface-subtle">{q.label}</button>)}</div>
          </div>
        ) : null}
        {store.messages.map((m) => (
          <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[88%] rounded-[var(--radius-card)] px-3 py-2 text-sm', m.role === 'user' ? 'bg-primary-600 text-white' : m.error ? 'border border-danger-600/30 bg-danger-50 text-danger-700' : 'border border-border bg-surface-subtle text-fg')}>
              {m.pending ? <span className="flex items-center gap-2 text-fg-subtle"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking your data…</span> : <div className="whitespace-pre-wrap break-words">{m.content}</div>}
              {m.toolsUsed?.length ? <div className="mt-1 text-[11px] text-fg-subtle">Checked: {m.toolsUsed.map((t) => t.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ')}</div> : null}
              {m.actions?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.actions.map((a, i) => <button key={i} type="button" onClick={() => runAction(a)} className={cn(buttonVariants({ variant: a.type.startsWith('confirm') || a.type.startsWith('open') ? 'primary' : 'secondary', size: 'sm' }), 'h-7 text-[12px]')}>{a.type === 'navigate' ? <ExternalLink className="h-3 w-3" /> : a.type.startsWith('confirm') ? <CheckCircle2 className="h-3 w-3" /> : null}{a.label}</button>)}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border p-3">
        {attachment ? <div className="mb-2 flex items-center gap-2 text-[12px] text-fg-subtle"><Paperclip className="h-3.5 w-3.5" /> {attachment.originalName ?? 'file'} <button type="button" className="text-danger-600 hover:underline" onClick={() => setAttachment(null)}>remove</button></div> : null}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0] ?? null)} />
          <Button variant="ghost" size="icon-sm" aria-label="Attach invoice or prescription" loading={uploading} onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4" /></Button>
          {voice ? <VoiceButton onText={(t) => store.setDraft(`${store.draft ? `${store.draft} ` : ''}${t}`)} /> : null}
          <textarea ref={inputRef} value={store.draft} onChange={(e) => store.setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(store.draft); } }} rows={1} placeholder="Ask anything… (Enter to send)" aria-label="Message the assistant" className="max-h-32 min-h-[36px] flex-1 resize-none rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm focus:border-primary-500" />
          <Button size="icon-sm" aria-label="Send" loading={chat.isPending} disabled={!store.draft.trim()} onClick={() => void send(store.draft)}><Send className="h-4 w-4" /></Button>
        </div>
        <div className="mt-1 text-[11px] text-fg-faint">Ctrl+/ opens or closes the assistant.</div>
      </div>
      <ConfirmActionDialog action={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function VoiceButton({ onText }: { onText: (t: string) => void }) {
  const [listening, setListening] = React.useState(false);
  const recRef = React.useRef<{ start: () => void; stop: () => void } | null>(null);
  const supported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  if (!supported) return null;
  const toggle = () => {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const Ctor = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language.startsWith('hi') ? 'hi-IN' : 'en-IN';
    rec.interimResults = false;
    rec.onresult = (e) => { const t = Array.from(e.results).map((r) => r[0]?.transcript ?? '').join(' '); if (t) onText(t); };
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); toast.error('Could not hear you. Check the microphone permission.'); };
    recRef.current = rec;
    rec.start();
    setListening(true);
  };
  return <Button variant={listening ? 'primary' : 'ghost'} size="icon-sm" aria-label={listening ? 'Stop listening' : 'Speak'} onClick={toggle}>{listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</Button>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

/** Money/email actions proposed by the assistant run through the normal hooks only after an explicit confirmation. */
function ConfirmActionDialog({ action, onClose }: { action: AiAction | null; onClose: () => void }) {
  const payCustomer = useRecordPayment('customer');
  const paySupplier = useRecordPayment('supplier');
  const email = useEmailDocument();
  const [key, setKey] = React.useState(newIdempotencyKey);
  React.useEffect(() => { if (action) setKey(newIdempotencyKey()); }, [action]);
  const push = useAssistant((s) => s.push);
  if (!action || (action.type !== 'confirmPayment' && action.type !== 'confirmEmail')) return null;
  const pending = payCustomer.isPending || paySupplier.isPending || email.isPending;
  const run = () => {
    if (action.type === 'confirmPayment') {
      const m = action.partyType === 'customer' ? payCustomer : paySupplier;
      m.mutate({ idempotencyKey: key, input: { partyId: action.partyId, method: action.method as 'cash', amountMinor: action.amountMinor, reference: '', notes: 'Recorded via AI assistant', allocations: [] } }, { onSuccess: (p) => { toast.success(`${p.number} recorded`); push({ id: uid(), role: 'assistant', content: `Done. ${p.number}: ${money(p.amountMinor)} ${action.partyType === 'customer' ? 'received from' : 'paid to'} ${action.partyName}.`, actions: [{ type: 'navigate', label: 'Open ledger', href: `/${action.partyType}s/${action.partyId}` }] }); onClose(); }, onError: (e) => toast.error(errorMessage(e)) });
    } else {
      email.mutate({ type: action.documentType as 'saleInvoice', refId: action.refId, to: action.to }, { onSuccess: (r) => { toast.success(r.status === 'sent' ? `Sent to ${r.to}` : `Queued for ${r.to}`); push({ id: uid(), role: 'assistant', content: `Emailed ${action.refNumber} to ${action.to}.` }); onClose(); }, onError: (e) => toast.error(errorMessage(e)) });
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent title={action.type === 'confirmPayment' ? 'Confirm payment' : 'Confirm email'} size="sm">
        <p className="text-sm">
          {action.type === 'confirmPayment'
            ? <>Record <strong>{money(action.amountMinor)}</strong> by {PAYMENT_METHOD_LABELS[action.method as keyof typeof PAYMENT_METHOD_LABELS] ?? action.method} {action.partyType === 'customer' ? 'from' : 'to'} <strong>{action.partyName}</strong>? It is allocated to the oldest open invoices.</>
            : <>Email invoice <strong>{action.refNumber}</strong> as a PDF to <strong>{action.to}</strong>?</>}
        </p>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button loading={pending} onClick={run}>{action.type === 'confirmPayment' ? 'Confirm payment' : 'Send email'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Small "Ask AI" affordance for page headers, field hints and empty states. */
export function AskAi({ question, label = 'Ask AI', field, className }: { question: string; label?: string; field?: string; className?: string }) {
  const { available } = useAiAvailable('help');
  const ask = useAssistant((s) => s.ask);
  if (!available) return null;
  return (
    <button type="button" onClick={() => ask(question, { autoSend: true, field })} className={cn('inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[12px] font-medium text-primary-800 hover:bg-primary-100', className)}>
      <Sparkles className="h-3 w-3" /> {label}
    </button>
  );
}

/** Dashboard card: suggested questions plus a free-text box. */
export function AiDashboardCard() {
  const { available, settings } = useAiAvailable('assistant');
  const ask = useAssistant((s) => s.ask);
  const me = useSession((s) => s.me);
  const canManage = !!me && (me.membership.isOwner || me.permissions.includes('ai.manage'));
  const [text, setText] = React.useState('');
  if (!available) {
    if (!settings && !canManage) return null;
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-border bg-surface px-5 py-4 text-[13px] text-fg-subtle">
        <span className="font-medium text-fg">AI assistant</span> · AI features are not connected. {canManage ? <>Add your Gemini API key in <Link href="/settings/ai" className="font-medium text-primary-700 underline underline-offset-2">Settings → AI</Link> to enable your AI assistant.</> : 'Ask your administrator to add a Gemini API key in Settings to enable it.'}
      </div>
    );
  }
  return (
    <div className="rounded-[var(--radius-card)] border border-primary-200 bg-gradient-to-br from-primary-50 to-surface px-5 py-4">
      <div className="flex items-center gap-2 text-[15px] font-semibold"><Sparkles className="h-4 w-4 text-primary-600" /> AI assistant <span className="text-[12px] font-normal text-fg-subtle">How can I help?</span></div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[...QUICK.slice(0, 5), { label: 'Create reorder list', q: 'Create a reorder list for medicines below their reorder level.' }, { label: 'Analyze today', q: "Analyze today's business: what went well and what needs attention?" }].map((q) => <button key={q.label} type="button" onClick={() => ask(q.q)} className="rounded-full border border-border bg-surface px-3 py-1 text-[12px] hover:bg-surface-subtle">{q.label}</button>)}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { ask(text.trim()); setText(''); } }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask anything about your pharmacy… (English / Hindi / Hinglish)" aria-label="Ask the AI assistant" className="h-9 flex-1 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-sm focus:border-primary-500" />
        <Button type="submit" size="sm" disabled={!text.trim()}><Send className="h-3.5 w-3.5" /> Ask</Button>
      </form>
    </div>
  );
}
