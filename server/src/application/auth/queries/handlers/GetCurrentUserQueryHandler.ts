import type { IQueryHandler } from '../../../interfaces/IQueryBus';
import type { GetCurrentUserQuery } from '../GetCurrentUserQuery';
import type { IUserRepository } from '../../../../domain/auth/interfaces/IUserRepository';
import type { UserDto } from '../../dto/UserDto';

export class GetCurrentUserQueryHandler implements IQueryHandler<GetCurrentUserQuery, UserDto | null> {
  constructor(
    private readonly userRepository: IUserRepository,
  ) {}

  async handle(query: GetCurrentUserQuery): Promise<UserDto | null> {
    const user = await this.userRepository.findById(query.userId);
    if (!user) return null;

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
