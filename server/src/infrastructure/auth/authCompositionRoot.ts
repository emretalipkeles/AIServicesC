import { DrizzleUserRepository } from './DrizzleUserRepository';
import { BcryptPasswordHasher } from './BcryptPasswordHasher';
import type { IUserRepository } from '../../domain/auth/interfaces/IUserRepository';
import type { IPasswordHasher } from '../../domain/auth/interfaces/IPasswordHasher';

export interface AuthDependencies {
  userRepository: IUserRepository;
  passwordHasher: IPasswordHasher;
}

let instance: AuthDependencies | null = null;

export function createAuthDependencies(): AuthDependencies {
  if (!instance) {
    instance = {
      userRepository: new DrizzleUserRepository(),
      passwordHasher: new BcryptPasswordHasher(),
    };
  }
  return instance;
}
