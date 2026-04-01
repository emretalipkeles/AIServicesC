import { BaseCommand } from '../../interfaces/ICommandBus';

export class DeleteUserCommand extends BaseCommand {
  readonly type = 'DeleteUserCommand' as const;
  constructor(
    public readonly userId: string,
  ) {
    super();
  }
}
