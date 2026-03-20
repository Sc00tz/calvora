// SPDX-License-Identifier: GPL-3.0-or-later
import { Router, Request, Response } from 'express';
import { verifyCredentials } from '../services/caldav.js';

const router = Router();
const DAVIS_BASE_URL = process.env.DAVIS_BASE_URL || 'http://localhost:8091/dav';

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  try {
    const valid = await verifyCredentials(username, password, DAVIS_BASE_URL);
    if (!valid) {
      console.warn(`Login failed for user ${username} at ${DAVIS_BASE_URL} (invalid credentials)`);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    req.session.username = username;
    req.session.password = password;
    req.session.davisBaseUrl = DAVIS_BASE_URL;

    res.json({ username });
  } catch (err: any) {
    console.error('Login error:', err.message || err);
    res.status(500).json({ error: 'An internal error occurred during login' });
  }
});


router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to destroy session' });
      return;
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req: Request, res: Response) => {
  if (!req.session?.username) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json({ username: req.session.username });
});

export default router;
