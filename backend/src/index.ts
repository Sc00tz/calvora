// SPDX-License-Identifier: GPL-3.0-or-later
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';
import path from 'path';

import authRouter from './routes/auth.js';
import calendarsRouter from './routes/calendars.js';
import eventsRouter from './routes/events.js';
import tasksRouter from './routes/tasks.js';
import contactsRouter from './routes/contacts.js';
import subscriptionsRouter from './routes/subscriptions.js';


const FileStore = FileStoreFactory(session);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS — allow frontend dev server and same-origin prod
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));

app.use(session({
  store: new FileStore({
    path: process.env.SESSION_PATH || './sessions',
    ttl: 7 * 24 * 60 * 60, // 7 days in seconds
    retries: 0,
    logFn: () => {},        // suppress verbose file-store logging
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/calendars', calendarsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/subscriptions', subscriptionsRouter);


// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Help config — exposes the public DAVx5 server URL to the frontend
app.get('/api/help/config', (_req, res) => {
  res.json({ davx5ServerUrl: process.env.DAVX5_SERVER_URL || '' });
});

// Serve React frontend in production (files copied into dist/public by Docker build)
if (NODE_ENV === 'production') {
  const staticDir = path.join(__dirname, 'public');
  app.use(express.static(staticDir));
  // SPA fallback — all non-API routes return index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Calvora running on port ${PORT}`);
  console.log(`Davis URL: ${process.env.DAVIS_BASE_URL || 'http://localhost:8091/dav'}`);
});

export default app;
