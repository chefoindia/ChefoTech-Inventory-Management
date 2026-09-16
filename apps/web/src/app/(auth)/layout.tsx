import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
import { Byline } from '@/components/marketing/brand';

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-muted">
      <header className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex flex-col leading-none">
          <Logo />
          <Byline className="ml-9 -mt-0.5" />
        </Link>
        <nav className="flex items-center gap-4 text-[13px] text-fg-muted" aria-label="Site">
          <Link href="/features" className="hover:text-fg hover:underline">Features</Link>
          <Link href="/pricing" className="hover:text-fg hover:underline">Pricing</Link>
          <Link href="/contact" className="hover:text-fg hover:underline">Contact</Link>
        </nav>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-10 pt-4 sm:pt-10">
        <div className="w-full max-w-[440px]">{children}</div>
      </main>
      <footer className="px-4 py-5 text-center text-[12px] text-fg-subtle">
        © {new Date().getFullYear()} ChefoTech · <Link href="/privacy" className="hover:text-fg hover:underline">Privacy</Link> · <Link href="/terms" className="hover:text-fg hover:underline">Terms</Link>
      </footer>
    </div>
  );
}
