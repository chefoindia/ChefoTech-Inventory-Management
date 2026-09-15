import type { Types } from 'mongoose';
import type { UserRef } from '@pharmaos/shared';
import { UserModel, type UserDoc } from '@/models/user.model';
import { trustedFilter } from '@/lib/scoped';

/** Batch-resolve user ids to {id,name} refs; returns a lookup function. */
export async function userRefs(ids: (Types.ObjectId | string | null | undefined)[]): Promise<(id: Types.ObjectId | string | null | undefined) => UserRef | null> {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  const users = unique.length ? await UserModel.find(trustedFilter({ _id: { $in: unique } })).select('name').lean<Pick<UserDoc, '_id' | 'name'>[]>() : [];
  const map = new Map(users.map((u) => [String(u._id), u.name]));
  return (id) => (id ? { id: String(id), name: map.get(String(id)) ?? '' } : null);
}

export const iso = (d?: Date | null): string | null => (d ? new Date(d).toISOString() : null);
export const isoNow = (d?: Date | null): string => iso(d) ?? new Date().toISOString();
