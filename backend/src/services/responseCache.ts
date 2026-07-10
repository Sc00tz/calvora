// SPDX-License-Identifier: GPL-3.0-or-later
import crypto from 'crypto';

// Small in-memory TTL cache for read-heavy Davis responses (calendars, contacts, events).
// Davis queries cost 300-800ms each and its data rarely changes within a session, so we
// cache per (user, key) for a short window. Mutations invalidate a user's entries
// explicitly, so the TTL only bounds staleness from *other* clients (phone, DAVx5).

interface Entry { value: unknown; expiresAt: number }

const DEFAULT_TTL_MS = 60_000;
const store = new Map<string, Entry>();

// Namespace cache entries by user so one account never sees another's data. The Davis
// username is an email; we hash it to keep the raw address out of map keys.
function userNs(username: string): string {
  return crypto.createHash('sha256').update(username).digest('hex').slice(0, 16);
}

function fullKey(username: string, key: string): string {
  return `${userNs(username)}::${key}`;
}

// Returns the cached value if fresh, else runs `producer`, caches, and returns it.
// Concurrent callers with the same key share one in-flight producer (the promise is cached).
export async function cached<T>(
  username: string,
  key: string,
  producer: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const k = fullKey(username, key);
  const hit = store.get(k);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }
  const promise = producer();
  // Cache the promise immediately so parallel requests dedupe onto it.
  store.set(k, { value: promise, expiresAt: Date.now() + ttlMs });
  try {
    const value = await promise;
    store.set(k, { value, expiresAt: Date.now() + ttlMs });
    return value;
  } catch (err) {
    store.delete(k); // don't cache failures
    throw err;
  }
}

// Drops all cached entries for a user (call after any mutation on their data).
export function invalidateUser(username: string): void {
  const prefix = `${userNs(username)}::`;
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
