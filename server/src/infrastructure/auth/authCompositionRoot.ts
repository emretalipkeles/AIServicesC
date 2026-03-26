import { DrizzleUserRepository } from './DrizzleUserRepository';
import { BcryptPasswordHasher } from './BcryptPasswordHasher';
import { LoginRateLimiter } from './LoginRateLimiter';
import { LoginCommandHandler } from '../../application/auth/commands/handlers/LoginCommandHandler';
import { CreateUserCommandHandler } from '../../application/auth/commands/handlers/CreateUserCommandHandler';
import { UpdateUserCommandHandler } from '../../application/auth/commands/handlers/UpdateUserCommandHandler';
import { DeleteUserCommandHandler } from '../../application/auth/commands/handlers/DeleteUserCommandHandler';
import { ListUsersQueryHandler } from '../../application/auth/queries/handlers/ListUsersQueryHandler';
import { GetCurrentUserQueryHandler } from '../../application/auth/queries/handlers/GetCurrentUserQueryHandler';
import type { IUserRepository } from '../../domain/auth/interfaces/IUserRepository';
import type { IPasswordHasher } from '../../domain/auth/interfaces/IPasswordHasher';
import type { AuthControllerDeps } from '../../presentation/controllers/AuthController';

export interface AuthDependencies {
  userRepository: IUserRepository;
  passwordHasher: IPasswordHasher;
  controllerDeps: AuthControllerDeps;
}

let instance: AuthDependencies | null = null;

export function createAuthDependencies(): AuthDependencies {
  if (!instance) {
    const userRepository = new DrizzleUserRepository();
    const passwordHasher = new BcryptPasswordHasher();
    const rateLimiter = new LoginRateLimiter();

    instance = {
      userRepository,
      passwordHasher,
      controllerDeps: {
        loginHandler: new LoginCommandHandler(userRepository, passwordHasher),
        createUserHandler: new CreateUserCommandHandler(userRepository, passwordHasher),
        updateUserHandler: new UpdateUserCommandHandler(userRepository, passwordHasher),
        deleteUserHandler: new DeleteUserCommandHandler(userRepository),
        listUsersHandler: new ListUsersQueryHandler(userRepository),
        getCurrentUserHandler: new GetCurrentUserQueryHandler(userRepository),
        rateLimiter,
      },
    };
  }
  return instance;
}
