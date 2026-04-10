// next-app/lib/middleware/rateLimit.js
import { NextResponse } from 'next/server';

const rateLimitMap = new Map();

function getClientIp(req) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.ip ||
    'unknown'
  );
}

function getEndpoint(req) {
  return new URL(req.url).pathname;
}

function createRateLimitResponse(limit, remaining, resetSecEpoch) {
  const retryAfter = Math.max(1, Math.ceil(resetSecEpoch - Date.now() / 1000));
  return NextResponse.json(
    {
      error: 'Too many requests, please try again later',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(Math.max(0, remaining)),
        'X-RateLimit-Reset': new Date(resetSecEpoch * 1000).toISOString(),
      },
    }
  );
}

/**
 * Rate limiting middleware (in-memory per server instance).
 * @param {number} maxRequests - Maximum requests allowed
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function} Middleware function
 */
export function rateLimit(maxRequests = 100, windowMs = 60000) {
  return async (req) => {
    const ip = getClientIp(req);
    const endpoint = getEndpoint(req);
    const key = `${ip}-${endpoint}`;

    const now = Date.now();
    const record = rateLimitMap.get(key);

    if (!record || now > record.resetTime) {
      rateLimitMap.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return null;
    }

    if (record.count >= maxRequests) {
      return createRateLimitResponse(maxRequests, 0, Math.ceil(record.resetTime / 1000));
    }

    record.count++;
    return null;
  };
}

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
      if (now > record.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

export const rateLimiters = {
  auth: rateLimit(5, 60000),
  api: rateLimit(100, 60000),
  read: rateLimit(200, 60000),
  write: rateLimit(20, 60000),
};
