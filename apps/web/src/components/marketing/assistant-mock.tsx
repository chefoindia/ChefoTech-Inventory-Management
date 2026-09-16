import { Sparkles, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Designed illustration of the in-product AI assistant panel. The conversation mirrors what the
 * real assistant does (tool-backed answers, proposals that need a click) and is not a live widget.
 */
export function AssistantMock({ className }: { className?: string }) {
  return (
    <div className={cn('mx-auto w-full max-w-[420px] overflow-hidden rounded-[12px] border border-border bg-surface shadow-[var(--shadow-popover)]', className)} role="img" aria-label="Illustration of the PharmaOS AI assistant answering a stock question and preparing a purchase draft for review">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-600 text-white"><Sparkles className="h-4 w-4" aria-hidden /></span>
        <div className="text-[13px] font-semibold text-fg">AI assistant</div>
        <div className="ml-auto text-[11px] text-fg-subtle">Inventory · Main outlet</div>
      </div>
      <div className="space-y-3 px-4 py-4 text-[13px]">
        <div className="ml-auto max-w-[85%] rounded-[10px] rounded-br-sm bg-primary-600 px-3 py-2 text-white">Montek LC ka stock kitna hai? Kab tak chalega?</div>
        <div className="max-w-[92%] rounded-[10px] rounded-bl-sm border border-border bg-surface-muted px-3 py-2 text-fg">
          <p><strong>Montek LC Tablet</strong> — 7 strips (70 tablets) across 2 batches. Batch B2301 expires in 18 months.</p>
          <p className="mt-1.5">Average sale is 1.4 strips per day, so this lasts about <strong>5 days</strong>. Reorder level is 10 strips.</p>
          <div className="mt-2 text-[11px] text-fg-subtle">Used: stock, sales history</div>
        </div>
        <div className="ml-auto max-w-[85%] rounded-[10px] rounded-br-sm bg-primary-600 px-3 py-2 text-white">Medico Distributors se 30 strips ka purchase bana do</div>
        <div className="max-w-[92%] rounded-[10px] rounded-bl-sm border border-border bg-surface-muted px-3 py-2 text-fg">
          <p>Purchase draft ready: 30 strips of Montek LC from Medico Distributors at the last rate ₹132.00. Batch and expiry are blank; fill them from the invoice.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-[12px] font-medium text-primary-800">Review in purchase form →</span>
          </div>
          <div className="mt-2 text-[11px] text-fg-subtle">Nothing is saved until you confirm.</div>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
        <div className="h-9 flex-1 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[13px] leading-9 text-fg-subtle">Ask in English, Hindi or Hinglish…</div>
        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] bg-primary-600 text-white"><Send className="h-4 w-4" aria-hidden /></span>
      </div>
    </div>
  );
}
