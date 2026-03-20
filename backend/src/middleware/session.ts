// SPDX-License-Identifier: GPL-3.0-or-later
import { Request, Response, NextFunction } from 'express';

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.username || !req.session?.password) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  next();
}
