import { BaseCommand } from '../../interfaces/ICommandBus';

export class CreateUserCommand extends BaseCommand {
  readonly type = 'CreateUserCommand' as const;
  constructor(
    public readonly email: string,
    public readonly name: string,
    public readonly password: string,
    public readonly role: string = 'user',
  ) {
    super();
  }
}
