import type { 
  IPretFileLocator, 
  IPretFileReader, 
  IFileContextRepository,
  PackageAnalysisData,
  FileLocationResult,
  FileLocationMatch,
  PretObjectTypeName
} from '../../../domain/pret';
import { FileContext } from '../../../domain/pret';

export interface LoadContextRequest {
  readonly conversationId: string;
  readonly tenantId: string;
  readonly packageId: string;
  readonly userIntent: string;
  readonly packageAnalysis: PackageAnalysisData;
}

export interface LoadContextResult {
  readonly success: boolean;
  readonly fileContext?: FileContext;
  readonly locationResult?: FileLocationResult;
  readonly error?: string;
  readonly clarificationNeeded?: string;
}

export interface LoadMultipleContextsRequest {
  readonly conversationId: string;
  readonly tenantId: string;
  readonly packageId: string;
  readonly modelName: string;
  readonly packageAnalysis: PackageAnalysisData;
}

export interface LoadMultipleContextsResult {
  readonly success: boolean;
  readonly fileContexts: FileContext[];
  readonly filesLoaded: string[];
  readonly filesSkipped: string[];
  readonly modelName: string;
  readonly error?: string;
}

export class PretContextService {
  constructor(
    private readonly fileLocator: IPretFileLocator,
    private readonly fileReader: IPretFileReader,
    private readonly contextRepository: IFileContextRepository
  ) {}

  async loadContext(request: LoadContextRequest): Promise<LoadContextResult> {
    const locationResult = await this.fileLocator.locate(
      request.userIntent,
      request.packageAnalysis
    );

    if (!locationResult.found) {
      if (locationResult.clarificationNeeded) {
        return {
          success: false,
          locationResult,
          clarificationNeeded: locationResult.clarificationNeeded,
        };
      }
      return {
        success: false,
        locationResult,
        error: 'Could not locate the requested file',
      };
    }

    if (locationResult.ambiguousMatches && locationResult.ambiguousMatches.length > 1) {
      return {
        success: false,
        locationResult,
        clarificationNeeded: this.buildAmbiguityMessage(locationResult.ambiguousMatches),
      };
    }

    const existingContext = await this.contextRepository.findByKey({
      conversationId: request.conversationId,
      filePath: locationResult.filePath!,
    });

    if (existingContext) {
      return {
        success: true,
        fileContext: existingContext,
        locationResult,
      };
    }

    const readResult = await this.fileReader.readFile(
      request.tenantId,
      request.packageId,
      locationResult.filePath!
    );

    if (!readResult.success) {
      return {
        success: false,
        locationResult,
        error: readResult.error || 'Failed to read file',
      };
    }

    const fileContext = FileContext.create({
      conversationId: request.conversationId,
      tenantId: request.tenantId,
      packageId: request.packageId,
      filePath: locationResult.filePath!,
      objectType: locationResult.objectType!,
      objectName: locationResult.objectName!,
      modelName: locationResult.modelName,
      fullContent: readResult.isLargeFile ? undefined : readResult.fullContent,
      summary: readResult.summary || this.buildDefaultSummary(readResult),
      memberCount: readResult.memberCount || 0,
      hasCalculations: readResult.hasCalculations || false,
      isLargeFile: readResult.isLargeFile,
      totalBytes: readResult.totalBytes,
      loadedAt: new Date(),
    });

    await this.contextRepository.save(fileContext);

    return {
      success: true,
      fileContext,
      locationResult,
    };
  }

  async getContext(
    conversationId: string,
    filePath?: string
  ): Promise<FileContext | FileContext[] | null> {
    if (filePath) {
      return this.contextRepository.findByKey({ conversationId, filePath });
    }
    return this.contextRepository.findByConversation(conversationId);
  }

  async hasContext(conversationId: string, filePath: string): Promise<boolean> {
    return this.contextRepository.exists({ conversationId, filePath });
  }

  async loadMultipleContexts(request: LoadMultipleContextsRequest): Promise<LoadMultipleContextsResult> {
    const locationResult = this.fileLocator.locateAllForModel(
      request.modelName,
      request.packageAnalysis
    );

    if (!locationResult.found || locationResult.files.length === 0) {
      return {
        success: false,
        fileContexts: [],
        filesLoaded: [],
        filesSkipped: [],
        modelName: request.modelName,
        error: locationResult.error || `No dimensions found for model "${request.modelName}".`,
      };
    }

    const fileContexts: FileContext[] = [];
    const filesLoaded: string[] = [];
    const filesSkipped: string[] = [];

    for (const file of locationResult.files) {
      try {
        const existingContext = await this.contextRepository.findByKey({
          conversationId: request.conversationId,
          filePath: file.filePath,
        });

        if (existingContext) {
          fileContexts.push(existingContext);
          filesLoaded.push(file.objectName);
          continue;
        }

        const readResult = await this.fileReader.readFile(
          request.tenantId,
          request.packageId,
          file.filePath
        );

        if (!readResult.success) {
          filesSkipped.push(`${file.objectName} (read error)`);
          continue;
        }

        const fileContext = FileContext.create({
          conversationId: request.conversationId,
          tenantId: request.tenantId,
          packageId: request.packageId,
          filePath: file.filePath,
          objectType: file.objectType,
          objectName: file.objectName,
          modelName: file.modelName,
          fullContent: readResult.isLargeFile ? undefined : readResult.fullContent,
          summary: readResult.summary || this.buildDefaultSummary(readResult),
          memberCount: readResult.memberCount || 0,
          hasCalculations: readResult.hasCalculations || false,
          isLargeFile: readResult.isLargeFile,
          totalBytes: readResult.totalBytes,
          loadedAt: new Date(),
        });

        await this.contextRepository.save(fileContext);
        fileContexts.push(fileContext);
        filesLoaded.push(file.objectName);
      } catch (error) {
        filesSkipped.push(`${file.objectName} (error: ${error instanceof Error ? error.message : 'unknown'})`);
      }
    }

    return {
      success: filesLoaded.length > 0,
      fileContexts,
      filesLoaded,
      filesSkipped,
      modelName: request.modelName,
    };
  }

  private buildAmbiguityMessage(matches: { objectName: string; objectType: string; modelName?: string }[]): string {
    const options = matches
      .map((m, i) => `${i + 1}. ${m.objectName} (${m.objectType})${m.modelName ? ` in ${m.modelName}` : ''}`)
      .join('\n');
    return `Multiple files match your request. Please specify which one:\n${options}`;
  }

  private buildDefaultSummary(readResult: { fullContent?: string; memberCount?: number }): string {
    if (readResult.fullContent) {
      const lines = readResult.fullContent.split('\n').slice(0, 50);
      return lines.join('\n') + (readResult.fullContent.split('\n').length > 50 ? '\n...[truncated]' : '');
    }
    return `File contains ${readResult.memberCount || 0} members.`;
  }
}
