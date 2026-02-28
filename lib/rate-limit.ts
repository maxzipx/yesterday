import "server-only";

type RateLimitKey = string;

type RateLimitState = {
  windowStartMs: number;
  count: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

const store = new Map<RateLimitKey, RateLimitState>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const state = store.get(key);

  if (!state || now - state.windowStartMs >= windowMs) {
    store.set(key, { windowStartMs: now, count: 1 });
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, limit - 1),
    };
  }

  if (state.count >= limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((state.windowStartMs + windowMs - now) / 1000),
    );
    return {
      allowed: false,
      retryAfterSeconds,
      remaining: 0,
    };
  }

  state.count += 1;
  store.set(key, state);

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, limit - state.count),
  };
}

