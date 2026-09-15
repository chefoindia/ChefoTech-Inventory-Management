import type { Request, Response } from 'express';
import type { RegisterInput, LoginInput, ChangePasswordInput } from '@pharmaos/shared';
import { env, isProd } from '@/config/env';
import { ok, created, noContent } from '@/lib/response';
import { AuthError } from '@/lib/errors';
import { body, params } from '@/middleware/validate';
import { ctxOf } from '@/middleware/authenticate';
import * as authService from './auth.service';

export const REFRESH_COOKIE = 'pharmaos_rt';

function cookiePath() {
  return `${env.API_BASE_PATH}/auth`;
}

function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd || env.COOKIE_SECURE,
    sameSite: 'lax',
    path: cookiePath(),
    expires: expiresAt,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: cookiePath(), httpOnly: true, sameSite: 'lax', secure: isProd || env.COOKIE_SECURE });
}

function meta(req: Request): authService.ClientMeta {
  return { ip: req.ip, userAgent: req.header('user-agent') ?? '', requestId: req.requestId };
}

export async function register(req: Request, res: Response) {
  const { tokens, me } = await authService.registerOrganization(body<RegisterInput>(req), meta(req));
  setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
  created(res, { accessToken: tokens.accessToken, accessTokenExpiresAt: tokens.accessTokenExpiresAt, me });
}

export async function login(req: Request, res: Response) {
  const { tokens, me } = await authService.login(body<LoginInput>(req), meta(req));
  setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
  ok(res, { accessToken: tokens.accessToken, accessTokenExpiresAt: tokens.accessTokenExpiresAt, me });
}

export async function refresh(req: Request, res: Response) {
  const token = (req.cookies as Record<string, string | undefined>)?.[REFRESH_COOKIE];
  if (!token) throw new AuthError('No active session');
  try {
    const tokens = await authService.refreshSession(token, meta(req));
    setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
    ok(res, { accessToken: tokens.accessToken, accessTokenExpiresAt: tokens.accessTokenExpiresAt });
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  const token = (req.cookies as Record<string, string | undefined>)?.[REFRESH_COOKIE];
  if (req.ctx) await authService.logout(req.ctx.sessionId, req.ctx);
  else if (token) await authService.logoutByRefreshToken(token);
  clearRefreshCookie(res);
  noContent(res);
}

export async function me(req: Request, res: Response) {
  const ctx = ctxOf(req);
  ok(res, await authService.buildMe(ctx.userId, ctx.membershipId));
}

export async function switchOrganization(req: Request, res: Response) {
  const ctx = ctxOf(req);
  const { organizationId } = body<{ organizationId: string }>(req);
  const { tokens, me: payload } = await authService.switchOrganization(ctx, organizationId, meta(req));
  setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresAt);
  ok(res, { accessToken: tokens.accessToken, accessTokenExpiresAt: tokens.accessTokenExpiresAt, me: payload });
}

export async function listSessions(req: Request, res: Response) {
  ok(res, await authService.listSessions(ctxOf(req)));
}

export async function revokeSession(req: Request, res: Response) {
  await authService.revokeSession(ctxOf(req), params<{ id: string }>(req).id);
  noContent(res);
}

export async function changePassword(req: Request, res: Response) {
  await authService.changePassword(ctxOf(req), body<ChangePasswordInput>(req));
  noContent(res);
}
