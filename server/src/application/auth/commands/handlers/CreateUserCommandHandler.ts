import type { ICommandHandler } from '../../../interfaces/ICommandBus';
import type { CreateUserCommand } from '../CreateUserCommand';
import type { IUserRepository } from '../../../../domain/auth/interfaces/IUserRepository';
import type { IPasswordHasher } from '../../../../domain/auth/interfaces/IPasswordHasher';
import type { UserDto } from '../../dto/UserDto';

export class CreateUserCommandHandler implements ICommandHandler<CreateUserCommand, UserDto> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
  ) {}

  async handle(command: CreateUserCommand): Promise<UserDto> {
    const existing = await this.userRepository.findByEmail(command.email);
    if (existing) {
      throw new Error('A user with this email already exists');
    }

    const hashedPassword = await this.passwordHasher.hash(command.password);

    const user = await this.userRepository.create({
      email: command.email,
      name: command.name,
      password: hashedPassword,
      role: command.role,
    });

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
