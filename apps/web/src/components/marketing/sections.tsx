import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, Check, type LucideIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { TrackedLink } from './tracked-link';
import { cn } from '@/lib/utils';

export function Container({ children, className, narrow = false }: { children: ReactNode; className?: string; narrow?: boolean }) {
  return <div className={cn('mx-auto w-full px-4 sm:px-6', narrow ? 'max-w-[860px]' : 'max-w-[1200px]', className)}>{children}</div>;
}

export function Section({ id, children, className, tone = 'default' }: { id?: string; children: ReactNode; className?: string; tone?: 'default' | 'muted' | 'dark' }) {
  return (
    <section id={id} className={cn('py-14 sm:py-20', tone === 'muted' && 'border-y border-border bg-surface-muted', tone === 'dark' && 'bg-slate-900 text-white', className)}>
      {children}
    </section>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('text-[12px] font-semibold uppercase tracking-wider text-primary-700', className)}>{children}</div>;
}

export function Heading({ eyebrow, title, lead, align = 'center', as: As = 'h2', className }: { eyebrow?: string; title: ReactNode; lead?: ReactNode; align?: 'center' | 'left'; as?: 'h1' | 'h2' | 'h3'; className?: string }) {
  return (
    <div className={cn(align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl', className)}>
      {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
      <As className={cn('font-semibold tracking-tight text-fg', As === 'h1' ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-3xl')}>{title}</As>
      {lead ? <p className="mt-3 text-[15px] leading-relaxed text-fg-muted sm:text-base">{lead}</p> : null}
    </div>
  );
}

export interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  href?: string;
}

export function FeatureGrid({ items, columns = 4 }: { items: Feature[]; columns?: 2 | 3 | 4 }) {
  return (
    <div className={cn('mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2', columns === 3 && 'lg:grid-cols-3', columns === 4 && 'lg:grid-cols-4')}>
      {items.map((f) => {
        const inner = (
          <>
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-50 text-primary-700">
              <f.icon className="h-4.5 w-4.5" aria-hidden />
            </span>
            <h3 className="mt-4 text-[15px] font-semibold text-fg">{f.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{f.body}</p>
            {f.href ? <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-primary-700">Learn more <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span> : null}
          </>
        );
        const cls = 'flex flex-col rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-card)]';
        return f.href ? (
          <Link key={f.title} href={f.href} className={cn(cls, 'transition-colors hover:border-primary-300')}>
            {inner}
          </Link>
        ) : (
          <div key={f.title} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/** Product screenshot inside a subtle window frame. Real captures live in /public/screenshots. */
export function Screenshot({ src, alt, width = 1440, height = 900, priority = false, className, sizes = '(min-width: 1200px) 1100px, 100vw' }: { src: string; alt: string; width?: number; height?: number; priority?: boolean; className?: string; sizes?: string }) {
  return (
    <figure className={cn('overflow-hidden rounded-[12px] border border-border bg-surface shadow-[var(--shadow-popover)]', className)}>
      <div className="flex h-8 items-center gap-1.5 border-b border-border bg-surface-muted px-3" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
      </div>
      <Image src={src} alt={alt} width={width} height={height} sizes={sizes} priority={priority} className="h-auto w-full" />
    </figure>
  );
}

/** Text on one side, screenshot on the other; alternates with `flip`. */
export function SplitFeature({ eyebrow, title, body, bullets, image, imageAlt, flip = false, cta, id }: { eyebrow?: string; title: string; body: ReactNode; bullets?: string[]; image: string; imageAlt: string; flip?: boolean; cta?: { label: string; href: string }; id?: string }) {
  return (
    <div id={id} className="grid scroll-mt-24 items-center gap-8 lg:grid-cols-2 lg:gap-14">
      <div className={cn(flip && 'lg:order-2')}>
        {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
        <h3 className="text-2xl font-semibold tracking-tight text-fg">{title}</h3>
        <div className="mt-3 text-[15px] leading-relaxed text-fg-muted">{body}</div>
        {bullets?.length ? <CheckList items={bullets} className="mt-5" /> : null}
        {cta ? (
          <Link href={cta.href} className="mt-5 inline-flex items-center gap-1 text-[14px] font-medium text-primary-700 hover:underline">
            {cta.label} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      <Screenshot src={image} alt={imageAlt} className={cn(flip && 'lg:order-1')} sizes="(min-width: 1024px) 560px, 100vw" />
    </div>
  );
}

export function CheckList({ items, className, columns = 1 }: { items: string[]; className?: string; columns?: 1 | 2 }) {
  return (
    <ul className={cn('grid gap-2.5 text-[14px] text-fg-muted', columns === 2 && 'sm:grid-cols-2', className)}>
      {items.map((s) => (
        <li key={s} className="flex items-start gap-2.5">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden /> <span>{s}</span>
        </li>
      ))}
    </ul>
  );
}

export function Steps({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((s, i) => (
        <li key={s.title} className="relative rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-[13px] font-semibold text-white" aria-hidden>{i + 1}</span>
          <h3 className="mt-4 text-[15px] font-semibold text-fg">{s.title}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** Accessible, zero-JS FAQ list using native disclosure elements. */
export function FaqList({ items, className }: { items: { q: string; a: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface', className)}>
      {items.map((f) => (
        <details key={f.q} className="group px-5 py-4 open:bg-surface-muted/40">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-fg [&::-webkit-details-marker]:hidden">
            <h3 className="text-[15px] font-medium">{f.q}</h3>
            <span className="text-fg-subtle transition-transform group-open:rotate-45" aria-hidden>+</span>
          </summary>
          <div className="mt-2 text-[14px] leading-relaxed text-fg-muted">{f.a}</div>
        </details>
      ))}
    </div>
  );
}

/** Closing call to action. Uses the real signup and demo flows. */
export function CtaBand({ title = 'See PharmaOS running on your own products', body = 'Create your organization in a couple of minutes, or ask us for a walkthrough. No card needed for the 14-day trial.', source = 'cta_band' }: { title?: string; body?: string; source?: string }) {
  return (
    <Section tone="dark">
      <Container className="text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-slate-300">{body}</p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <TrackedLink href="/register" eventProps={{ cta: `${source}_get_started` }} className={cn(buttonVariants({ size: 'lg' }), 'w-full px-6 sm:w-auto')}>
            Get started free <ArrowRight className="h-4 w-4" aria-hidden />
          </TrackedLink>
          <TrackedLink href="/demo" eventProps={{ cta: `${source}_demo` }} className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full px-6 sm:w-auto')}>
            Book a demo
          </TrackedLink>
        </div>
      </Container>
    </Section>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[12px] text-fg-subtle">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={it.label} className="flex items-center gap-1.5">
            {it.href ? <Link href={it.href} className="hover:text-fg hover:underline">{it.label}</Link> : <span aria-current="page" className="text-fg-muted">{it.label}</span>}
            {i < items.length - 1 ? <span aria-hidden>/</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
