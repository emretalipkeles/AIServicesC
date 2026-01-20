import { ClassifiedIntent } from '../value-objects/ClassifiedIntent';
import type { CommandDescriptor } from '../value-objects/CommandDescriptor';

export interface IIntentClassifier {
  classify(
    message: string,
    availableCommands: CommandDescriptor[]
  ): Promise<ClassifiedIntent>;
}
