import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
import { Byline } from '@/components/marketing/brand';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-surface-muted">
      <header className="flex h-14 items-center px-6">
        <Link href="/" className="flex flex-col leading-none">
          <Logo />
          <Byline className="ml-9 -mt-0.5" />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md text-center">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-primary-700">404</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">We can&apos;t find that page</h1>
          <p className="mt-2 text-[14px] text-fg-muted">The link may be old or mistyped. Try one of these instead.</p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Link href="/" className={cn(buttonVariants({ variant: 'primary' }))}>Go to the homepage</Link>
            <Link href="/features" className={cn(buttonVariants({ variant: 'secondary' }))}>See features</Link>
            <Link href="/dashboard" className={cn(buttonVariants({ variant: 'secondary' }))}>Open the app</Link>
          </div>
          <p className="mt-6 text-[13px] text-fg-subtle">
            Still stuck? <Link href="/contact" className="font-medium text-primary-700 hover:underline">Contact us</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
