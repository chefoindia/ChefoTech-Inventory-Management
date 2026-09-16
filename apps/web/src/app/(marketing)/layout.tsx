import { MarketingHeader } from '@/components/marketing/header';
import { MarketingFooter } from '@/components/marketing/footer';
import { JsonLd, organizationJsonLd } from '@/components/marketing/json-ld';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-primary-600 focus:px-3 focus:py-1.5 focus:text-sm focus:text-white">
        Skip to content
      </a>
      <MarketingHeader />
      <main id="content" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
      <JsonLd data={organizationJsonLd()} />
    </div>
  );
}
