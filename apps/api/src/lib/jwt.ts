import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { AuthError } from './errors';

export interface AccessTokenClaims {
  sub: string; // user id
  org: string; // organization id
  mem: string; // membership id
  sid: string; // session id
}

export function signAccessToken(claims: AccessTokenClaims): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + env.JWT_ACCESS_TTL_SECONDS * 1000);
  const token = jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    issuer: 'pharmaos',
    audience: 'pharmaos-api',
  });
  return { token, expiresAt };
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: 'pharmaos',
      audience: 'pharmaos-api',
    });
    if (typeof payload !== 'object' || !payload.sub) throw new AuthError('Invalid token');
    const p = payload as jwt.JwtPayload & Partial<AccessTokenClaims>;
    if (!p.org || !p.mem || !p.sid) throw new AuthError('Invalid token');
    return { sub: p.sub as string, org: p.org, mem: p.mem, sid: p.sid };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new AuthError('Session expired', 'TOKEN_EXPIRED');
    if (err instanceof AuthError) throw err;
    throw new AuthError('Invalid token');
  }
}
