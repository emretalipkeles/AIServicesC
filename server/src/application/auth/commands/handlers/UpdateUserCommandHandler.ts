import type { ICommandHandler } from '../../../interfaces/ICommandBus';
import type { UpdateUserCommand } from '../UpdateUserCommand';
import type { IUserRepository } from '../../../../domain/auth/interfaces/IUserRepository';
import type { IPasswordHasher } from '../../../../domain/auth/interfaces/IPasswordHasher';
import type { UserDto } from '../../dto/UserDto';

export class UpdateUserCommandHandler implements ICommandHandler<UpdateUserCommand, UserDto> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
  ) {}

  async handle(command: UpdateUserCommand): Promise<UserDto> {
    const existing = await this.userRepository.findById(command.userId);
    if (!existing) {
      throw new Error('User not found');
    }

    if (command.email && command.email !== existing.email) {
      const emailTaken = await this.userRepository.findByEmail(command.email);
      if (emailTaken) {
        throw new Error('A user with this email already exists');
      }
    }

    const updateData: Record<string, string> = {};
    if (command.email) updateData.email = command.email;
    if (command.name) updateData.name = command.name;
    if (command.role) updateData.role = command.role;
    if (command.password) {
      updateData.password = await this.passwordHasher.hash(command.password);
    }

    const updated = await this.userRepository.update(command.userId, updateData);
    if (!updated) {
      throw new Error('Failed to update user');
    }

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
