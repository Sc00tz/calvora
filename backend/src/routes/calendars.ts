// SPDX-License-Identifier: GPL-3.0-or-later
import { Router, Request, Response } from 'express';
import { fetchCalendars, updateCalendarColor } from '../services/caldav.js';
import { requireSession } from '../middleware/session.js';
import { cached, invalidateUser } from '../services/responseCache.js';

const router = Router();

// The calendar list rarely changes within a session and sits on the render-blocking
// critical path (it also does per-calendar PROPFINDs), so cache it for 5 minutes.
const CALENDARS_TTL_MS = 5 * 60_000;

router.get('/', requireSession, async (req: Request, res: Response) => {
  const { username, password, davisBaseUrl } = req.session;
  try {
    const calendars = await cached(username!, 'calendars',
      () => fetchCalendars(username!, password!, davisBaseUrl!), CALENDARS_TTL_MS);
    res.json(calendars);
  } catch (err: any) {
    console.error('Failed to fetch calendars:', err?.message || err);
    res.status(502).json({ error: 'Failed to fetch calendars from Davis' });
  }
});

// PATCH /api/calendars/color  body: { calendarUrl, color }
router.patch('/color', requireSession, async (req: Request, res: Response) => {
  const { username, password, davisBaseUrl } = req.session;
  const { calendarUrl, color } = req.body as { calendarUrl?: string; color?: string };

  if (!calendarUrl || !color) {
    res.status(400).json({ error: 'calendarUrl and color are required' });
    return;
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    res.status(400).json({ error: 'color must be a 6-digit hex value like #FF0000' });
    return;
  }

  try {
    await updateCalendarColor(username!, password!, davisBaseUrl!, calendarUrl, color);
    invalidateUser(username!); // color changed — drop cached calendar list
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Failed to update calendar color:', err?.message || err);
    res.status(502).json({ error: 'Failed to update calendar color' });
  }
});

export default router;
