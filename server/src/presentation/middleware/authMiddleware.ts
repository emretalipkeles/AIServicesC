import type { Request, Response, NextFunction } from 'express';
import type { IUserRepository } from '../../domain/auth/interfaces/IUserRepository';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    userRole: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

export function createRequireAdmin(userRepository: IUserRepository) {
  return async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!req.session?.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const user = await userRepository.findById(req.session.userId);
    if (!user || user.role !== 'admin') {
      if (!user) {
        req.session.destroy(() => {});
      }
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    req.session.userRole = user.role;
    next();
  };
}
