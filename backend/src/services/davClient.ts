// SPDX-License-Identifier: GPL-3.0-or-later
import { createDAVClient } from 'tsdav';
import crypto from 'crypto';

export type DAVClientInstance = Awaited<ReturnType<typeof createDAVClient>>;
type AccountType = 'caldav' | 'carddav';

// createDAVClient runs a full DAV discovery handshake (principal + home-set PROPFIND)
// against the server on every call. Doing that per API request added ~460ms of fixed
// overhead to each event/calendar/contact fetch. Credentials are stable for a session,
// so we cache the resolved client (which holds the discovered account) and reuse it.
//
// Keyed by a hash of username+password+baseUrl+type so different users/servers never
// collide; the raw password is not used as a map key. Entries expire after TTL so a
// changed password or server eventually forces a fresh handshake.

interface CacheEntry {
  client: Promise<DAVClientInstance>;
  createdAt: number;
}

const TTL_MS = 30 * 60_000; // 30 minutes
const cache = new Map<string, CacheEntry>();

function keyFor(username: string, password: string, baseUrl: string, type: AccountType): string {
  return crypto.createHash('sha256')
    .update(`${type}\0${baseUrl}\0${username}\0${password}`)
    .digest('hex');
}

export async function getDAVClient(
  username: string,
  password: string,
  baseUrl: string,
  type: AccountType
): Promise<DAVClientInstance> {
  const key = keyFor(username, password, baseUrl, type);
  const existing = cache.get(key);
  if (existing && Date.now() - existing.createdAt < TTL_MS) {
    return existing.client;
  }

  // Store the promise (not the resolved client) so concurrent requests during the
  // initial handshake share one discovery instead of each starting their own.
  const client = createDAVClient({
    serverUrl: baseUrl,
    credentials: { username, password },
    authMethod: 'Basic',
    defaultAccountType: type,
  });
  cache.set(key, { client, createdAt: Date.now() });

  // If discovery fails, drop the cached rejected promise so the next call retries.
  client.catch(() => { if (cache.get(key)?.client === client) cache.delete(key); });

  return client;
}
