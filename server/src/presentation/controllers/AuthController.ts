import type { Request, Response } from 'express';
import type { IUserRepository } from '../../domain/auth/interfaces/IUserRepository';
import type { IPasswordHasher } from '../../domain/auth/interfaces/IPasswordHasher';
import { LoginCommandHandler, LoginError } from '../../application/auth/commands/handlers/LoginCommandHandler';
import { CreateUserCommandHandler } from '../../application/auth/commands/handlers/CreateUserCommandHandler';
import { UpdateUserCommandHandler } from '../../application/auth/commands/handlers/UpdateUserCommandHandler';
import { DeleteUserCommandHandler } from '../../application/auth/commands/handlers/DeleteUserCommandHandler';
import { ListUsersQueryHandler } from '../../application/auth/queries/handlers/ListUsersQueryHandler';
import { GetCurrentUserQueryHandler } from '../../application/auth/queries/handlers/GetCurrentUserQueryHandler';
import { LoginCommand } from '../../application/auth/commands/LoginCommand';
import { CreateUserCommand } from '../../application/auth/commands/CreateUserCommand';
import { UpdateUserCommand } from '../../application/auth/commands/UpdateUserCommand';
import { DeleteUserCommand } from '../../application/auth/commands/DeleteUserCommand';
import { ListUsersQuery } from '../../application/auth/queries/ListUsersQuery';
import { GetCurrentUserQuery } from '../../application/auth/queries/GetCurrentUserQuery';
import { LoginRateLimiter } from '../../infrastructure/auth/LoginRateLimiter';
import { loginSchema, createUserSchema, updateUserSchema } from '../validators/authValidators';

export class AuthController {
  private loginHandler: LoginCommandHandler;
  private createUserHandler: CreateUserCommandHandler;
  private updateUserHandler: UpdateUserCommandHandler;
  private deleteUserHandler: DeleteUserCommandHandler;
  private listUsersHandler: ListUsersQueryHandler;
  private getCurrentUserHandler: GetCurrentUserQueryHandler;
  private rateLimiter: LoginRateLimiter;

  constructor(
    userRepository: IUserRepository,
    passwordHasher: IPasswordHasher,
    rateLimiter: LoginRateLimiter,
  ) {
    this.loginHandler = new LoginCommandHandler(userRepository, passwordHasher);
    this.createUserHandler = new CreateUserCommandHandler(userRepository, passwordHasher);
    this.updateUserHandler = new UpdateUserCommandHandler(userRepository, passwordHasher);
    this.deleteUserHandler = new DeleteUserCommandHandler(userRepository);
    this.listUsersHandler = new ListUsersQueryHandler(userRepository);
    this.getCurrentUserHandler = new GetCurrentUserQueryHandler(userRepository);
    this.rateLimiter = rateLimiter;
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors[0].message });
        return;
      }

      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const rateCheck = this.rateLimiter.check(ip);
      if (!rateCheck.allowed) {
        const retryAfterSec = Math.ceil((rateCheck.retryAfterMs || 0) / 1000);
        res.status(429).json({
          error: 'Too many login attempts. Please try again later.',
          retryAfterSeconds: retryAfterSec,
        });
        return;
      }

      const command = new LoginCommand(parsed.data.email, parsed.data.password);
      const user = await this.loginHandler.handle(command);

      this.rateLimiter.recordSuccess(ip);

      req.session.regenerate((err) => {
        if (err) {
          res.status(500).json({ error: 'Session error' });
          return;
        }
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.save((saveErr) => {
          if (saveErr) {
            res.status(500).json({ error: 'Session save error' });
            return;
          }
          res.json({ user });
        });
      });
    } catch (error) {
      if (error instanceof LoginError) {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        this.rateLimiter.recordFailure(ip);
        res.status(401).json({ error: error.message });
        return;
      }
      console.error('[Auth] Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ error: 'Logout failed' });
        return;
      }
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  }

  async getCurrentUser(req: Request, res: Response): Promise<void> {
    try {
      if (!req.session?.userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const query = new GetCurrentUserQuery(req.session.userId);
      const user = await this.getCurrentUserHandler.handle(query);
      if (!user) {
        req.session.destroy(() => {});
        res.status(401).json({ error: 'User not found' });
        return;
      }
      res.json({ user });
    } catch (error) {
      console.error('[Auth] Get current user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async listUsers(_req: Request, res: Response): Promise<void> {
    try {
      const query = new ListUsersQuery();
      const users = await this.listUsersHandler.handle(query);
      res.json({ users });
    } catch (error) {
      console.error('[Auth] List users error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async createUser(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors[0].message });
        return;
      }

      const command = new CreateUserCommand(
        parsed.data.email,
        parsed.data.name,
        parsed.data.password,
        parsed.data.role,
      );
      const user = await this.createUserHandler.handle(command);
      res.status(201).json({ user });
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        res.status(409).json({ error: error.message });
        return;
      }
      console.error('[Auth] Create user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateUser(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors[0].message });
        return;
      }

      const command = new UpdateUserCommand(
        req.params.id,
        parsed.data.email,
        parsed.data.name,
        parsed.data.password,
        parsed.data.role,
      );
      const user = await this.updateUserHandler.handle(command);
      res.json({ user });
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error.message?.includes('already exists')) {
        res.status(409).json({ error: error.message });
        return;
      }
      console.error('[Auth] Update user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      if (req.session?.userId === req.params.id) {
        res.status(400).json({ error: 'Cannot delete your own account' });
        return;
      }

      const command = new DeleteUserCommand(req.params.id);
      await this.deleteUserHandler.handle(command);
      res.json({ success: true });
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      console.error('[Auth] Delete user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
