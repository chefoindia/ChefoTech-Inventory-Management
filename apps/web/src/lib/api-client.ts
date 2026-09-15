import type { ApiFailure, ApiMeta, ApiResponse } from '@pharmaos/shared';
import { useSession } from '@/stores/session';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiFailure['error']['code'];
  readonly details: { path: string; message: string }[];
  readonly requestId?: string;

  constructor(status: number, failure: ApiFailure | null) {
    super(failure?.error.message ?? `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = failure?.error.code ?? 'INTERNAL';
    this.details = failure?.error.details ?? [];
    this.requestId = failure?.requestId;
  }

  /** Field errors keyed by the last path segment, e.g. `body.email` → `email`. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details) {
      const key = d.path.replace(/^(body|query|params)\./, '');
      if (!out[key]) out[key] = d.message;
    }
    return out;
  }
}

export class NetworkError extends Error {
  constructor() {
    super('Cannot reach the server. Check your connection and try again.');
    this.name = 'NetworkError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  idempotencyKey?: string;
  /** Skip the bearer token (public endpoints). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

export interface PagedResult<T> {
  items: T[];
  meta: ApiMeta;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Exchange the refresh cookie for a new access token. Resolves false if the session is gone. */
export async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      const json = (await res.json()) as ApiResponse<{ accessToken: string; accessTokenExpiresAt: string }>;
      if (!json.success) return false;
      useSession.getState().setTokens(json.data.accessToken, json.data.accessTokenExpiresAt);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path.startsWith('http') ? path : `${API_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function rawRequest<T>(path: string, opts: RequestOptions, retried = false): Promise<{ data: T; meta?: ApiMeta }> {
  const { accessToken, activeOutletId } = useSession.getState();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!opts.anonymous && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (activeOutletId) headers['X-Outlet-Id'] = activeOutletId;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new NetworkError();
  }

  if (res.status === 204) return { data: undefined as T };

  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    json = null;
  }

  if (res.status === 401 && !opts.anonymous && !retried) {
    const code = json && !json.success ? json.error.code : undefined;
    if (code === 'TOKEN_EXPIRED' || code === 'UNAUTHENTICATED') {
      const ok = await refreshAccessToken();
      if (ok) return rawRequest<T>(path, opts, true);
    }
    useSession.getState().clear();
  }

  if (!res.ok || !json || !json.success) {
    throw new ApiError(res.status, json && !json.success ? json : null);
  }
  return { data: json.data, meta: json.meta };
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], opts: Omit<RequestOptions, 'query' | 'method'> = {}) =>
    rawRequest<T>(path, { ...opts, query }).then((r) => r.data),
  getPaged: <T>(path: string, query?: RequestOptions['query']) =>
    rawRequest<T[]>(path, { query }).then((r) => ({ items: r.data, meta: r.meta! }) as PagedResult<T>),
  post: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'body' | 'method'> = {}) =>
    rawRequest<T>(path, { ...opts, method: 'POST', body }).then((r) => r.data),
  patch: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'body' | 'method'> = {}) =>
    rawRequest<T>(path, { ...opts, method: 'PATCH', body }).then((r) => r.data),
  delete: <T = void>(path: string, opts: Omit<RequestOptions, 'method'> = {}) =>
    rawRequest<T>(path, { ...opts, method: 'DELETE' }).then((r) => r.data),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError || err instanceof NetworkError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
