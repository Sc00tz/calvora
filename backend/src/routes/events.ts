// SPDX-License-Identifier: GPL-3.0-or-later
import { Router, Request, Response } from 'express';
import { fetchEvents, createEvent, updateEvent, deleteEvent, searchEvents, getFreeBusy } from '../services/caldav.js';
import { requireSession } from '../middleware/session.js';
import { cached, invalidateUser } from '../services/responseCache.js';
import { CreateEventBody, UpdateEventBody } from '../types/index.js';

const router = Router();
// Short TTL: long enough to absorb the initial per-calendar burst, re-navigation, and the
// 60s notification poll, short enough that external edits (phone/DAVx5) surface quickly.
const EVENTS_TTL_MS = 30_000;

// GET /api/events/search?q=...&calendarUrl=url1&calendarUrl=url2
router.get('/search', requireSession, async (req: Request, res: Response) => {
  const { q } = req.query as { q?: string };
  const calendarUrls = ([] as string[]).concat((req.query.calendarUrl as any) ?? []).filter(Boolean);
  const { username, password, davisBaseUrl } = req.session;

  if (!q?.trim() || calendarUrls.length === 0) { res.json([]); return; }

  try {
    const events = await searchEvents(username!, password!, davisBaseUrl!, calendarUrls, q.trim());
    res.json(events);
  } catch (err: any) {
    console.error('Search failed:', err?.message || err);
    res.status(502).json({ error: 'Search failed' });
  }
});

// GET /api/events/freebusy?start=ISO&end=ISO&calendarUrl=url1&calendarUrl=url2
// Returns the caller's busy intervals across the given calendars (their own availability).
router.get('/freebusy', requireSession, async (req: Request, res: Response) => {
  const { start, end } = req.query as { start?: string; end?: string };
  const calendarUrls = ([] as string[]).concat((req.query.calendarUrl as any) ?? []).filter(Boolean);
  const { username, password, davisBaseUrl } = req.session;

  if (!start || !end || calendarUrls.length === 0) {
    res.status(400).json({ error: 'start, end, and at least one calendarUrl are required' });
    return;
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    res.status(400).json({ error: 'Invalid start or end date' });
    return;
  }

  try {
    const busy = await getFreeBusy(username!, password!, davisBaseUrl!, calendarUrls, startDate, endDate);
    res.json(busy);
  } catch (err: any) {
    console.error('Free/busy query failed:', err?.message || err);
    res.status(502).json({ error: 'Free/busy query failed' });
  }
});

// GET /api/events?calendarUrl=...&start=ISO&end=ISO
router.get('/', requireSession, async (req: Request, res: Response) => {
  const { calendarUrl, start, end } = req.query as { calendarUrl?: string; start?: string; end?: string };
  const { username, password, davisBaseUrl } = req.session;

  if (!calendarUrl || !start || !end) {
    res.status(400).json({ error: 'calendarUrl, start, and end are required' });
    return;
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    res.status(400).json({ error: 'Invalid start or end date' });
    return;
  }

  try {
    const events = await cached(username!, `events:${calendarUrl}:${start}:${end}`,
      () => fetchEvents(username!, password!, davisBaseUrl!, calendarUrl, startDate, endDate), EVENTS_TTL_MS);
    res.json(events);
  } catch (err: any) {
    console.error('Failed to fetch events:', err?.message || err);
    res.status(502).json({ error: 'Failed to fetch events from Davis' });
  }
});

// POST /api/events
router.post('/', requireSession, async (req: Request, res: Response) => {
  const { username, password, davisBaseUrl } = req.session;
  const body = req.body as CreateEventBody;

  if (!body.calendarUrl || !body.title || !body.start || !body.end) {
    res.status(400).json({ error: 'calendarUrl, title, start, and end are required' });
    return;
  }

  try {
    const event = await createEvent(username!, password!, davisBaseUrl!, body);
    invalidateUser(username!);
    res.status(201).json(event);
  } catch (err: any) {
    console.error('Failed to create event:', err?.message || err);
    res.status(502).json({ error: 'Failed to create event in Davis' });
  }
});

// PUT /api/events/:uid
router.put('/:uid', requireSession, async (req: Request, res: Response) => {
  const { username, password, davisBaseUrl } = req.session;
  const body = req.body as UpdateEventBody;

  body.uid = req.params.uid;

  if (!body.eventUrl || !body.calendarUrl || !body.title || !body.start || !body.end) {
    res.status(400).json({ error: 'eventUrl, calendarUrl, title, start, and end are required' });
    return;
  }

  try {
    await updateEvent(username!, password!, davisBaseUrl!, body);
    invalidateUser(username!);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Failed to update event:', err?.message || err);
    res.status(502).json({ error: 'Failed to update event in Davis' });
  }
});

// DELETE /api/events/:uid?eventUrl=...&etag=...&editScope=...&occurrenceStart=...
router.delete('/:uid', requireSession, async (req: Request, res: Response) => {
  const { username, password, davisBaseUrl } = req.session;
  const { eventUrl, etag, editScope, occurrenceStart } = req.query as {
    eventUrl?: string; etag?: string; editScope?: string; occurrenceStart?: string;
  };

  if (!eventUrl) {
    res.status(400).json({ error: 'eventUrl query param is required' });
    return;
  }

  try {
    await deleteEvent(username!, password!, davisBaseUrl!, eventUrl, etag, editScope, occurrenceStart);
    invalidateUser(username!);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Failed to delete event:', err?.message || err);
    res.status(502).json({ error: 'Failed to delete event in Davis' });
  }
});

export default router;
