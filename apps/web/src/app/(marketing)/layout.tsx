import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
import { buttonVariants } from '@/components/ui/button';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6">
          <Link href="/" aria-label="PharmaOS home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-fg-muted md:flex" aria-label="Site">
            <a href="#features" className="hover:text-fg">Features</a>
            <a href="#workflows" className="hover:text-fg">Workflows</a>
            <a href="#security" className="hover:text-fg">Security</a>
            <a href="#pricing" className="hover:text-fg">Pricing</a>
            <a href="#faq" className="hover:text-fg">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className={buttonVariants({ variant: 'ghost' })}>
              Sign in
            </Link>
            <Link href="/register" className={buttonVariants({ variant: 'primary' })}>
              Start free trial
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-surface-muted">
        <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-6 py-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-3 max-w-sm text-[13px] text-fg-subtle">
              Built for modern pharmacies. Designed to scale with your business, from a single counter to a multi-outlet chain.
            </p>
          </div>
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">Product</div>
            <ul className="mt-3 space-y-2 text-[13px] text-fg-muted">
              <li><a href="#features" className="hover:text-fg">Features</a></li>
              <li><a href="#workflows" className="hover:text-fg">Pharmacy workflows</a></li>
              <li><a href="#pricing" className="hover:text-fg">Pricing</a></li>
            </ul>
          </div>
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">Account</div>
            <ul className="mt-3 space-y-2 text-[13px] text-fg-muted">
              <li><Link href="/login" className="hover:text-fg">Sign in</Link></li>
              <li><Link href="/register" className="hover:text-fg">Create organization</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border py-4 text-center text-[12px] text-fg-subtle">© {new Date().getFullYear()} PharmaOS. All rights reserved.</div>
      </footer>
    </div>
  );
}
