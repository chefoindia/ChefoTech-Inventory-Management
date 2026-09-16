import type { Metadata } from 'next';
import { og } from '@/lib/site';
import Link from 'next/link';
import { ArrowRight, MessageSquareText, FileScan, Boxes, BarChart3, HelpCircle, ListChecks, ShieldCheck, KeyRound, Languages } from 'lucide-react';
import { Container, Section, Heading, FeatureGrid, CheckList, Screenshot, FaqList, CtaBand, Breadcrumbs, Steps } from '@/components/marketing/sections';
import { AssistantMock } from '@/components/marketing/assistant-mock';
import { TrackedLink } from '@/components/marketing/tracked-link';
import { LandingView } from '@/components/marketing/landing-view';
import { JsonLd, breadcrumbJsonLd } from '@/components/marketing/json-ld';
import { FAQ } from '@/content/faq';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'AI Pharmacy Assistant · Gemini-powered help',
  description: 'Optional AI assistant for pharmacies: reads supplier invoices and prescriptions, answers stock and sales questions, runs reports and prepares drafts you confirm.',
  alternates: { canonical: '/ai-pharmacy-assistant' },
  ...og('AI pharmacy assistant in PharmaOS', 'Less typing, clearer answers, every action confirmed by you.', '/ai-pharmacy-assistant'),
};

const HELPS = [
  { icon: FileScan, title: 'Reduce manual data entry', body: 'Upload a supplier invoice photo or PDF; the assistant reads products, batches, expiry, rates and MRP into a purchase draft with a confidence flag per line.' },
  { icon: Boxes, title: 'Inventory assistance', body: 'Low stock, expiring batches, slow movers and a reorder list based on recent sales, in plain language.' },
  { icon: MessageSquareText, title: 'Natural-language search', body: '"Montek ka stock?", "Sharma ji ka balance?", "kal ki sale?" all get answers from your real data.' },
  { icon: BarChart3, title: 'Report assistance', body: 'Ask for a report in everyday words; the assistant runs the real report and explains what stands out.' },
  { icon: HelpCircle, title: 'Contextual help', body: 'Every page has "What is this?" and any field can be explained, in English, Hindi or Hinglish.' },
  { icon: ListChecks, title: 'Workflow assistance', body: 'Prepare a sale, purchase, prescription or payment from a sentence. It opens in the normal form for you to check and save.' },
];

export default function AiPage() {
  const faq = FAQ.filter((f) => f.topics.includes('ai') || f.q === 'Is my data separate from other pharmacies?');
  return (
    <>
      <LandingView event="feature_page_interaction" />
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'AI assistant', path: '/ai-pharmacy-assistant' }])} />
      <section className="border-b border-border">
        <Container className="pb-12 pt-10 sm:pt-16">
          <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'AI assistant' }]} />
          <div className="mt-6 grid items-center gap-10 lg:grid-cols-2">
            <div>
              <Heading align="left" as="h1" eyebrow="AI-powered pharmacy assistance" title="An assistant that works from your pharmacy's real data" lead="Ask questions, read documents, run reports and prepare everyday work with less typing. The assistant sees only what you are allowed to see, and nothing that moves money or stock happens without your click." />
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <TrackedLink href="/register" eventProps={{ cta: 'ai_get_started' }} className={cn(buttonVariants({ size: 'lg' }), 'px-6')}>
                  Get started free <ArrowRight className="h-4 w-4" aria-hidden />
                </TrackedLink>
                <TrackedLink href="/demo" eventProps={{ cta: 'ai_demo' }} className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'px-6')}>
                  See it in a demo
                </TrackedLink>
              </div>
            </div>
            <AssistantMock />
          </div>
        </Container>
      </section>

      <Section tone="muted">
        <Container>
          <Heading title="How the assistant helps every day" />
          <FeatureGrid items={HELPS} columns={3} />
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <Heading align="left" eyebrow="Invoice reading" title="A photo of the supplier's bill becomes a draft you check" lead="Products are matched to your catalogue, with candidates when the name is ambiguous. Batch, expiry, rate, MRP and GST are filled per line with a confidence level, and the purchase is not saved until you submit the form." />
              <CheckList className="mt-5" items={['Works with photos and PDFs', 'Unmatched products get a picker, never a guess', 'Warnings for unreadable expiry or totals that do not add up', 'Prescriptions read the same way into the prescription form']} />
            </div>
            <Screenshot src="/screenshots/purchase.png" alt="PharmaOS purchase form with the Read invoice with AI action next to the uploaded invoice" sizes="(min-width: 1024px) 560px, 100vw" />
          </div>
        </Container>
      </Section>

      <Section tone="muted">
        <Container>
          <Heading eyebrow="Trust" title="Built so the assistant cannot overstep" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: ShieldCheck, title: 'Same permissions as you', body: 'Every tool the assistant can call checks the signed-in user\'s role and active outlet. If you cannot see cost prices, neither can it.' },
              { icon: ListChecks, title: 'Confirmation before actions', body: 'Payments, emails, sales and purchases are proposals. They open in the normal form or a confirmation dialog and go through the same endpoints as manual work.' },
              { icon: KeyRound, title: 'Your key, your control', body: 'Each organization connects its own Google Gemini API key in Settings. It is encrypted at rest, never shown again, and you can remove it any time.' },
              { icon: Languages, title: 'Plain language, no invented numbers', body: 'Answers cite the data they used and say when something is uncertain. English, Hindi and Hinglish are supported.' },
            ].map((t) => (
              <div key={t.title} className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-50 text-primary-700"><t.icon className="h-4.5 w-4.5" aria-hidden /></span>
                <h3 className="mt-4 text-[15px] font-semibold text-fg">{t.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{t.body}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-[13px] text-fg-subtle">
            The AI assistant is optional and depends on your organization&apos;s Gemini setup and Google&apos;s API terms. It supports pharmacists and staff with information and drafts; professional judgement, dispensing decisions and legal compliance remain with your team.
          </p>
        </Container>
      </Section>

      <Section>
        <Container>
          <Heading eyebrow="Setup" title="Enabled in minutes" />
          <Steps items={[
            { title: 'Get a Gemini API key', body: 'Create one in Google AI Studio under your own Google account. Usage is billed by Google to you.' },
            { title: 'Add it in Settings → AI', body: 'PharmaOS tests the key before saving it, encrypts it and shows only the last four characters afterwards.' },
            { title: 'Choose features', body: 'Turn the assistant, invoice reading, smart inventory, reports, help and voice input on or off. Set a monthly token limit.' },
            { title: 'Ask away', body: 'The Ask AI button appears on every page for staff with the AI permission. Every proposed action is logged.' },
          ]} />
          <div className="mt-8 text-center">
            <Screenshot src="/screenshots/ai-settings.png" alt="PharmaOS Settings → AI & Gemini page with key status, feature toggles and model settings" className="mx-auto max-w-[900px]" sizes="(min-width: 1024px) 900px, 100vw" />
          </div>
        </Container>
      </Section>

      <Section tone="muted">
        <Container narrow>
          <Heading title="Questions about the AI assistant" />
          <FaqList className="mt-10" items={faq.map((f) => ({ q: f.q, a: f.a }))} />
          <p className="mt-6 text-center text-[14px] text-fg-muted">
            More on the <Link href="/faq" className="font-medium text-primary-700 hover:underline">FAQ page</Link>.
          </p>
        </Container>
      </Section>
      <CtaBand source="ai" title="Try the assistant on your own stock" body="Start a free trial, add your Gemini key in Settings, and ask your first question. Or book a demo and we will show you." />
    </>
  );
}
