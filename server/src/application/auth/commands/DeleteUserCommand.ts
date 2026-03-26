import { BaseCommand } from '../../interfaces/ICommandBus';

export class DeleteUserCommand extends BaseCommand {
  constructor(
    public readonly userId: string,
  ) {
    super();
  }
}
