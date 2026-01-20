import type { IFileContextRepository, FileContext } from '../../../domain/pret';
import type { GetFileContextQuery, IGetFileContextQueryHandler } from '../queries/GetFileContextQuery';

export class GetFileContextQueryHandler implements IGetFileContextQueryHandler {
  constructor(private readonly contextRepository: IFileContextRepository) {}

  async handle(query: GetFileContextQuery): Promise<FileContext | FileContext[] | null> {
    if (query.filePath) {
      return this.contextRepository.findByKey({
        conversationId: query.conversationId,
        filePath: query.filePath,
      });
    }
    return this.contextRepository.findByConversation(query.conversationId);
  }
}
