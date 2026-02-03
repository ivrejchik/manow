import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (c: Context) => string; // Custom key generator
}

// Simple in-memory store for rate limiting
// In production, consider using Redis
const store = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store) {
    if (value.resetAt < now) {
      store.delete(key);
    }
  }
}, 60_000); // Clean up every minute

function defaultKeyGenerator(c: Context): string {
  // Use IP address as default key
  const forwarded = c.req.header('X-Forwarded-For');
  const ip = forwarded?.split(',')[0].trim() || c.req.header('X-Real-IP') || 'unknown';
  return `rate-limit:${ip}:${c.req.path}`;
}

export function rateLimit(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyGenerator = defaultKeyGenerator } = config;

  return createMiddleware(async (c, next) => {
    const key = keyGenerator(c);
    const now = Date.now();

    let record = store.get(key);

    if (!record || record.resetAt < now) {
      record = { count: 0, resetAt: now + windowMs };
      store.set(key, record);
    }

    record.count++;

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - record.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));

    if (record.count > maxRequests) {
      c.header('Retry-After', String(Math.ceil((record.resetAt - now) / 1000)));
      return c.json(
        {
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((record.resetAt - now) / 1000),
        },
        429
      );
    }

    await next();
  });
}

// Pre-configured rate limiters
export const standardRateLimit = rateLimit({
  windowMs: 60_000, // 1 minute
  maxRequests: 100,
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60_000, // 15 minutes
  maxRequests: 10,
});

export const holdRateLimit = rateLimit({
  windowMs: 60_000, // 1 minute
  maxRequests: 5,
  keyGenerator: (c) => {
    const forwarded = c.req.header('X-Forwarded-For');
    const ip = forwarded?.split(',')[0].trim() || c.req.header('X-Real-IP') || 'unknown';
    return `hold-rate-limit:${ip}`;
  },
});
