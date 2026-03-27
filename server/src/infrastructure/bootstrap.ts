import { warmDatabaseConnection } from "./database";
import { DrizzleUserRepository } from "./auth/DrizzleUserRepository";
import { BcryptPasswordHasher } from "./auth/BcryptPasswordHasher";
import { LoginRateLimiter } from "./auth/LoginRateLimiter";
import { LoginCommandHandler } from "../application/auth/commands/handlers/LoginCommandHandler";
import { CreateUserCommandHandler } from "../application/auth/commands/handlers/CreateUserCommandHandler";
import { UpdateUserCommandHandler } from "../application/auth/commands/handlers/UpdateUserCommandHandler";
import { DeleteUserCommandHandler } from "../application/auth/commands/handlers/DeleteUserCommandHandler";
import { ListUsersQueryHandler } from "../application/auth/queries/handlers/ListUsersQueryHandler";
import { GetCurrentUserQueryHandler } from "../application/auth/queries/handlers/GetCurrentUserQueryHandler";
import type { IUserRepository } from "../domain/auth/interfaces/IUserRepository";
import type { IPasswordHasher } from "../domain/auth/interfaces/IPasswordHasher";
import type { AuthControllerDeps } from "../presentation/controllers/AuthController";
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
import { DelayEventsAgentContextProvider } from "./delay-analysis/DelayEventsAgentContextProvider";
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
import { CreateAgentCommandHandler } from "../application/commands/handlers/CreateAgentCommandHandler";
import { UpdateAgentCommandHandler } from "../application/commands/handlers/UpdateAgentCommandHandler";
import { DeleteAgentCommandHandler } from "../application/commands/handlers/DeleteAgentCommandHandler";
import { UploadDocumentCommandHandler } from "../application/commands/handlers/UploadDocumentCommandHandler";
import { UploadDocumentFileCommandHandler } from "../application/commands/handlers/UploadDocumentFileCommandHandler";
import { DeleteDocumentCommandHandler } from "../application/commands/handlers/DeleteDocumentCommandHandler";
import { ReindexAgentCommandHandler } from "../application/commands/handlers/ReindexAgentCommandHandler";
import { ChatWithAgentCommandHandler } from "../application/commands/handlers/ChatWithAgentCommandHandler";
import { SaveStructuredOutputCommandHandler } from "../application/commands/handlers/SaveStructuredOutputCommandHandler";
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
import { RegexScheduleParser } from "./document-parsing/RegexScheduleParser";
import { ScheduleParserFactory } from "./document-parsing/ScheduleParserFactory";
import type { IScheduleParserFactory } from "../domain/delay-analysis/interfaces/IScheduleParserFactory";
import { AIDelayEventExtractor } from "./delay-analysis/AIDelayEventExtractor";
import { AIDelayEventExtractorWithTools } from "./delay-analysis/AIDelayEventExtractorWithTools";
import { ToolExtractionSystemPromptStrategyFactory } from "./delay-analysis/tool-extraction-prompts/ToolExtractionSystemPromptStrategyFactory";
import { GetScheduleActivitiesTool } from "./delay-analysis/tools/GetScheduleActivitiesTool";
import { GetActivitiesByIdsQueryHandler } from "../application/delay-analysis/queries/handlers/GetActivitiesByIdsQueryHandler";
import { AIActivityMatcher } from "./delay-analysis/AIActivityMatcher";
import { DocumentContentProvider } from "./delay-analysis/DocumentContentProvider";
import { SHA256DocumentHashService } from "./delay-analysis/SHA256DocumentHashService";
import { DelayEventDeduplicationService } from "./delay-analysis/DelayEventDeduplicationService";
import type { IAgentLoop } from "../domain/delay-analysis/interfaces/IAgentLoop";
import { ReactAgentLoop } from "./delay-analysis/agent/ReactAgentLoop";
import { OpenAIToolUseClient } from "./delay-analysis/agent/OpenAIToolUseClient";
import { getAzureOpenAISettings, createAzureOpenAIClient } from "./ai/AzureOpenAIConfig";
import { ToolRegistryImpl } from "./delay-analysis/agent/ToolRegistryImpl";
import { SearchDocumentsByFilenameTool as AgentSearchDocsTool } from "./delay-analysis/agent/tools/SearchDocumentsByFilenameTool";
import { GetDocumentContentTool as AgentGetDocContentTool } from "./delay-analysis/agent/tools/GetDocumentContentTool";
import { GetDelayEventsByDocumentTool as AgentGetDelayEventsTool } from "./delay-analysis/agent/tools/GetDelayEventsByDocumentTool";
import { GetScheduleActivityDetailsTool as AgentGetActivityDetailsTool } from "./delay-analysis/agent/tools/GetScheduleActivityDetailsTool";
import { ListDelayEventsTool as AgentListDelayEventsTool } from "./delay-analysis/agent/tools/ListDelayEventsTool";
import { ContractorDelayTrainingGuide } from "../domain/delay-analysis/config/ContractorDelayTrainingGuide";
import { DelayKnowledgePromptBuilder } from "./delay-analysis/DelayKnowledgePromptBuilder";
import type { IDelayEventExtractor } from "../domain/delay-analysis/interfaces/IDelayEventExtractor";
import type { IActivityMatcher } from "../domain/delay-analysis/interfaces/IActivityMatcher";
import type { IIDRMatchEnforcementPolicy } from "../domain/delay-analysis/interfaces/IIDRMatchEnforcementPolicy";
import type { IAnalysisRunTracker } from "../domain/delay-analysis/interfaces/IAnalysisRunTracker";
import { InMemoryAnalysisRunTracker } from "./delay-analysis/InMemoryAnalysisRunTracker";
import { IDRMatchEnforcementPolicy } from "../domain/delay-analysis/config/IDRMatchEnforcementPolicy";
import type { IDocumentContentProvider } from "../domain/delay-analysis/interfaces/IDocumentContentProvider";
import type { IDocumentHashService } from "../domain/delay-analysis/interfaces/IDocumentHashService";
import type { IDelayEventDeduplicationService } from "../domain/delay-analysis/interfaces/IDelayEventDeduplicationService";
import type { IFieldMemoContextProvider } from "../domain/delay-analysis/interfaces/IFieldMemoContextProvider";
import { FieldMemoContextSummarizer } from "./delay-analysis/FieldMemoContextSummarizer";
import { GetDocumentContentQueryHandler } from "../application/delay-analysis/queries/handlers/GetDocumentContentQueryHandler";

import { DrizzleDelayAnalysisProjectRepository } from "./database/repositories/delay-analysis/DrizzleDelayAnalysisProjectRepository";
import { DrizzleProjectDocumentRepository } from "./database/repositories/delay-analysis/DrizzleProjectDocumentRepository";
import { DrizzleScheduleActivityRepository } from "./database/repositories/delay-analysis/DrizzleScheduleActivityRepository";
import { DrizzleContractorDelayEventRepository } from "./database/repositories/delay-analysis/DrizzleContractorDelayEventRepository";
import { CreateDelayAnalysisProjectCommandHandler } from "../application/delay-analysis/commands/handlers/CreateDelayAnalysisProjectCommandHandler";
import { UpdateDelayAnalysisProjectCommandHandler } from "../application/delay-analysis/commands/handlers/UpdateDelayAnalysisProjectCommandHandler";
import { DeleteDelayAnalysisProjectCommandHandler } from "../application/delay-analysis/commands/handlers/DeleteDelayAnalysisProjectCommandHandler";
import { GetDelayAnalysisProjectQueryHandler } from "../application/delay-analysis/queries/handlers/GetDelayAnalysisProjectQueryHandler";
import { ListDelayAnalysisProjectsQueryHandler } from "../application/delay-analysis/queries/handlers/ListDelayAnalysisProjectsQueryHandler";
import { GetTokenUsageByRunIdQueryHandler } from "../application/delay-analysis/queries/handlers/GetTokenUsageByRunIdQueryHandler";
import type { IDelayAnalysisProjectRepository } from "../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository";
import type { IProjectDocumentRepository } from "../domain/delay-analysis/repositories/IProjectDocumentRepository";
import type { IScheduleActivityRepository } from "../domain/delay-analysis/repositories/IScheduleActivityRepository";
import type { IContractorDelayEventRepository } from "../domain/delay-analysis/repositories/IContractorDelayEventRepository";
import type { IAITokenUsageRepository } from "../domain/delay-analysis/repositories/IAITokenUsageRepository";
import { DrizzleAITokenUsageRepository } from "./database/repositories/delay-analysis/DrizzleAITokenUsageRepository";
import { RecordTokenUsageCommandHandler } from "../application/delay-analysis/commands/handlers/RecordTokenUsageCommandHandler";
import { SearchDocumentsByFilenameQueryHandler } from "../application/delay-analysis/queries/handlers/SearchDocumentsByFilenameQueryHandler";
import { GetDelayEventsByDocumentQueryHandler } from "../application/delay-analysis/queries/handlers/GetDelayEventsByDocumentQueryHandler";

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
    importPretPackageHandler: ImportPretPackageHandler | null;
    getPretPackageHandler: GetPretPackageHandler | null;
    analyzePackageHandler: AnalyzePackageHandler | null;
    getDimensionMembersHandler: GetDimensionMembersHandler | null;
  };
  
  services: {
    isAIConfigured: boolean;
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
    idrMatchPolicy: IIDRMatchEnforcementPolicy;
    analysisRunTracker: IAnalysisRunTracker;
    documentContentProvider: IDocumentContentProvider;
    documentHashService: IDocumentHashService;
    delayEventDeduplicationService: IDelayEventDeduplicationService;
    fieldMemoContextProvider: IFieldMemoContextProvider | null;
  };

  agentLoop: {
    loop: IAgentLoop | null;
    systemPrompt: string;
  };

  auth: {
    userRepository: IUserRepository;
    passwordHasher: IPasswordHasher;
    controllerDeps: AuthControllerDeps;
  };
}

function createAgentLoop(
  projectDocumentRepository: IProjectDocumentRepository,
  contractorDelayEventRepository: IContractorDelayEventRepository,
  getActivitiesByIdsHandler: GetActivitiesByIdsQueryHandler,
): AppContainer['agentLoop'] {
  const azureSettings = getAzureOpenAISettings();
  if (!azureSettings) {
    console.warn('[Bootstrap] Azure OpenAI not configured - agent loop disabled');
    return { loop: null, systemPrompt: '' };
  }

  const toolRegistry = new ToolRegistryImpl();

  const searchDocsQH = new SearchDocumentsByFilenameQueryHandler(projectDocumentRepository);
  const getDocContentQH = new GetDocumentContentQueryHandler(
    new DocumentContentProvider(),
    projectDocumentRepository
  );
  const getDelayEventsQH = new GetDelayEventsByDocumentQueryHandler(contractorDelayEventRepository);

  toolRegistry.register(new AgentSearchDocsTool(searchDocsQH));
  toolRegistry.register(new AgentGetDocContentTool(getDocContentQH));
  toolRegistry.register(new AgentGetDelayEventsTool(getDelayEventsQH));
  toolRegistry.register(new AgentGetActivityDetailsTool(getActivitiesByIdsHandler));
  toolRegistry.register(new AgentListDelayEventsTool(contractorDelayEventRepository));

  const agentModel = azureSettings.deployment || 'gpt-5.4';
  const azureClient = createAzureOpenAIClient(azureSettings);
  const toolUseClient = new OpenAIToolUseClient(azureClient, agentModel);
  const loop = new ReactAgentLoop(toolRegistry, toolUseClient, agentModel);

  console.log('[Bootstrap] ReactAgentLoop initialized with 5 tools');

  const knowledgeBase = new ContractorDelayTrainingGuide();
  const promptBuilder = new DelayKnowledgePromptBuilder(knowledgeBase);
  const knowledgePrompt = promptBuilder.buildPromptForDocumentType('idr');

  const systemPrompt = `You are a specialized construction delay analysis expert and verification assistant. Your purpose is to help users verify whether delay events were correctly identified, analyze their classifications, and provide detailed reasoning based on the Contractor Delay Training Guide.

## YOUR CAPABILITIES:

You have access to the following tools to investigate delay events:

1. **search_documents_by_filename** - Find documents by filename, date code, or inspector initials
2. **get_document_content** - Retrieve the full text of a source document
3. **get_delay_events_by_document** - Find all delay events extracted from a specific document
4. **get_schedule_activity_details** - Look up CPM schedule activity details by activity ID
5. **list_delay_events** - List all delay events for the project, optionally filtered by month/year and category. Use when the user asks to see events for a time period (e.g., "show me August 2025 events") or wants an overview of all delays.

## ANALYTICAL METHODOLOGY:

When a user asks you to verify or analyze a delay event, follow this exact workflow:

### Step 1: LOCATE THE SOURCE
- If the user mentions a document filename, use search_documents_by_filename to find it
- If they mention a delay event, use get_delay_events_by_document to find events from that document
- If the user asks to see all events or events for a specific time period, use list_delay_events with optional month/year filters

### Step 2: READ THE EVIDENCE
- Use get_document_content to retrieve the full document text
- Focus on diary entries, timestamps, and narrative descriptions
- Note exact timestamps and durations mentioned

### Step 3: CROSS-REFERENCE THE TRAINING GUIDE
Using the Contractor Delay Training Guide knowledge base below, evaluate:
- Which delay CATEGORY does this event fall under? (Resource & Staffing, Subcontractor & Supplier, Quality Deficiencies, Planning & Coordination, Equipment Failures)
- Does it match any specific INDICATOR in that category?
- Does it pass the CORE TEST: "Was the Contractor doing everything within its power to diligently prosecute the Work?"
- Does any EXCLUSION apply? (DSCs, owner-directed suspensions, unforeseen conditions, etc.)
- Walk through the DECISION FRAMEWORK questions
- Compare to relevant WORKED EXAMPLES

### Step 4: PROVIDE YOUR VERDICT
- State whether the classification is correct, with your reasoning
- Assess the confidence level and whether it's appropriate
- Note if the duration estimate is supported by the evidence
- Flag any gray areas or aspects that need human judgment
- Reference specific sections of the Training Guide in your analysis

## CRITICAL RULES:

1. **ALWAYS use your tools to investigate** - Never answer from memory alone. Search for and read the actual documents.
2. **ONLY answer questions about the delay events data and documents in this project.**
3. **REFUSE questions not directly about delay analysis.** Say: "I can only answer questions about the delay events in this project."
4. **Base ALL answers strictly on the data, documents, and Training Guide.** Never make up information.
5. **Always show your reasoning** - walk through the Training Guide criteria step by step.
6. **Be honest about gray areas** - if a classification is borderline, say so and explain why.
7. **Reference timestamps and diary entries** when discussing evidence from documents.

## DURATION ESTIMATION METHODOLOGY:

### For Inspector Daily Reports (IDRs):
- Durations are estimated by interpreting the narrative and timestamps
- **Explicit timestamp gaps**: "0930-crew stopped, 1100-resumed" = 1.5 hours
- **Explicit mentions**: "crew arrived 2 hours late" → 2 hours
- **Estimated from context**: Equipment breakdowns, crew shortages → estimated based on typical resolution times

### For Non-Conformance Reports (NCRs):
- NCR = rework required = definite delay
- Duration = removal time + redo time + re-inspection time

${knowledgePrompt}`;

  return { loop, systemPrompt };
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

  const getActivitiesByIdsHandler = new GetActivitiesByIdsQueryHandler(scheduleActivityRepository);
  const scheduleActivitiesTool = new GetScheduleActivitiesTool(getActivitiesByIdsHandler);
  console.log('[Bootstrap] Created GetScheduleActivitiesTool for tool-based extraction');

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

  // Try OpenAI first (gpt-5.4), then fall back to Bedrock
  let aiClient = aiClientFactory.getClientForModel(ModelId.gpt54());
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
  const excelParser = new ExcelScheduleParserV2();
  const regexPdfParser = new RegexScheduleParser();
  scheduleParserFactory = new ScheduleParserFactory([excelParser, regexPdfParser]);

  if (aiClient) {
    intentClassifier = new AIIntentClassifier(aiClient);
    responseNarrator = new AIPretResponseNarrator(aiClient);
    const extractionKnowledgeBase = new ContractorDelayTrainingGuide();
    const extractionPromptBuilder = new DelayKnowledgePromptBuilder(extractionKnowledgeBase);
    const systemPromptStrategyFactory = new ToolExtractionSystemPromptStrategyFactory(extractionPromptBuilder);
    const extractorAzureSettings = getAzureOpenAISettings();
    const extractorClient = extractorAzureSettings ? createAzureOpenAIClient(extractorAzureSettings) : null;
    delayEventExtractor = new AIDelayEventExtractorWithTools(scheduleActivitiesTool, systemPromptStrategyFactory, extractorClient);
    console.log('[Bootstrap] Using AIDelayEventExtractorWithTools with per-document-type system prompt strategies');
    activityMatcher = new AIActivityMatcher(aiClient);
  }

  let fieldMemoContextProvider: IFieldMemoContextProvider | null = null;
  if (aiClient) {
    fieldMemoContextProvider = new FieldMemoContextSummarizer(projectDocumentRepository, aiClient);
    console.log('[Bootstrap] FieldMemoContextSummarizer initialized for IDR context injection');
  }
  
  const pretCommandExecutor = intentClassifier 
    ? new PretCommandExecutor(
        pretCommandRegistry, 
        intentClassifier, 
        PRET_COMMAND_DESCRIPTORS,
        responseNarrator ?? undefined
      )
    : null;

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

  const saveStructuredOutputHandler = new SaveStructuredOutputCommandHandler(
    agentRepository, structuredOutputRepository
  );

  const getAgentHandler = new GetAgentQueryHandler(agentRepository);
  const listAgentsHandler = new ListAgentsQueryHandler(agentRepository);
  const listAgentDocumentsHandler = new ListAgentDocumentsQueryHandler(documentRepository);

  const createDelayAnalysisProjectHandler = new CreateDelayAnalysisProjectCommandHandler(delayAnalysisProjectRepository);
  const updateDelayAnalysisProjectHandler = new UpdateDelayAnalysisProjectCommandHandler(delayAnalysisProjectRepository);
  const deleteDelayAnalysisProjectHandler = new DeleteDelayAnalysisProjectCommandHandler(delayAnalysisProjectRepository);
  const getDelayAnalysisProjectHandler = new GetDelayAnalysisProjectQueryHandler(delayAnalysisProjectRepository);
  const listDelayAnalysisProjectsHandler = new ListDelayAnalysisProjectsQueryHandler(delayAnalysisProjectRepository);
  const getTokenUsageByRunIdHandler = new GetTokenUsageByRunIdQueryHandler(aiTokenUsageRepository);

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
  queryBus.register('GetTokenUsageByRunIdQuery', getTokenUsageByRunIdHandler);

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
      importPretPackageHandler,
      getPretPackageHandler,
      analyzePackageHandler,
      getDimensionMembersHandler,
    },
    services: {
      isAIConfigured: bedrockClientProvider.isConfigured(),
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
      idrMatchPolicy: new IDRMatchEnforcementPolicy(),
      analysisRunTracker: new InMemoryAnalysisRunTracker(),
      documentContentProvider: new DocumentContentProvider(),
      documentHashService: new SHA256DocumentHashService(),
      delayEventDeduplicationService: new DelayEventDeduplicationService(),
      fieldMemoContextProvider,
    },
    agentLoop: createAgentLoop(projectDocumentRepository, contractorDelayEventRepository, getActivitiesByIdsHandler),
    auth: createAuthSection(),
  };
}

function createAuthSection(): AppContainer['auth'] {
  const userRepository = new DrizzleUserRepository();
  const passwordHasher = new BcryptPasswordHasher();
  const rateLimiter = new LoginRateLimiter();

  return {
    userRepository,
    passwordHasher,
    controllerDeps: {
      loginHandler: new LoginCommandHandler(userRepository, passwordHasher),
      createUserHandler: new CreateUserCommandHandler(userRepository, passwordHasher),
      updateUserHandler: new UpdateUserCommandHandler(userRepository, passwordHasher),
      deleteUserHandler: new DeleteUserCommandHandler(userRepository),
      listUsersHandler: new ListUsersQueryHandler(userRepository),
      getCurrentUserHandler: new GetCurrentUserQueryHandler(userRepository),
      rateLimiter,
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

export async function initializeInfrastructure(): Promise<void> {
  await warmDatabaseConnection();
}
