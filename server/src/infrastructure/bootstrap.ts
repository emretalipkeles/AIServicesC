import { InMemoryCommandBus } from "./messaging/InMemoryCommandBus";
import { InMemoryQueryBus } from "./messaging/InMemoryQueryBus";
import { bedrockClientProvider } from "./ai/AIClientProvider";
import { aiClientFactory } from "./ai/AIClientFactory";
import { ModelId } from "../domain/value-objects/ModelId";
import { DrizzleAgentRepository } from "./database/repositories/DrizzleAgentRepository";
import { DrizzleDocumentRepository } from "./database/repositories/DrizzleDocumentRepository";
import { DrizzleChunkRepository } from "./database/repositories/DrizzleChunkRepository";
import { DrizzleStructuredOutputRepository } from "./database/repositories/DrizzleStructuredOutputRepository";
import { PostgresProcessingSessionRepository } from "./database/repositories/PostgresProcessingSessionRepository";
import { DrizzleConversationRepository } from "./database/repositories/DrizzleConversationRepository";
import { DocumentProcessor } from "./documents/DocumentProcessor";
import { AIDocumentExtractionService } from "./documents/AIDocumentExtractionService";
import { DocumentUnderstandingService } from "./documents/DocumentUnderstandingService";
import { AgentDiscoveryService } from "./orchestration/AgentDiscoveryService";
import { OrchestrationPlanner } from "./orchestration/OrchestrationPlanner";
import { AgentExecutor } from "./orchestration/AgentExecutor";
import { ResponseSynthesizer } from "./orchestration/ResponseSynthesizer";
import { FallbackResponseGenerator } from "./orchestration/FallbackResponseGenerator";
import { AIConversationSummarizer } from "./orchestration/AIConversationSummarizer";
import { PretToolRegistry } from "./pret/PretToolRegistry";
import { PretOrchestrator } from "../application/pret/services/PretOrchestrator";
import { InMemoryBuildContextRepository } from "./pret/repositories/InMemoryBuildContextRepository";
import { InMemoryFileContextRepository } from "./pret/repositories/InMemoryFileContextRepository";
import { PackageAnalysisPretFileLocator } from "./pret/locators/PackageAnalysisPretFileLocator";
import { ChunkedS3PretFileReader } from "./pret/readers/ChunkedS3PretFileReader";
import { S3PretPackageStorage } from "./pret/storage/S3PretPackageStorage";
import { PretContextService } from "../application/pret/services/PretContextService";
import { InMemoryPretPackageSessionRepository } from "./pret/repositories/InMemoryPretPackageSessionRepository";
import { InMemoryConversationContextRepository } from "./orchestration/repositories/InMemoryConversationContextRepository";
import { ImportPretPackageHandler } from "../application/pret/handlers/ImportPretPackageHandler";
import { GetPretPackageHandler } from "../application/pret/handlers/GetPretPackageHandler";
import { AnalyzePackageHandler } from "../application/pret/handlers/AnalyzePackageHandler";
import { GetDimensionMembersHandler } from "../application/pret/handlers/GetDimensionMembersHandler";
import { YauzlPackageAnalyzer } from "./pret/analyzers/YauzlPackageAnalyzer";
import { YamlDimensionMemberReader } from "./pret/readers/YamlDimensionMemberReader";
import type { IPackageAnalyzer } from "../domain/pret/interfaces/IPackageAnalyzer";
import type { IDimensionMemberReader } from "../domain/pret/interfaces/IDimensionMemberReader";
import { UpdateConversationContextHandler } from "../application/orchestration/handlers/UpdateConversationContextHandler";
import { NarrateUploadResultHandler } from "../application/orchestration/handlers/NarrateUploadResultHandler";
import { StreamNarrateUploadResultHandler } from "../application/orchestration/handlers/StreamNarrateUploadResultHandler";
import { AIUploadNarrator } from "./orchestration/narrators/AIUploadNarrator";
import type { IUploadNarrator } from "../domain/orchestration/interfaces/IUploadNarrator";
import type { IPretToolRegistry } from "../domain/pret/interfaces/IPretToolRegistry";
import type { IBuildContextRepository } from "../domain/pret/interfaces/IBuildContextRepository";
import type { IFileContextRepository } from "../domain/pret/interfaces/IFileContextRepository";
import type { IPackageAnalysisCache } from "../domain/pret";
import { InMemoryPackageAnalysisCache } from "./pret/cache/InMemoryPackageAnalysisCache";
import type { IPretFileLocator } from "../domain/pret/interfaces/IPretFileLocator";
import type { IPretFileReader } from "../domain/pret/interfaces/IPretFileReader";
import type { IPretPackageStorage } from "../domain/pret/interfaces/IPretPackageStorage";
import type { IPretPackageSessionRepository } from "../domain/pret/interfaces/IPretPackageSessionRepository";
import type { IConversationContextRepository } from "../domain/orchestration/interfaces/IConversationContextRepository";
import { SendChatCommandHandler } from "../application/commands/handlers/SendChatCommandHandler";
import { StreamChatCommandHandler } from "../application/commands/handlers/StreamChatCommandHandler";
import { CreateAgentCommandHandler } from "../application/commands/handlers/CreateAgentCommandHandler";
import { UpdateAgentCommandHandler } from "../application/commands/handlers/UpdateAgentCommandHandler";
import { DeleteAgentCommandHandler } from "../application/commands/handlers/DeleteAgentCommandHandler";
import { UploadDocumentCommandHandler } from "../application/commands/handlers/UploadDocumentCommandHandler";
import { UploadDocumentFileCommandHandler } from "../application/commands/handlers/UploadDocumentFileCommandHandler";
import { DeleteDocumentCommandHandler } from "../application/commands/handlers/DeleteDocumentCommandHandler";
import { ReindexAgentCommandHandler } from "../application/commands/handlers/ReindexAgentCommandHandler";
import { ChatWithAgentCommandHandler } from "../application/commands/handlers/ChatWithAgentCommandHandler";
import { StreamChatWithAgentCommandHandler } from "../application/commands/handlers/StreamChatWithAgentCommandHandler";
import { SaveStructuredOutputCommandHandler } from "../application/commands/handlers/SaveStructuredOutputCommandHandler";
import { OrchestrateCommandHandler } from "../application/commands/handlers/OrchestrateCommandHandler";
import { TestConnectionQueryHandler } from "../application/queries/handlers/TestConnectionQueryHandler";
import { GetAgentQueryHandler } from "../application/queries/handlers/GetAgentQueryHandler";
import { ListAgentsQueryHandler } from "../application/queries/handlers/ListAgentsQueryHandler";
import { ListAgentDocumentsQueryHandler } from "../application/queries/handlers/ListAgentDocumentsQueryHandler";
import type { IAgentRepository } from "../domain/repositories/IAgentRepository";
import type { IDocumentRepository } from "../domain/repositories/IDocumentRepository";
import type { IChunkRepository } from "../domain/repositories/IChunkRepository";
import type { IStructuredOutputRepository } from "../domain/repositories/IStructuredOutputRepository";
import type { IProcessingSessionRepository } from "../domain/repositories/IProcessingSessionRepository";
import type { IConversationRepository } from "../domain/interfaces/IConversationRepository";
import type { IConversationSummarizer } from "../domain/interfaces/IConversationSummarizer";
import type { ISessionMemoryRepository } from "../domain/interfaces/ISessionMemoryRepository";
import type { ICommandBus } from "../application/interfaces/ICommandBus";
import type { IQueryBus } from "../application/interfaces/IQueryBus";
import { InMemorySessionMemoryRepository } from "./repositories/InMemorySessionMemoryRepository";
import type { IPretCommandRegistry } from "../domain/pret";
import { PretCommandRegistry } from "./pret/commands/PretCommandRegistry";
import { PretCommandExecutor } from "../application/pret/services/PretCommandExecutor";
import { ListModelsCommandHandler } from "../application/pret/handlers/pret-command-handlers/ListModelsCommandHandler";
import { GetCubeDetailsCommandHandler } from "../application/pret/handlers/pret-command-handlers/GetCubeDetailsCommandHandler";
import { ListDimensionsCommandHandler } from "../application/pret/handlers/pret-command-handlers/ListDimensionsCommandHandler";
import { GetDimensionDetailsCommandHandler } from "../application/pret/handlers/pret-command-handlers/GetDimensionDetailsCommandHandler";
import { CreateOtherDimensionCommandHandler } from "../application/pret/handlers/pret-command-handlers/CreateOtherDimensionCommandHandler";
import { SchemaValidator } from "./pret/validators/SchemaValidator";
import { AIIntentClassifier } from "./pret/classifiers/AIIntentClassifier";
import { PRET_COMMAND_DESCRIPTORS } from "./pret/classifiers/PretCommandDescriptors";
import { AIPretResponseNarrator } from "./pret/narrators/AIPretResponseNarrator";
import type { IIntentClassifier, IResponseNarrator } from "../domain/pret";
import { DocumentParserFactory } from "./document-parsing/DocumentParserFactory";
import type { IDocumentParserFactory } from "../domain/delay-analysis/interfaces/IDocumentParserFactory";
import { ExcelScheduleParserV2 } from "./document-parsing/ExcelScheduleParserV2";
import { PdfScheduleParser } from "./document-parsing/PdfScheduleParser";
import { ScheduleParserFactory } from "./document-parsing/ScheduleParserFactory";
import type { IScheduleParserFactory } from "../domain/delay-analysis/interfaces/IScheduleParserFactory";
import { AIDelayEventExtractor } from "./delay-analysis/AIDelayEventExtractor";
import { AIActivityMatcher } from "./delay-analysis/AIActivityMatcher";
import type { IDelayEventExtractor } from "../domain/delay-analysis/interfaces/IDelayEventExtractor";
import type { IActivityMatcher } from "../domain/delay-analysis/interfaces/IActivityMatcher";

import { DrizzleDelayAnalysisProjectRepository } from "./database/repositories/delay-analysis/DrizzleDelayAnalysisProjectRepository";
import { DrizzleProjectDocumentRepository } from "./database/repositories/delay-analysis/DrizzleProjectDocumentRepository";
import { DrizzleScheduleActivityRepository } from "./database/repositories/delay-analysis/DrizzleScheduleActivityRepository";
import { DrizzleContractorDelayEventRepository } from "./database/repositories/delay-analysis/DrizzleContractorDelayEventRepository";
import { CreateDelayAnalysisProjectCommandHandler } from "../application/delay-analysis/commands/handlers/CreateDelayAnalysisProjectCommandHandler";
import { UpdateDelayAnalysisProjectCommandHandler } from "../application/delay-analysis/commands/handlers/UpdateDelayAnalysisProjectCommandHandler";
import { DeleteDelayAnalysisProjectCommandHandler } from "../application/delay-analysis/commands/handlers/DeleteDelayAnalysisProjectCommandHandler";
import { GetDelayAnalysisProjectQueryHandler } from "../application/delay-analysis/queries/handlers/GetDelayAnalysisProjectQueryHandler";
import { ListDelayAnalysisProjectsQueryHandler } from "../application/delay-analysis/queries/handlers/ListDelayAnalysisProjectsQueryHandler";
import type { IDelayAnalysisProjectRepository } from "../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository";
import type { IProjectDocumentRepository } from "../domain/delay-analysis/repositories/IProjectDocumentRepository";
import type { IScheduleActivityRepository } from "../domain/delay-analysis/repositories/IScheduleActivityRepository";
import type { IContractorDelayEventRepository } from "../domain/delay-analysis/repositories/IContractorDelayEventRepository";
import type { IAITokenUsageRepository } from "../domain/delay-analysis/repositories/IAITokenUsageRepository";
import { DrizzleAITokenUsageRepository } from "./database/repositories/delay-analysis/DrizzleAITokenUsageRepository";
import { RecordTokenUsageCommandHandler } from "../application/delay-analysis/commands/handlers/RecordTokenUsageCommandHandler";

export interface AppContainer {
  commandBus: ICommandBus;
  queryBus: IQueryBus;
  
  repositories: {
    agent: IAgentRepository;
    document: IDocumentRepository;
    chunk: IChunkRepository;
    structuredOutput: IStructuredOutputRepository;
    processingSession: IProcessingSessionRepository;
    conversation: IConversationRepository;
    conversationContext: IConversationContextRepository;
    buildContext: IBuildContextRepository;
    pretPackageSession: IPretPackageSessionRepository;
    pretPackageStorage: IPretPackageStorage | null;
    sessionMemory: ISessionMemoryRepository;
    delayAnalysisProject: IDelayAnalysisProjectRepository;
    projectDocument: IProjectDocumentRepository;
    scheduleActivity: IScheduleActivityRepository;
    contractorDelayEvent: IContractorDelayEventRepository;
    aiTokenUsage: IAITokenUsageRepository;
  };
  
  handlers: {
    streamChatHandler: StreamChatCommandHandler;
    streamChatWithAgentHandler: StreamChatWithAgentCommandHandler;
    orchestrateHandler: OrchestrateCommandHandler | null;
    importPretPackageHandler: ImportPretPackageHandler | null;
    getPretPackageHandler: GetPretPackageHandler | null;
    analyzePackageHandler: AnalyzePackageHandler | null;
    getDimensionMembersHandler: GetDimensionMembersHandler | null;
    updateConversationContextHandler: UpdateConversationContextHandler;
    narrateUploadResultHandler: NarrateUploadResultHandler | null;
    streamNarratorHandler: StreamNarrateUploadResultHandler | null;
  };
  
  services: {
    isAIConfigured: boolean;
    conversationSummarizer: IConversationSummarizer | null;
    pretToolRegistry: IPretToolRegistry | null;
    pretOrchestrator: PretOrchestrator | null;
    pretContextService: PretContextService | null;
    packageAnalysisCache: IPackageAnalysisCache;
    pretCommandRegistry: IPretCommandRegistry;
    pretCommandExecutor: PretCommandExecutor | null;
    documentParserFactory: IDocumentParserFactory;
    scheduleParserFactory: IScheduleParserFactory;
    delayEventExtractor: IDelayEventExtractor | null;
    activityMatcher: IActivityMatcher | null;
  };
}

export function createAppContainer(): AppContainer {
  const commandBus = new InMemoryCommandBus();
  const queryBus = new InMemoryQueryBus();

  const agentRepository = new DrizzleAgentRepository();
  const documentRepository = new DrizzleDocumentRepository();
  const chunkRepository = new DrizzleChunkRepository();
  const structuredOutputRepository = new DrizzleStructuredOutputRepository();
  const sessionRepository = new PostgresProcessingSessionRepository();
  const conversationRepository = new DrizzleConversationRepository();
  const buildContextRepository = new InMemoryBuildContextRepository();
  const fileContextRepository: IFileContextRepository = new InMemoryFileContextRepository();
  const pretPackageSessionRepository = new InMemoryPretPackageSessionRepository();
  const conversationContextRepository = new InMemoryConversationContextRepository();
  const packageAnalysisCache: IPackageAnalysisCache = new InMemoryPackageAnalysisCache();
  const sessionMemoryRepository = new InMemorySessionMemoryRepository();

  const delayAnalysisProjectRepository = new DrizzleDelayAnalysisProjectRepository();
  const projectDocumentRepository = new DrizzleProjectDocumentRepository();
  const scheduleActivityRepository = new DrizzleScheduleActivityRepository();
  const contractorDelayEventRepository = new DrizzleContractorDelayEventRepository();
  const aiTokenUsageRepository = new DrizzleAITokenUsageRepository();
  const documentParserFactory = new DocumentParserFactory();

  let delayEventExtractor: IDelayEventExtractor | null = null;
  let activityMatcher: IActivityMatcher | null = null;
  let scheduleParserFactory: IScheduleParserFactory;

  let pretPackageStorage: IPretPackageStorage | null = null;
  try {
    if (process.env.S3_AUTH_KEY && process.env.S3_AUTH_SECRET && process.env.S3_BUCKET_NAME) {
      pretPackageStorage = new S3PretPackageStorage(process.env.S3_BUCKET_NAME);
    }
  } catch (error) {
    console.warn("S3 storage not configured:", error);
  }

  const documentProcessor = new DocumentProcessor();
  const extractionService = new AIDocumentExtractionService(bedrockClientProvider);
  const understandingService = new DocumentUnderstandingService(bedrockClientProvider, sessionRepository);

  // Try OpenAI first (gpt-5.2), then fall back to Bedrock
  let aiClient = aiClientFactory.getClientForModel(ModelId.gpt52());
  if (!aiClient) {
    aiClient = bedrockClientProvider.getClient();
  }
  
  let pretToolRegistry: IPretToolRegistry | null = null;
  let pretOrchestrator: PretOrchestrator | null = null;
  let pretContextService: PretContextService | null = null;
  
  if (aiClient && pretPackageStorage) {
    const fileLocator: IPretFileLocator = new PackageAnalysisPretFileLocator();
    const fileReader: IPretFileReader = new ChunkedS3PretFileReader(pretPackageStorage);
    
    pretContextService = new PretContextService(
      fileLocator,
      fileReader,
      fileContextRepository
    );
    
    pretToolRegistry = new PretToolRegistry(aiClient);
    pretOrchestrator = new PretOrchestrator(
      pretToolRegistry, 
      buildContextRepository,
      pretContextService,
      aiClient
    );
  } else if (aiClient) {
    pretToolRegistry = new PretToolRegistry(aiClient);
    pretOrchestrator = new PretOrchestrator(
      pretToolRegistry, 
      buildContextRepository,
      undefined,
      aiClient
    );
  }

  const pretCommandRegistry: IPretCommandRegistry = new PretCommandRegistry();
  pretCommandRegistry.register(new ListModelsCommandHandler(packageAnalysisCache));
  pretCommandRegistry.register(new GetCubeDetailsCommandHandler(packageAnalysisCache));
  pretCommandRegistry.register(new ListDimensionsCommandHandler(packageAnalysisCache));
  pretCommandRegistry.register(new GetDimensionDetailsCommandHandler(packageAnalysisCache));
  
  let createOtherDimensionHandler: CreateOtherDimensionCommandHandler | null = null;
  if (pretPackageStorage) {
    const schemaValidator = new SchemaValidator(
      new URL('../pret/schemas', import.meta.url).pathname
    );
    createOtherDimensionHandler = new CreateOtherDimensionCommandHandler(
      packageAnalysisCache,
      pretPackageStorage,
      schemaValidator
    );
    pretCommandRegistry.register(createOtherDimensionHandler);
  }
  
  let intentClassifier: IIntentClassifier | null = null;
  let responseNarrator: IResponseNarrator | null = null;
  if (aiClient) {
    intentClassifier = new AIIntentClassifier(aiClient);
    responseNarrator = new AIPretResponseNarrator(aiClient);
    delayEventExtractor = new AIDelayEventExtractor(aiClient);
    activityMatcher = new AIActivityMatcher(aiClient);
    
    const excelParser = new ExcelScheduleParserV2();
    const pdfParser = new PdfScheduleParser(aiClient);
    scheduleParserFactory = new ScheduleParserFactory([excelParser, pdfParser]);
  } else {
    const excelParser = new ExcelScheduleParserV2();
    scheduleParserFactory = new ScheduleParserFactory([excelParser]);
  }
  
  const pretCommandExecutor = intentClassifier 
    ? new PretCommandExecutor(
        pretCommandRegistry, 
        intentClassifier, 
        PRET_COMMAND_DESCRIPTORS,
        responseNarrator ?? undefined
      )
    : null;

  const discoveryService = new AgentDiscoveryService();
  const planner = aiClient ? new OrchestrationPlanner(aiClient) : null;
  const executor = new AgentExecutor(agentRepository, chunkRepository, aiClientFactory);
  
  if (pretOrchestrator) {
    executor.setPretOrchestrator(pretOrchestrator);
  }
  
  executor.setConversationContextRepository(conversationContextRepository);
  executor.setPackageAnalysisCache(packageAnalysisCache);
  executor.setSessionMemoryRepository(sessionMemoryRepository);
  executor.setPretCommandExecutor(pretCommandExecutor);
  
  const synthesizer = aiClient ? new ResponseSynthesizer(aiClient) : null;
  const fallbackGenerator = aiClient ? new FallbackResponseGenerator(aiClient) : null;
  const conversationSummarizer = aiClient ? new AIConversationSummarizer(aiClient) : null;

  const sendChatHandler = new SendChatCommandHandler(bedrockClientProvider);
  const streamChatHandler = new StreamChatCommandHandler(bedrockClientProvider);
  const testConnectionHandler = new TestConnectionQueryHandler(bedrockClientProvider);

  const createAgentHandler = new CreateAgentCommandHandler(agentRepository);
  const updateAgentHandler = new UpdateAgentCommandHandler(agentRepository);
  const deleteAgentHandler = new DeleteAgentCommandHandler(agentRepository);
  const uploadDocumentHandler = new UploadDocumentCommandHandler(
    agentRepository, documentRepository, chunkRepository, documentProcessor
  );
  const uploadDocumentFileHandler = new UploadDocumentFileCommandHandler(
    agentRepository, documentRepository, chunkRepository, documentProcessor, 
    extractionService, understandingService, sessionRepository
  );
  const deleteDocumentHandler = new DeleteDocumentCommandHandler(documentRepository, chunkRepository);
  const reindexAgentHandler = new ReindexAgentCommandHandler(
    agentRepository, documentRepository, chunkRepository, documentProcessor
  );
  const chatWithAgentHandler = new ChatWithAgentCommandHandler(
    agentRepository, chunkRepository, bedrockClientProvider
  );
  const streamChatWithAgentHandler = new StreamChatWithAgentCommandHandler(
    agentRepository, chunkRepository, bedrockClientProvider
  );

  const saveStructuredOutputHandler = new SaveStructuredOutputCommandHandler(
    agentRepository, structuredOutputRepository
  );

  let orchestrateHandler: OrchestrateCommandHandler | null = null;
  if (planner && synthesizer && fallbackGenerator) {
    orchestrateHandler = new OrchestrateCommandHandler(
      discoveryService,
      planner,
      executor,
      synthesizer,
      fallbackGenerator
    );
  }

  const getAgentHandler = new GetAgentQueryHandler(agentRepository);
  const listAgentsHandler = new ListAgentsQueryHandler(agentRepository);
  const listAgentDocumentsHandler = new ListAgentDocumentsQueryHandler(documentRepository);

  const createDelayAnalysisProjectHandler = new CreateDelayAnalysisProjectCommandHandler(delayAnalysisProjectRepository);
  const updateDelayAnalysisProjectHandler = new UpdateDelayAnalysisProjectCommandHandler(delayAnalysisProjectRepository);
  const deleteDelayAnalysisProjectHandler = new DeleteDelayAnalysisProjectCommandHandler(delayAnalysisProjectRepository);
  const getDelayAnalysisProjectHandler = new GetDelayAnalysisProjectQueryHandler(delayAnalysisProjectRepository);
  const listDelayAnalysisProjectsHandler = new ListDelayAnalysisProjectsQueryHandler(delayAnalysisProjectRepository);

  let importPretPackageHandler: ImportPretPackageHandler | null = null;
  let getPretPackageHandler: GetPretPackageHandler | null = null;
  let analyzePackageHandler: AnalyzePackageHandler | null = null;
  let getDimensionMembersHandler: GetDimensionMembersHandler | null = null;
  
  if (pretPackageStorage) {
    const packageAnalyzer: IPackageAnalyzer = new YauzlPackageAnalyzer();
    const dimensionMemberReader: IDimensionMemberReader = new YamlDimensionMemberReader(packageAnalyzer);
    
    importPretPackageHandler = new ImportPretPackageHandler(
      pretPackageStorage,
      pretPackageSessionRepository
    );
    getPretPackageHandler = new GetPretPackageHandler(
      pretPackageSessionRepository,
      pretPackageStorage
    );
    analyzePackageHandler = new AnalyzePackageHandler(
      pretPackageStorage,
      packageAnalyzer
    );
    getDimensionMembersHandler = new GetDimensionMembersHandler(
      pretPackageStorage,
      dimensionMemberReader
    );

    // Wire the analyze handler to the create dimension handler for cache rehydration
    if (createOtherDimensionHandler && analyzePackageHandler) {
      createOtherDimensionHandler.setAnalyzeHandler(analyzePackageHandler);
    }
  }

  const updateConversationContextHandler = new UpdateConversationContextHandler(
    conversationContextRepository
  );

  let narrateUploadResultHandler: NarrateUploadResultHandler | null = null;
  let streamNarratorHandler: StreamNarrateUploadResultHandler | null = null;
  if (aiClient) {
    const uploadNarrator = new AIUploadNarrator(aiClient);
    narrateUploadResultHandler = new NarrateUploadResultHandler(uploadNarrator);
    streamNarratorHandler = new StreamNarrateUploadResultHandler(
      uploadNarrator, 
      conversationRepository,
      conversationContextRepository
    );
  }

  commandBus.register('SendChatCommand', sendChatHandler);
  commandBus.register('CreateAgentCommand', createAgentHandler);
  commandBus.register('UpdateAgentCommand', updateAgentHandler);
  commandBus.register('DeleteAgentCommand', deleteAgentHandler);
  commandBus.register('UploadDocumentCommand', uploadDocumentHandler);
  commandBus.register('UploadDocumentFileCommand', uploadDocumentFileHandler);
  commandBus.register('DeleteDocumentCommand', deleteDocumentHandler);
  commandBus.register('ReindexAgentCommand', reindexAgentHandler);
  commandBus.register('ChatWithAgentCommand', chatWithAgentHandler);
  commandBus.register('SaveStructuredOutputCommand', saveStructuredOutputHandler);

  queryBus.register('TestConnectionQuery', testConnectionHandler);
  queryBus.register('GetAgentQuery', getAgentHandler);
  queryBus.register('ListAgentsQuery', listAgentsHandler);
  queryBus.register('ListAgentDocumentsQuery', listAgentDocumentsHandler);

  commandBus.register('CreateDelayAnalysisProjectCommand', createDelayAnalysisProjectHandler);
  commandBus.register('UpdateDelayAnalysisProjectCommand', updateDelayAnalysisProjectHandler);
  commandBus.register('DeleteDelayAnalysisProjectCommand', deleteDelayAnalysisProjectHandler);
  queryBus.register('GetDelayAnalysisProjectQuery', getDelayAnalysisProjectHandler);
  queryBus.register('ListDelayAnalysisProjectsQuery', listDelayAnalysisProjectsHandler);

  return {
    commandBus,
    queryBus,
    repositories: {
      agent: agentRepository,
      document: documentRepository,
      chunk: chunkRepository,
      structuredOutput: structuredOutputRepository,
      processingSession: sessionRepository,
      conversation: conversationRepository,
      conversationContext: conversationContextRepository,
      buildContext: buildContextRepository,
      pretPackageSession: pretPackageSessionRepository,
      pretPackageStorage,
      sessionMemory: sessionMemoryRepository,
      delayAnalysisProject: delayAnalysisProjectRepository,
      projectDocument: projectDocumentRepository,
      scheduleActivity: scheduleActivityRepository,
      contractorDelayEvent: contractorDelayEventRepository,
      aiTokenUsage: aiTokenUsageRepository,
    },
    handlers: {
      streamChatHandler,
      streamChatWithAgentHandler,
      orchestrateHandler,
      importPretPackageHandler,
      getPretPackageHandler,
      analyzePackageHandler,
      getDimensionMembersHandler,
      updateConversationContextHandler,
      narrateUploadResultHandler,
      streamNarratorHandler,
    },
    services: {
      isAIConfigured: bedrockClientProvider.isConfigured(),
      conversationSummarizer,
      pretToolRegistry,
      pretOrchestrator,
      pretContextService,
      packageAnalysisCache,
      pretCommandRegistry,
      pretCommandExecutor,
      documentParserFactory,
      scheduleParserFactory,
      delayEventExtractor,
      activityMatcher,
    },
  };
}

let container: AppContainer | null = null;

export function getAppContainer(): AppContainer {
  if (!container) {
    container = createAppContainer();
  }
  return container;
}

export function resetAppContainer(): void {
  container = null;
}
