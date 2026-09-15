import type { OrganizationDto, OutletDto, UserDto, MembershipDto, SessionDto, AuditLogDto } from '@pharmaos/shared';
import type { OrganizationDoc } from '@/models/organization.model';
import type { OutletDoc } from '@/models/outlet.model';
import type { UserDoc } from '@/models/user.model';
import type { MembershipDoc } from '@/models/membership.model';
import type { RoleDoc } from '@/models/role.model';
import type { SessionDoc } from '@/models/session.model';
import type { AuditLogDoc } from '@/models/audit-log.model';

const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : null);

function mapToObject(value: unknown): Record<string, unknown> {
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return (value as Record<string, unknown>) ?? {};
}

export function toOrganizationDto(org: OrganizationDoc): OrganizationDto {
  const settings = (org.settings ?? {}) as unknown as Record<string, unknown>;
  return {
    id: String(org._id),
    name: org.name,
    slug: org.slug,
    legalName: org.legalName ?? '',
    logo: org.logo ?? null,
    email: org.email ?? '',
    phone: org.phone ?? '',
    website: org.website ?? '',
    address: (org.address ?? {}) as OrganizationDto['address'],
    tax: {
      gstin: org.tax?.gstin ?? '',
      pan: org.tax?.pan ?? '',
      stateCode: org.tax?.stateCode ?? '',
      registrationType: org.tax?.registrationType ?? 'regular',
    },
    currency: org.currency ?? 'INR',
    locale: org.locale ?? 'en-IN',
    timezone: org.timezone ?? 'Asia/Kolkata',
    financialYearStartMonth: org.financialYearStartMonth ?? 4,
    settings: { ...settings, numbering: mapToObject(settings.numbering) } as OrganizationDto['settings'],
    subscription: {
      planKey: org.subscription?.planKey ?? 'trial',
      status: org.subscription?.status ?? 'trialing',
      trialEndsAt: iso(org.subscription?.trialEndsAt),
      limits: {
        outlets: org.subscription?.limits?.outlets ?? 3,
        users: org.subscription?.limits?.users ?? 10,
        products: org.subscription?.limits?.products ?? 20_000,
        storageMb: org.subscription?.limits?.storageMb ?? 2048,
      },
    },
    status: org.status ?? 'active',
    createdAt: iso(org.createdAt) ?? new Date().toISOString(),
  };
}

export function toOutletDto(outlet: OutletDoc): OutletDto {
  return {
    id: String(outlet._id),
    name: outlet.name,
    code: outlet.code,
    type: outlet.type ?? 'retail',
    stateCode: outlet.stateCode,
    gstin: outlet.gstin ?? '',
    drugLicenseNo: outlet.drugLicenseNo ?? '',
    drugLicenseExpiry: iso(outlet.drugLicenseExpiry),
    phone: outlet.phone ?? '',
    email: outlet.email ?? '',
    address: (outlet.address ?? {}) as OutletDto['address'],
    settings: {
      invoiceFooterNote: outlet.settings?.invoiceFooterNote ?? '',
      defaultPrinter: outlet.settings?.defaultPrinter ?? 'a4',
      autoPrintOnSale: outlet.settings?.autoPrintOnSale ?? false,
    },
    isDefault: outlet.isDefault ?? false,
    status: outlet.status ?? 'active',
    createdAt: iso(outlet.createdAt) ?? new Date().toISOString(),
  };
}

export function toUserDto(user: UserDoc): UserDto {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    phone: user.phone ?? '',
    avatar: user.avatar ?? null,
    status: user.status ?? 'active',
    lastLoginAt: iso(user.lastLoginAt),
    createdAt: iso(user.createdAt) ?? new Date().toISOString(),
  };
}

export function toMembershipDto(
  m: MembershipDoc,
  user: Pick<UserDoc, '_id' | 'email' | 'name' | 'phone' | 'avatar' | 'status' | 'lastLoginAt'>,
  role: Pick<RoleDoc, '_id' | 'key' | 'name' | 'isSystem'>,
): MembershipDto {
  return {
    id: String(m._id),
    user: {
      id: String(user._id),
      email: user.email,
      name: user.name,
      phone: user.phone ?? '',
      avatar: user.avatar ?? null,
      status: user.status ?? 'active',
      lastLoginAt: iso(user.lastLoginAt),
    },
    role: { id: String(role._id), key: role.key, name: role.name, isSystem: role.isSystem },
    outletAccess: {
      all: m.outletAccess?.all ?? false,
      outletIds: (m.outletAccess?.outletIds ?? []).map(String),
    },
    defaultOutletId: m.defaultOutletId ? String(m.defaultOutletId) : null,
    isOwner: m.isOwner ?? false,
    status: m.status ?? 'active',
    joinedAt: iso(m.joinedAt),
    invitedAt: iso(m.invitedAt),
    createdAt: iso(m.createdAt) ?? new Date().toISOString(),
  };
}

export function toSessionDto(s: SessionDoc, currentSessionId: string): SessionDto {
  return {
    id: String(s._id),
    userAgent: s.userAgent ?? '',
    ip: s.ip ?? '',
    createdAt: iso(s.createdAt) ?? new Date().toISOString(),
    lastUsedAt: iso(s.lastUsedAt) ?? undefined,
    expiresAt: iso(s.expiresAt) ?? new Date().toISOString(),
    current: String(s._id) === currentSessionId,
  };
}

export function toAuditLogDto(
  log: AuditLogDoc,
  user?: Pick<UserDoc, '_id' | 'name' | 'email'> | null,
): AuditLogDto {
  return {
    id: String(log._id),
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId ? String(log.entityId) : null,
    summary: log.summary,
    user: user ? { id: String(user._id), name: user.name, email: user.email } : null,
    outletId: log.outletId ? String(log.outletId) : null,
    before: log.before ?? null,
    after: log.after ?? null,
    metadata: (log.metadata as Record<string, unknown>) ?? undefined,
    ip: log.ip ?? '',
    createdAt: iso(log.createdAt) ?? new Date().toISOString(),
  };
}
