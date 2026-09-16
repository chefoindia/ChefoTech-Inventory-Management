'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, ChevronDown } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { Byline } from './brand';
import { TrackedLink } from './tracked-link';
import { NAV } from '@/lib/site';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Public website header: desktop nav with a Solutions menu, full-screen menu on small screens. */
export function MarketingHeader() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [solutionsOpen, setSolutionsOpen] = React.useState(false);
  const solutionsRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setOpen(false);
    setSolutionsOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!solutionsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!solutionsRef.current?.contains(e.target as Node)) setSolutionsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSolutionsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [solutionsOpen]);

  React.useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex flex-col leading-none">
          <Logo />
          <Byline className="ml-9 -mt-0.5 hidden sm:inline-flex" />
        </Link>

        <nav className="hidden items-center gap-1 text-sm lg:flex" aria-label="Main">
          {NAV.map((item) =>
            'children' in item ? (
              <div key={item.label} ref={solutionsRef} className="relative">
                <button
                  type="button"
                  className={cn('inline-flex h-9 items-center gap-1 rounded-[var(--radius-control)] px-3 text-fg-muted hover:bg-surface-subtle hover:text-fg', solutionsOpen && 'bg-surface-subtle text-fg')}
                  aria-expanded={solutionsOpen}
                  aria-haspopup="true"
                  onClick={() => setSolutionsOpen((v) => !v)}
                >
                  {item.label} <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', solutionsOpen && 'rotate-180')} />
                </button>
                {solutionsOpen ? (
                  <div className="absolute left-0 top-full mt-2 w-[380px] rounded-[var(--radius-card)] border border-border bg-surface p-2 shadow-[var(--shadow-popover)]" role="menu">
                    {item.children.map((c) => (
                      <Link key={c.href} href={c.href} role="menuitem" className="block rounded-[var(--radius-control)] px-3 py-2 hover:bg-surface-subtle">
                        <div className="text-[13px] font-medium text-fg">{c.label}</div>
                        <div className="text-[12px] text-fg-subtle">{c.blurb}</div>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <Link key={item.href} href={item.href} className={cn('inline-flex h-9 items-center rounded-[var(--radius-control)] px-3 text-fg-muted hover:bg-surface-subtle hover:text-fg', isActive(item.href) && 'text-fg')} aria-current={isActive(item.href) ? 'page' : undefined}>
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/login" className={buttonVariants({ variant: 'ghost' })}>
            Sign in
          </Link>
          <TrackedLink href="/register" eventProps={{ cta: 'header_get_started' }} className={buttonVariants({ variant: 'primary' })}>
            Get started
          </TrackedLink>
        </div>

        <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] text-fg lg:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((v) => !v)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t border-border bg-surface lg:hidden">
          <nav className="mx-auto max-w-[1200px] px-4 py-4" aria-label="Mobile">
            {NAV.map((item) =>
              'children' in item ? (
                <div key={item.label} className="py-2">
                  <div className="px-2 text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">{item.label}</div>
                  <div className="mt-1">
                    {item.children.map((c) => (
                      <Link key={c.href} href={c.href} className="block rounded-[var(--radius-control)] px-2 py-2.5 text-[15px] text-fg hover:bg-surface-subtle">
                        {c.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link key={item.href} href={item.href} className="block rounded-[var(--radius-control)] px-2 py-3 text-[15px] font-medium text-fg hover:bg-surface-subtle">
                  {item.label}
                </Link>
              ),
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
              <Link href="/login" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full')}>
                Sign in
              </Link>
              <TrackedLink href="/register" eventProps={{ cta: 'mobile_menu_get_started' }} className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full')}>
                Get started
              </TrackedLink>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
