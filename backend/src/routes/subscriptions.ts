// SPDX-License-Identifier: GPL-3.0-or-later
import { Router, Request, Response } from 'express';
import { requireSession } from '../middleware/session.js';
import fs from 'fs/promises';
import path from 'path';
import dns from 'dns/promises';
import net from 'net';
import { v4 as uuidv4 } from 'uuid';


const router = Router();
const DATA_DIR = path.join(process.cwd(), 'data');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');

// External feeds can be large (megabytes) and slow (several seconds). The frontend
// re-requests them on every calendar navigation, so we cache each fetched feed briefly
// in memory to avoid re-downloading on every view change.
const PROXY_TIMEOUT_MS = 15_000;
const FEED_CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const feedCache = new Map<string, { data: string; fetchedAt: number }>();

async function getSubscriptions(): Promise<any[]> {
  try {
    const data = await fs.readFile(SUBS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveSubscriptions(subs: any[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SUBS_FILE, JSON.stringify(subs, null, 2));
}

// GET /api/subscriptions
router.get('/', requireSession, async (req: Request, res: Response) => {
  const subs = await getSubscriptions();
  // Map stored subscription objects to the full CalendarInfo type required by the frontend
  res.json(subs.map(s => ({
    ...s,
    displayName: s.name || 'Unnamed Subscription',
    supportsEvents: true,
    supportsTasks: false,
    canWrite: false,
    isShared: false
  })));
});

// POST /api/subscriptions
router.post('/', requireSession, async (req: Request, res: Response) => {
  const { url, name, color } = req.body;
  if (!url || !name || !color) {
    return res.status(400).json({ error: 'url, name, and color are required' });
  }

  const subs = await getSubscriptions();
  const newSub = {
    id: uuidv4(),
    url,
    name,
    displayName: name,
    color,
    isExternal: true,
    supportsEvents: true,
    supportsTasks: false,
    canWrite: false,
    isShared: false
  };
  subs.push(newSub);
  await saveSubscriptions(subs);
  res.json(newSub);
});

// PATCH /api/subscriptions/:id  body: { color }
router.patch('/:id', requireSession, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { color } = req.body as { color?: string };
  if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return res.status(400).json({ error: 'color must be a 6-digit hex value like #FF0000' });
  }
  const subs = await getSubscriptions();
  const sub = subs.find(s => s.id === id);
  if (!sub) return res.status(404).json({ error: 'Subscription not found' });
  sub.color = color;
  await saveSubscriptions(subs);
  return res.json({ ok: true });
});

// DELETE /api/subscriptions/:id
router.delete('/:id', requireSession, async (req: Request, res: Response) => {
  const { id } = req.params;
  let subs = await getSubscriptions();
  subs = subs.filter(s => s.id !== id);
  await saveSubscriptions(subs);
  res.json({ ok: true });
});

// Returns true if `ip` falls in a range we must never let the proxy reach:
// loopback, private (RFC 1918), link-local (incl. cloud metadata 169.254.0.0/16),
// and the IPv6 equivalents. Blocks SSRF pivots into the Docker network / metadata service.
function isBlockedAddress(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;          // this-host, private, loopback
    if (a === 172 && b >= 16 && b <= 31) return true;           // private
    if (a === 192 && b === 168) return true;                    // private
    if (a === 169 && b === 254) return true;                    // link-local / cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true;          // CGNAT (RFC 6598)
    if (a >= 224) return true;                                  // multicast / reserved
    return false;
  }
  if (type === 6) {
    const v = ip.toLowerCase().split('%')[0];                   // strip zone id
    if (v === '::1' || v === '::') return true;                 // loopback / unspecified
    if (v.startsWith('fe80')) return true;                      // link-local
    if (v.startsWith('fc') || v.startsWith('fd')) return true;  // unique local
    // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4 address
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return false;
  }
  return true; // not a valid IP literal — reject
}

// Validates an external URL is safe for the proxy to fetch: http(s) only, and every
// address the hostname resolves to is publicly routable. Throws on rejection.
async function assertSafeProxyUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed');
  }

  const host = parsed.hostname;
  // If the host is already an IP literal, check it directly.
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new Error('URL resolves to a blocked address');
    return;
  }

  const resolved = await dns.lookup(host, { all: true });
  if (resolved.length === 0) throw new Error('Host did not resolve');
  for (const { address } of resolved) {
    if (isBlockedAddress(address)) throw new Error('URL resolves to a blocked address');
  }
}

// GET /api/subscriptions/proxy?url=...
router.get('/proxy', requireSession, async (req: Request, res: Response) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  // Serve from cache if fresh — avoids re-downloading large/slow feeds on every navigation.
  const cached = feedCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < FEED_CACHE_TTL_MS) {
    res.setHeader('Content-Type', 'text/calendar');
    res.send(cached.data);
    return;
  }

  try {
    await assertSafeProxyUrl(url);
  } catch (err: any) {
    console.warn('Rejected proxy URL:', url, err.message);
    return res.status(400).json({ error: 'URL is not allowed' });
  }

  try {
    // Follow redirects manually so each hop is re-validated against the SSRF guard —
    // a public URL must not be able to 30x-bounce into a private/internal address.
    let current = url;
    let fetchRes: globalThis.Response | undefined;
    for (let hop = 0; hop < 5; hop++) {
      fetchRes = await fetch(current, {
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
        redirect: 'manual',
      });
      if (fetchRes.status >= 300 && fetchRes.status < 400) {
        const location = fetchRes.headers.get('location');
        if (!location) break;
        const next = new URL(location, current).toString();
        await assertSafeProxyUrl(next); // throws → caught below as a 400-class rejection
        current = next;
        continue;
      }
      break;
    }
    if (!fetchRes || !fetchRes.ok) {
      throw new Error(`External server responded with ${fetchRes?.status ?? 'no response'}`);
    }
    const data = await fetchRes.text();
    feedCache.set(url, { data, fetchedAt: Date.now() });
    res.setHeader('Content-Type', 'text/calendar');
    res.send(data);
  } catch (err: any) {
    console.error('Failed to proxy iCal URL:', url, err.message);
    res.status(502).json({ error: 'Failed to fetch external iCal data' });
  }
});

export default router;
