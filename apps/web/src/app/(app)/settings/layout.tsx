'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { usePermission } from '@/features/auth/permissions';

const SECTIONS: { label: string; href: string; permission?: string | string[] }[] = [
  { label: 'Organization', href: '/settings/organization', permission: ['organization.view', 'settings.view'] },
  { label: 'Outlets', href: '/settings/outlets', permission: 'outlets.view' },
  { label: 'Users', href: '/settings/users', permission: 'users.view' },
  { label: 'Roles & permissions', href: '/settings/roles', permission: ['roles.view', 'users.view'] },
  { label: 'Audit log', href: '/settings/audit', permission: 'audit.view' },
  { label: 'Security', href: '/settings/security' },
];

function SettingsLink({ label, href, permission }: (typeof SECTIONS)[number]) {
  const pathname = usePathname();
  const allowed = usePermission(permission ?? [], 'any') || !permission;
  if (!allowed) return null;
  const active = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'block rounded-[var(--radius-control)] px-3 py-2 text-sm',
        active ? 'bg-primary-50 font-medium text-primary-800' : 'text-fg-muted hover:bg-surface-subtle hover:text-fg',
      )}
    >
      {label}
    </Link>
  );
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
      <nav aria-label="Settings" className="lg:sticky lg:top-20 lg:self-start">
        <div className="mb-2 px-3 text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">Settings</div>
        <div className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {SECTIONS.map((s) => (
            <SettingsLink key={s.href} {...s} />
          ))}
        </div>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
