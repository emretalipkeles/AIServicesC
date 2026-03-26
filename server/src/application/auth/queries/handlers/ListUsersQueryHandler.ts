import type { IQueryHandler } from '../../../interfaces/IQueryBus';
import type { ListUsersQuery } from '../ListUsersQuery';
import type { IUserRepository } from '../../../../domain/auth/interfaces/IUserRepository';
import type { UserDto } from '../../dto/UserDto';

export class ListUsersQueryHandler implements IQueryHandler<ListUsersQuery, UserDto[]> {
  constructor(
    private readonly userRepository: IUserRepository,
  ) {}

  async handle(_query: ListUsersQuery): Promise<UserDto[]> {
    const users = await this.userRepository.findAll();
    return users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
  }
}
