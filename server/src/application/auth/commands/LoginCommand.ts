import { BaseCommand } from '../../interfaces/ICommandBus';

export class LoginCommand extends BaseCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {
    super();
  }
}
