import type { Address } from '../schemas/common';
import type { OrganizationSettings } from '../schemas/organization';
import type { OutletAccess } from '../schemas/user';
import type { EntityStatus, MembershipStatus, OutletType } from '../constants/enums';

export interface ApiMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export interface ApiFailure {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetail[];
  };
  requestId?: string;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE'
  | 'RATE_LIMITED'
  | 'ACCOUNT_LOCKED'
  | 'TOKEN_EXPIRED'
  | 'IDEMPOTENCY_MISMATCH'
  | 'PLAN_LIMIT'
  | 'INTERNAL';

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface AttachmentRef {
  provider: 'cloudinary';
  publicId: string;
  resourceType: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
  originalName?: string;
  access: 'public' | 'private';
  url?: string;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  phone?: string;
  avatar?: AttachmentRef | null;
  status: 'active' | 'disabled';
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  legalName?: string;
  logo?: AttachmentRef | null;
  email?: string;
  phone?: string;
  website?: string;
  address: Address;
  tax: { gstin?: string; pan?: string; stateCode: string; registrationType: string };
  currency: string;
  locale: string;
  timezone: string;
  financialYearStartMonth: number;
  settings: OrganizationSettings;
  subscription: {
    planKey: string;
    status: string;
    trialEndsAt?: string | null;
    limits: { outlets: number; users: number; products: number; storageMb: number };
  };
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface OutletDto {
  id: string;
  name: string;
  code: string;
  type: OutletType;
  stateCode: string;
  gstin?: string;
  drugLicenseNo?: string;
  drugLicenseExpiry?: string | null;
  phone?: string;
  email?: string;
  address: Address;
  settings: { invoiceFooterNote: string; defaultPrinter: string; autoPrintOnSale: boolean };
  isDefault: boolean;
  status: EntityStatus;
  createdAt: string;
}

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  memberCount?: number;
  createdAt: string;
}

export interface MembershipDto {
  id: string;
  user: Pick<UserDto, 'id' | 'email' | 'name' | 'phone' | 'avatar' | 'status' | 'lastLoginAt'>;
  role: Pick<RoleDto, 'id' | 'key' | 'name' | 'isSystem'>;
  outletAccess: OutletAccess;
  defaultOutletId?: string | null;
  isOwner: boolean;
  status: MembershipStatus;
  joinedAt?: string | null;
  invitedAt?: string | null;
  createdAt: string;
}

export interface OrganizationSummaryDto {
  id: string;
  name: string;
  slug: string;
  roleName: string;
  isOwner: boolean;
}

export interface MeDto {
  user: UserDto;
  organization: OrganizationDto;
  membership: {
    id: string;
    isOwner: boolean;
    role: Pick<RoleDto, 'id' | 'key' | 'name'>;
    outletAccess: OutletAccess;
    defaultOutletId?: string | null;
  };
  permissions: string[];
  outlets: OutletDto[];
  organizations: OrganizationSummaryDto[];
}

export interface AuthTokensDto {
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface AuditLogDto {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  user?: { id: string; name: string; email: string } | null;
  outletId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

export interface SessionDto {
  id: string;
  userAgent?: string;
  ip?: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt: string;
  current: boolean;
}
