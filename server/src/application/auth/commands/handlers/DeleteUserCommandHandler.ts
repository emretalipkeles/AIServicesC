import type { ICommandHandler } from '../../../interfaces/ICommandBus';
import type { DeleteUserCommand } from '../DeleteUserCommand';
import type { IUserRepository } from '../../../../domain/auth/interfaces/IUserRepository';

export class DeleteUserCommandHandler implements ICommandHandler<DeleteUserCommand, void> {
  constructor(
    private readonly userRepository: IUserRepository,
  ) {}

  async handle(command: DeleteUserCommand): Promise<void> {
    const user = await this.userRepository.findById(command.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const deleted = await this.userRepository.delete(command.userId);
    if (!deleted) {
      throw new Error('Failed to delete user');
    }
  }
}
