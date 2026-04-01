import { BaseCommand } from '../../interfaces/ICommandBus';

export class LoginCommand extends BaseCommand {
  readonly type = 'LoginCommand' as const;
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {
    super();
  }
}
