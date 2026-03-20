// SPDX-License-Identifier: GPL-3.0-or-later
import { Router, Request, Response } from 'express';
import { fetchTasks, createTask, updateTask, deleteTask } from '../services/caldav.js';
import { requireSession } from '../middleware/session.js';
import { CreateTaskBody, UpdateTaskBody } from '../types/index.js';

const router = Router();

// GET /api/tasks?calendarUrl=...
router.get('/', requireSession, async (req: Request, res: Response) => {
  const { calendarUrl } = req.query as { calendarUrl?: string };
  const { username, password, davisBaseUrl } = req.session;

  if (!calendarUrl) {
    res.status(400).json({ error: 'calendarUrl is required' });
    return;
  }

  try {
    const tasks = await fetchTasks(username!, password!, davisBaseUrl!, calendarUrl);
    res.json(tasks);
  } catch (err: any) {
    console.error('Failed to fetch tasks:', err?.message || err);
    res.status(502).json({ error: 'Failed to fetch tasks from Davis' });
  }
});

// POST /api/tasks
router.post('/', requireSession, async (req: Request, res: Response) => {
  const { username, password, davisBaseUrl } = req.session;
  const body = req.body as CreateTaskBody;

  if (!body.calendarUrl || !body.title) {
    res.status(400).json({ error: 'calendarUrl and title are required' });
    return;
  }

  try {
    const task = await createTask(username!, password!, davisBaseUrl!, body);
    res.status(201).json(task);
  } catch (err: any) {
    console.error('Failed to create task:', err?.message || err);
    res.status(502).json({ error: 'Failed to create task in Davis' });
  }
});

// PUT /api/tasks/:uid
router.put('/:uid', requireSession, async (req: Request, res: Response) => {
  const { username, password, davisBaseUrl } = req.session;
  const body = req.body as UpdateTaskBody;
  body.uid = req.params.uid;

  if (!body.taskUrl || !body.calendarUrl || !body.title) {
    res.status(400).json({ error: 'taskUrl, calendarUrl, and title are required' });
    return;
  }

  try {
    await updateTask(username!, password!, davisBaseUrl!, body);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Failed to update task:', err?.message || err);
    res.status(502).json({ error: 'Failed to update task in Davis' });
  }
});

// DELETE /api/tasks/:uid?taskUrl=...
router.delete('/:uid', requireSession, async (req: Request, res: Response) => {
  const { username, password, davisBaseUrl } = req.session;
  const { taskUrl, etag } = req.query as { taskUrl?: string; etag?: string };

  if (!taskUrl) {
    res.status(400).json({ error: 'taskUrl query param is required' });
    return;
  }

  try {
    await deleteTask(username!, password!, davisBaseUrl!, taskUrl, etag);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Failed to delete task:', err?.message || err);
    res.status(502).json({ error: 'Failed to delete task in Davis' });
  }
});

export default router;
