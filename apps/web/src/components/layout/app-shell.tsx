'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Boxes,
  Users,
  Building2,
  FileText,
  BarChart3,
  Bell,
  Settings,
  ChevronsUpDown,
  Store,
  LogOut,
  Menu,
  X,
  Check,
  Pill,
} from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { useSession } from '@/stores/session';
import { useLogout, useSwitchOrganization } from '@/features/auth/api';
import { usePermission } from '@/features/auth/permissions';
import { useUnreadCount } from '@/features/notifications/api';
import { Logo } from './logo';
import { ConnectionBanner } from './connection-status';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string | string[];
  badge?: 'unread';
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Sales & POS', href: '/sales', icon: ShoppingCart, permission: 'sales.view' },
  { label: 'Purchases', href: '/purchases', icon: Truck, permission: 'purchases.view' },
  { label: 'Products', href: '/products', icon: Pill, permission: 'products.view' },
  { label: 'Inventory', href: '/inventory', icon: Boxes, permission: 'inventory.view' },
  { label: 'Customers', href: '/customers', icon: Users, permission: 'customers.view' },
  { label: 'Suppliers', href: '/suppliers', icon: Building2, permission: 'suppliers.view' },
  { label: 'Prescriptions', href: '/prescriptions', icon: FileText, permission: 'prescriptions.view' },
  { label: 'Reports', href: '/reports', icon: BarChart3, permission: 'reports.view' },
  { label: 'Notifications', href: '/notifications', icon: Bell, permission: 'notifications.view', badge: 'unread' },
  { label: 'Settings', href: '/settings', icon: Settings, permission: ['settings.view', 'organization.view', 'users.view', 'outlets.view', 'templates.view', 'notifications.manage'] },
];

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const allowed = usePermission(item.permission ?? [], 'any') || !item.permission;
  const active = pathname === item.href || pathname.startsWith(item.href + '/');
  const Icon = item.icon;

  if (!allowed) return null;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm font-medium transition-colors',
        active ? 'bg-primary-50 text-primary-800' : 'text-fg-muted hover:bg-surface-subtle hover:text-fg',
      )}
    >
      <Icon className={cn('h-4 w-4', active ? 'text-primary-700' : 'text-fg-subtle')} />
      <span className="flex-1">{item.label}</span>
      {item.badge === 'unread' ? <UnreadBadge /> : null}
    </Link>
  );
}

function UnreadBadge() {
  const unread = useUnreadCount();
  const n = unread.data?.unread ?? 0;
  if (!n) return null;
  return <span className="rounded-full bg-primary-600 px-1.5 text-[11px] font-semibold leading-4 text-white" aria-label={`${n} unread`}>{n > 99 ? '99+' : n}</span>;
}

function OutletSwitcher() {
  const me = useSession((s) => s.me);
  const activeOutletId = useSession((s) => s.activeOutletId);
  const setActiveOutlet = useSession((s) => s.setActiveOutlet);
  if (!me) return null;
  const active = me.outlets.find((o) => o.id === activeOutletId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 max-w-[260px] items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-sm shadow-sm hover:bg-surface-subtle"
          aria-label="Switch outlet"
        >
          <Store className="h-4 w-4 text-fg-subtle" />
          <span className="truncate font-medium">{active ? active.name : 'Select outlet'}</span>
          {active ? <span className="hidden text-[12px] text-fg-subtle sm:inline">{active.code}</span> : null}
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 text-fg-faint" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[260px]">
        <DropdownMenuLabel>Outlets</DropdownMenuLabel>
        {me.outlets.length === 0 ? <div className="px-2 py-1.5 text-[13px] text-fg-subtle">No outlets assigned to you.</div> : null}
        {me.outlets.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => setActiveOutlet(o.id)}>
            <span className="flex-1 truncate">{o.name}</span>
            <span className="text-[12px] text-fg-subtle">{o.code}</span>
            {o.id === activeOutletId ? <Check className="h-4 w-4 text-primary-700" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const me = useSession((s) => s.me);
  const router = useRouter();
  const logout = useLogout();
  const switchOrg = useSwitchOrganization();
  if (!me) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-9 items-center gap-2 rounded-[var(--radius-control)] px-2 hover:bg-surface-subtle" aria-label="Account menu">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-[12px] font-semibold text-primary-800">
            {initials(me.user.name)}
          </span>
          <span className="hidden text-left md:block">
            <span className="block max-w-[140px] truncate text-[13px] font-medium leading-tight">{me.user.name}</span>
            <span className="block text-[11px] leading-tight text-fg-subtle">{me.membership.role.name}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[240px]">
        <DropdownMenuLabel>
          <span className="block truncate text-fg">{me.user.email}</span>
        </DropdownMenuLabel>
        {me.organizations.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            {me.organizations.map((o) => (
              <DropdownMenuItem key={o.id} disabled={o.id === me.organization.id || switchOrg.isPending} onSelect={() => switchOrg.mutate(o.id)}>
                <span className="flex-1 truncate">{o.name}</span>
                {o.id === me.organization.id ? <Check className="h-4 w-4 text-primary-700" /> : null}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/settings/security')}>Security & sessions</DropdownMenuItem>
        <DropdownMenuItem
          destructive
          onSelect={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const me = useSession((s) => s.me);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <Link href="/dashboard" aria-label="PharmaOS home">
          <Logo />
        </Link>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto scroll-thin p-3" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={() => setMobileOpen(false)} />
        ))}
      </nav>
      <div className="border-t border-border p-3 text-[12px] text-fg-subtle">
        <div className="truncate font-medium text-fg">{me?.organization.name}</div>
        <div className="truncate">Plan: {me?.organization.subscription.planKey} · {me?.organization.subscription.status}</div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-[232px] shrink-0 border-r border-border bg-surface lg:block">{sidebar}</aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[260px] bg-surface shadow-xl">{sidebar}</aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-primary-600 focus:px-3 focus:py-1.5 focus:text-sm focus:text-white">Skip to content</a>
        <ConnectionBanner />
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
          <OutletSwitcher />
          <div className="ml-auto flex items-center gap-2">
            <UserMenu />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-5 outline-none sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1280px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
