// SPDX-License-Identifier: GPL-3.0-or-later
import { Router, Request, Response } from 'express';
import { requireSession } from '../middleware/session.js';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';


const router = Router();
const DATA_DIR = path.join(process.cwd(), 'data');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');

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

// DELETE /api/subscriptions/:id
router.delete('/:id', requireSession, async (req: Request, res: Response) => {
  const { id } = req.params;
  let subs = await getSubscriptions();
  subs = subs.filter(s => s.id !== id);
  await saveSubscriptions(subs);
  res.json({ ok: true });
});

// GET /api/subscriptions/proxy?url=...
router.get('/proxy', requireSession, async (req: Request, res: Response) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`External server responded with ${response.status}`);
    const data = await response.text();
    res.setHeader('Content-Type', 'text/calendar');
    res.send(data);
  } catch (err: any) {
    console.error('Failed to proxy iCal URL:', url, err.message);
    res.status(502).json({ error: 'Failed to fetch external iCal data' });
  }
});

export default router;
