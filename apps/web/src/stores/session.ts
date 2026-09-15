import { create } from 'zustand';
import type { MeDto } from '@pharmaos/shared';

const OUTLET_KEY = 'pharmaos.activeOutlet';

interface SessionState {
  accessToken: string | null;
  accessTokenExpiresAt: number | null;
  me: MeDto | null;
  activeOutletId: string | null;
  /** True once the initial silent-refresh attempt has completed (success or failure). */
  hydrated: boolean;
  setTokens: (token: string, expiresAt: string) => void;
  setMe: (me: MeDto | null) => void;
  setActiveOutlet: (outletId: string | null) => void;
  setHydrated: (v: boolean) => void;
  clear: () => void;
}

function readStoredOutlet(userId: string): string | null {
  try {
    return localStorage.getItem(`${OUTLET_KEY}.${userId}`);
  } catch {
    return null;
  }
}

function storeOutlet(userId: string, outletId: string | null) {
  try {
    if (outletId) localStorage.setItem(`${OUTLET_KEY}.${userId}`, outletId);
    else localStorage.removeItem(`${OUTLET_KEY}.${userId}`);
  } catch {
    /* ignore */
  }
}

export const useSession = create<SessionState>((set, get) => ({
  accessToken: null,
  accessTokenExpiresAt: null,
  me: null,
  activeOutletId: null,
  hydrated: false,
  setTokens: (token, expiresAt) => set({ accessToken: token, accessTokenExpiresAt: new Date(expiresAt).getTime() }),
  setMe: (me) => {
    if (!me) return set({ me: null, activeOutletId: null });
    const current = get().activeOutletId;
    const stored = readStoredOutlet(me.user.id);
    const candidates = [current, stored, me.membership.defaultOutletId, me.outlets[0]?.id];
    const chosen = candidates.find((id) => id && me.outlets.some((o) => o.id === id)) ?? null;
    storeOutlet(me.user.id, chosen);
    set({ me, activeOutletId: chosen });
  },
  setActiveOutlet: (outletId) => {
    const me = get().me;
    if (me) storeOutlet(me.user.id, outletId);
    set({ activeOutletId: outletId });
  },
  setHydrated: (v) => set({ hydrated: v }),
  clear: () => set({ accessToken: null, accessTokenExpiresAt: null, me: null, activeOutletId: null }),
}));

/** Permission helpers usable outside React (api client, guards). */
export function hasPermission(me: MeDto | null, permission: string): boolean {
  if (!me) return false;
  if (me.membership.isOwner) return true;
  return me.permissions.includes(permission);
}
