import type { Express } from 'express';
import { AuthController } from '../controllers/AuthController';
import type { AuthControllerDeps } from '../controllers/AuthController';
import { requireAuth, createRequireAdmin } from '../middleware/authMiddleware';
import type { IUserRepository } from '../../domain/auth/interfaces/IUserRepository';

export function registerAuthRoutes(
  app: Express,
  controllerDeps: AuthControllerDeps,
  userRepository: IUserRepository,
): void {
  const controller = new AuthController(controllerDeps);
  const requireAdmin = createRequireAdmin(userRepository);

  app.post('/api/auth/login', (req, res) => controller.login(req, res));
  app.post('/api/auth/logout', (req, res) => controller.logout(req, res));
  app.get('/api/auth/me', (req, res) => controller.getCurrentUser(req, res));
  app.post('/api/auth/change-password', requireAuth, (req, res) => controller.changePassword(req, res));

  app.get('/api/users', requireAuth, requireAdmin, (req, res) => controller.listUsers(req, res));
  app.post('/api/users', requireAuth, requireAdmin, (req, res) => controller.createUser(req, res));
  app.put('/api/users/:id', requireAuth, requireAdmin, (req, res) => controller.updateUser(req, res));
  app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => controller.deleteUser(req, res));
}
