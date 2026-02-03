import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import { authService, type SessionWithUser } from '../services/auth.service';
import type { User, Session } from '../db';

// Extend Hono's context variables
declare module 'hono' {
  interface ContextVariableMap {
    user: User;
    session: Session;
  }
}

const SESSION_COOKIE_NAME = 'session';

export function getSessionToken(c: Context): string | null {
  // Check Authorization header first
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Fall back to cookie
  const cookie = c.req.header('Cookie');
  if (cookie) {
    const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    if (match) {
      return match[1];
    }
  }

  return null;
}

export function setSessionCookie(c: Context, token: string, expiresAt: Date): void {
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  c.header(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`
  );
}

export function clearSessionCookie(c: Context): void {
  c.header(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`
  );
}

/**
 * Middleware that requires authentication.
 * Sets c.var.user and c.var.session if authenticated.
 * Returns 401 if not authenticated.
 */
export const requireAuth = createMiddleware(async (c, next) => {
  const token = getSessionToken(c);

  if (!token) {
    return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
  }

  const result = await authService.validateSession(token);

  if (!result) {
    clearSessionCookie(c);
    return c.json({ error: 'Unauthorized', message: 'Invalid or expired session' }, 401);
  }

  c.set('user', result.user);
  c.set('session', result.session);

  await next();
});

/**
 * Middleware that optionally authenticates.
 * Sets c.var.user and c.var.session if authenticated, but allows unauthenticated requests.
 */
export const optionalAuth = createMiddleware(async (c, next) => {
  const token = getSessionToken(c);

  if (token) {
    const result = await authService.validateSession(token);
    if (result) {
      c.set('user', result.user);
      c.set('session', result.session);
    }
  }

  await next();
});
