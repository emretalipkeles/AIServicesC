import { BaseCommand } from '../../interfaces/ICommandBus';

export class UpdateUserCommand extends BaseCommand {
  readonly type = 'UpdateUserCommand' as const;
  constructor(
    public readonly userId: string,
    public readonly email?: string,
    public readonly name?: string,
    public readonly password?: string,
    public readonly role?: string,
  ) {
    super();
  }
}
