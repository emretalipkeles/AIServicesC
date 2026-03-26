import type { ICommandHandler } from '../../../interfaces/ICommandBus';
import type { LoginCommand } from '../LoginCommand';
import type { IUserRepository } from '../../../../domain/auth/interfaces/IUserRepository';
import type { IPasswordHasher } from '../../../../domain/auth/interfaces/IPasswordHasher';
import type { UserDto } from '../../dto/UserDto';

export class LoginCommandHandler implements ICommandHandler<LoginCommand, UserDto> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
  ) {}

  async handle(command: LoginCommand): Promise<UserDto> {
    const user = await this.userRepository.findByEmail(command.email);
    if (!user) {
      throw new LoginError('Invalid email or password');
    }

    const isValid = await this.passwordHasher.compare(command.password, user.password);
    if (!isValid) {
      throw new LoginError('Invalid email or password');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginError';
  }
}
