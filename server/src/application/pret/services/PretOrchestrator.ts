import type { IPretToolRegistry } from '../../../domain/pret/interfaces/IPretToolRegistry';
import type { IBuildContextRepository } from '../../../domain/pret/interfaces/IBuildContextRepository';
import type { PretObjectTypeName, PackageAnalysisData, FileContext } from '../../../domain/pret';
import type { IAIClient } from '../../../domain/interfaces/IAIClient';
import { BuildContext } from '../../../domain/pret/entities/BuildContext';
import { DependencyResolver } from './DependencyResolver';
import type { PretOutputDto } from '../dto/PretOutputDto';
import type { PretContextService } from './PretContextService';
import { AIMessage } from '../../../domain/value-objects/AIMessage';
import { ModelId } from '../../../domain/value-objects/ModelId';
import { PretSessionMemory } from '../../../domain/value-objects/PretSessionMemory';

export interface PretOrchestratorContext {
  tenantId: string;
  conversationId: string;
  packageId?: string;
  userMessage: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  targetObjectType?: PretObjectTypeName;
  packageAnalysis?: PackageAnalysisData;
  onChunk?: (chunk: string) => void;
  sessionMemory?: PretSessionMemory;
}

export interface PretGenerateResult {
  success: boolean;
  yaml?: { formattedOutput: string };
  clarificationNeeded?: string;
  error?: string;
  updatedSessionMemory?: PretSessionMemory;
}

export class PretOrchestrator {
  private readonly dependencyResolver: DependencyResolver;

  constructor(
    private readonly toolRegistry: IPretToolRegistry,
    private readonly contextRepository: IBuildContextRepository,
    private readonly pretContextService?: PretContextService,
    private readonly aiClient?: IAIClient
  ) {
    this.dependencyResolver = new DependencyResolver();
  }

  async loadFileContext(context: PretOrchestratorContext): Promise<{
    success: boolean;
    fileContext?: FileContext;
    clarificationNeeded?: string;
    error?: string;
  }> {
    if (!this.pretContextService || !context.packageId || !context.packageAnalysis) {
      return { success: false, error: 'File context service not available or missing package info' };
    }

    const result = await this.pretContextService.loadContext({
      conversationId: context.conversationId,
      tenantId: context.tenantId,
      packageId: context.packageId,
      userIntent: context.userMessage,
      packageAnalysis: context.packageAnalysis,
    });

    return {
      success: result.success,
      fileContext: result.fileContext,
      clarificationNeeded: result.clarificationNeeded,
      error: result.error,
    };
  }

  async getLoadedContexts(conversationId: string): Promise<FileContext[]> {
    if (!this.pretContextService) {
      return [];
    }
    const contexts = await this.pretContextService.getContext(conversationId);
    if (Array.isArray(contexts)) {
      return contexts;
    }
    return contexts ? [contexts] : [];
  }

  buildContextString(fileContexts: FileContext[]): string {
    if (fileContexts.length === 0) {
      return '';
    }

    const sections: string[] = [];
    for (const ctx of fileContexts) {
      sections.push(ctx.toContextString());
    }
    return sections.join('\n\n---\n\n');
  }

  async generate(context: PretOrchestratorContext): Promise<PretGenerateResult> {
    const result = await this.orchestrate(context);
    return {
      success: result.success,
      yaml: result.yaml ? { formattedOutput: result.yaml } : undefined,
      clarificationNeeded: result.clarificationNeeded,
      error: result.error,
    };
  }

  async generateStream(context: PretOrchestratorContext & { onChunk: (chunk: string) => void }): Promise<PretGenerateResult> {
    console.log('[PretOrchestrator.generateStream] Starting stream generation');
    
    let fullResponse = '';
    const loadedFiles: string[] = [];
    let activeModelName: string | undefined;
    let pendingModelSwitch: string | undefined;
    
    const wrappedOnChunk = (chunk: string) => {
      fullResponse += chunk;
      context.onChunk(chunk);
    };
    
    const orchestrationResult = await this.streamOrchestrateWithTracking(context, wrappedOnChunk);
    if (orchestrationResult) {
      loadedFiles.push(...orchestrationResult.loadedFiles);
      activeModelName = orchestrationResult.modelName;
      pendingModelSwitch = orchestrationResult.pendingModelSwitch;
    }
    
    console.log('[PretOrchestrator.generateStream] Stream complete, fullResponse length:', fullResponse.length, 'loadedFiles:', loadedFiles.length, 'pendingSwitch:', pendingModelSwitch);
    
    // Determine if we need to update session memory
    let updatedSessionMemory: PretSessionMemory | undefined;
    const hadPendingSwitch = context.sessionMemory?.getPendingModelSwitch();
    const needsSessionUpdate = loadedFiles.length > 0 || activeModelName || pendingModelSwitch || hadPendingSwitch;
    
    if (needsSessionUpdate) {
      let baseMemory = context.sessionMemory || new PretSessionMemory({
        packageId: context.packageId || 'unknown',
        packageName: context.packageAnalysis?.packageName,
        loadedFiles: [],
        keyPoints: [],
        lastUpdated: new Date(),
      });
      
      // Clear pending switch first if we had one but no new one is set
      // (user didn't confirm - asking about something else)
      if (hadPendingSwitch && !pendingModelSwitch) {
        console.log('[PretOrchestrator.generateStream] Clearing pending model switch - user did not confirm');
        baseMemory = baseMemory.clearPendingModelSwitch();
      }
      
      if (activeModelName) {
        baseMemory = baseMemory.withActiveModel(activeModelName);
      }
      if (pendingModelSwitch) {
        baseMemory = baseMemory.withPendingModelSwitch(pendingModelSwitch);
      }
      for (const file of loadedFiles) {
        baseMemory = baseMemory.withLoadedFile(file);
      }
      updatedSessionMemory = baseMemory;
    }
    
    return {
      success: fullResponse.length > 0,
      yaml: fullResponse ? { formattedOutput: fullResponse } : undefined,
      clarificationNeeded: undefined,
      error: fullResponse.length === 0 ? 'No response generated' : undefined,
      updatedSessionMemory,
    };
  }

  async orchestrate(context: PretOrchestratorContext): Promise<PretOutputDto> {
    let buildContext = await this.contextRepository.findByConversation(
      context.tenantId,
      context.conversationId
    );

    if (!buildContext) {
      buildContext = BuildContext.create(context.tenantId, context.conversationId);
    }

    if (!context.targetObjectType) {
      return await this.handleGenericRequest(context, buildContext);
    }

    return await this.handleSpecificObjectRequest(context, buildContext);
  }

  async streamOrchestrate(
    context: PretOrchestratorContext,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    await this.streamOrchestrateWithTracking(context, onChunk);
  }

  private async streamOrchestrateWithTracking(
    context: PretOrchestratorContext,
    onChunk: (chunk: string) => void
  ): Promise<{ loadedFiles: string[]; modelName?: string; pendingModelSwitch?: string } | undefined> {
    let buildContext = await this.contextRepository.findByConversation(
      context.tenantId,
      context.conversationId
    );

    if (!buildContext) {
      buildContext = BuildContext.create(context.tenantId, context.conversationId);
    }

    if (!context.targetObjectType) {
      return await this.streamGenericRequestWithTracking(context, buildContext, onChunk);
    }

    await this.streamSpecificObjectRequest(context, buildContext, onChunk);
    return undefined;
  }

  private async handleGenericRequest(
    context: PretOrchestratorContext,
    buildContext: BuildContext
  ): Promise<PretOutputDto> {
    console.log('[PretOrchestrator.handleGenericRequest] Starting with:', {
      hasPackageId: !!context.packageId,
      hasPackageAnalysis: !!context.packageAnalysis,
      packageId: context.packageId,
      dimensionCount: context.packageAnalysis?.dimensions?.length ?? 0,
      cubeCount: context.packageAnalysis?.cubes?.length ?? 0,
    });

    if (!context.packageId || !context.packageAnalysis) {
      console.log('[PretOrchestrator] No package context - returning guidance message');
      return {
        success: false,
        clarificationNeeded: this.getNoPackageAccessMessage(),
      };
    }

    if (this.detectsFileReadingIntent(context.userMessage)) {
      const loadResult = await this.loadFileContext(context);
      
      if (loadResult.success && loadResult.fileContext) {
        console.log('[PretOrchestrator.handleGenericRequest] File loaded, calling AI for friendly narrative');
        const response = await this.callAIWithFileContext(context, loadResult.fileContext);
        return {
          success: true,
          yaml: response,
        };
      } else if (loadResult.clarificationNeeded) {
        return {
          success: false,
          clarificationNeeded: loadResult.clarificationNeeded,
        };
      } else if (loadResult.error) {
        // Explicit file-not-found handling - NEVER fall back to AI without file data
        console.log('[PretOrchestrator.handleGenericRequest] File loading failed:', loadResult.error);
        return {
          success: false,
          clarificationNeeded: `I couldn't access the requested file. ${loadResult.error}\n\nPlease specify a valid dimension or model name from the package.`,
        };
      }
    }
    
    const detectedType = this.detectObjectTypeFromMessage(context.userMessage);
    
    if (detectedType) {
      return await this.handleSpecificObjectRequest(
        { ...context, targetObjectType: detectedType },
        buildContext
      );
    }

    if (this.aiClient) {
      console.log('[PretOrchestrator] Calling AI with package summary:', {
        packageId: context.packageAnalysis.packageId,
        dimensions: context.packageAnalysis.dimensions.map(d => d.name),
        cubes: context.packageAnalysis.cubes.map(c => c.name),
      });
      const response = await this.callAIWithPackageContext(context);
      return {
        success: true,
        yaml: response,
      };
    }

    return {
      success: false,
      clarificationNeeded: this.getNoPackageAccessMessage(),
    };
  }

  private detectsFileReadingIntent(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    const fileReadingPatterns = [
      /\b(show|display|view|read|get|see|tell me about|what is|what are|describe|explain)\b.*\b(dimension|cube|model|account|time|version|currency|entity|members?)\b/i,
      /\b(dimension|cube|model|account|time|version|currency|entity)\b.*\b(has|have|contains|looks like|structure)\b/i,
      /\bwhat\s+(is|are)\s+(in|the)\b.*\b(dimension|cube|model)\b/i,
      /\bhow\s+many\b.*\b(member|dimension|account|entity|version|time|currency)\b/i,
      /\b(list|count|number of)\b.*\b(member|dimension|account|entity|version|time|currency)\b/i,
    ];
    return fileReadingPatterns.some(pattern => pattern.test(lowerMessage));
  }

  private detectModelWideQuery(message: string, packageAnalysis?: PackageAnalysisData): { 
    isModelWide: boolean; 
    modelName?: string;
    searchPattern?: string;
  } {
    const lowerMessage = message.toLowerCase();
    
    const modelWidePatterns = [
      /\b(all|any|every)\b.*\b(dimension|file)s?\b.*\b(in|for|of)\b.*\b(model|the)\s+(.+?)\s*(model)?\b/i,
      /\bmdx\s+(formula|calculation)s?\b.*\b(in|for|of|used\s+in)\b.*\b(the\s+)?(.+?)\s*(model)?\b/i,
      /\b(search|find|look\s+for|check)\b.*\b(all|every|each)?\b.*\b(dimension)s?\b.*\b(in|for)\b/i,
      /\b(formula|calculation)s?\b.*\b(across|in\s+all|throughout)\b/i,
      /\b(scan|analyze|search)\b.*\b(for)?\b.*\b(mdx|formula|calculation)s?\b/i,
    ];

    for (const pattern of modelWidePatterns) {
      const match = lowerMessage.match(pattern);
      if (match) {
        let extractedModelName: string | undefined;
        
        if (packageAnalysis) {
          extractedModelName = this.findBestModelNameMatch(lowerMessage, packageAnalysis);
        }

        const mdxSearch = /\bmdx\b/i.test(message);
        const formulaSearch = /\bformula|calculation\b/i.test(message);
        
        return {
          isModelWide: true,
          modelName: extractedModelName,
          searchPattern: mdxSearch ? 'mdx' : (formulaSearch ? 'formula' : undefined),
        };
      }
    }

    return { isModelWide: false };
  }

  private findBestModelNameMatch(userMessage: string, packageAnalysis: PackageAnalysisData): string | undefined {
    const availableModels = this.getAvailableModelNames(packageAnalysis);
    if (availableModels.length === 0) return undefined;

    let bestMatch: string | undefined;
    let bestScore = 0;

    for (const modelName of availableModels) {
      const score = this.calculateModelNameSimilarity(userMessage, modelName);
      if (score > bestScore && score >= 0.6) {
        bestScore = score;
        bestMatch = modelName;
      }
    }

    return bestMatch;
  }

  private calculateModelNameSimilarity(userMessage: string, modelName: string): number {
    const lowerMessage = userMessage.toLowerCase();
    const lowerModelName = modelName.toLowerCase();

    if (lowerMessage.includes(lowerModelName)) {
      return 1.0;
    }

    const modelWords = lowerModelName.split(/\s+/).filter(w => w.length > 1);
    if (modelWords.length === 0) return 0;

    let matchedWords = 0;
    for (const word of modelWords) {
      const singularWord = word.replace(/s$/, '');
      const pluralWord = word.endsWith('s') ? word : word + 's';
      
      if (lowerMessage.includes(word) || 
          lowerMessage.includes(singularWord) || 
          lowerMessage.includes(pluralWord)) {
        matchedWords++;
      }
    }

    return matchedWords / modelWords.length;
  }

  private async streamGenericRequest(
    context: PretOrchestratorContext,
    buildContext: BuildContext,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    console.log('[PretOrchestrator.streamGenericRequest] Starting with:', {
      hasPackageId: !!context.packageId,
      hasPackageAnalysis: !!context.packageAnalysis,
      packageId: context.packageId,
      dimensionCount: context.packageAnalysis?.dimensions?.length ?? 0,
      cubeCount: context.packageAnalysis?.cubes?.length ?? 0,
    });

    if (!context.packageId || !context.packageAnalysis) {
      console.log('[PretOrchestrator] No package context - returning no-access message');
      onChunk(this.getNoPackageAccessMessage());
      return;
    }

    const modelWideCheck = this.detectModelWideQuery(context.userMessage, context.packageAnalysis);
    if (modelWideCheck.isModelWide && this.pretContextService) {
      console.log('[PretOrchestrator] Model-wide query detected:', modelWideCheck);
      
      if (!modelWideCheck.modelName) {
        const availableModels = this.getAvailableModelNames(context.packageAnalysis);
        if (availableModels.length === 0) {
          onChunk("I detected a model-wide query, but I don't see any models in the package. Please upload a package with model data first.");
          return;
        }
        onChunk(`I can help you search across all dimensions in a model, but I need to know which model. Available models:\n\n${availableModels.map(m => `- **${m}**`).join('\n')}\n\nPlease specify which model you'd like me to search.`);
        return;
      }
      
      const multiResult = await this.pretContextService.loadMultipleContexts({
        conversationId: context.conversationId,
        tenantId: context.tenantId,
        packageId: context.packageId,
        modelName: modelWideCheck.modelName,
        packageAnalysis: context.packageAnalysis,
      });

      if (multiResult.success && multiResult.fileContexts.length > 0) {
        console.log('[PretOrchestrator] Loaded multiple files:', multiResult.filesLoaded);
        await this.streamAIWithMultipleFileContexts(
          context, 
          multiResult.fileContexts, 
          multiResult.filesLoaded,
          multiResult.filesSkipped,
          modelWideCheck.searchPattern,
          onChunk
        );
        return;
      } else if (multiResult.error) {
        onChunk(multiResult.error);
        return;
      }
    }

    if (this.detectsFileReadingIntent(context.userMessage)) {
      const loadResult = await this.loadFileContext(context);
      
      if (loadResult.success && loadResult.fileContext) {
        console.log('[PretOrchestrator] File loaded, passing to AI for friendly narrative');
        await this.streamAIWithFileContext(context, loadResult.fileContext, onChunk);
        return;
      } else if (loadResult.clarificationNeeded) {
        onChunk(loadResult.clarificationNeeded);
        return;
      }
    }
    
    const detectedType = this.detectObjectTypeFromMessage(context.userMessage);
    
    if (detectedType) {
      await this.streamSpecificObjectRequest(
        { ...context, targetObjectType: detectedType },
        buildContext,
        onChunk
      );
      return;
    }

    if (this.aiClient) {
      console.log('[PretOrchestrator] Streaming AI with package summary:', {
        packageId: context.packageAnalysis.packageId,
        dimensions: context.packageAnalysis.dimensions.map(d => d.name),
        cubes: context.packageAnalysis.cubes.map(c => c.name),
      });
      await this.streamAIWithPackageContext(context, onChunk);
      return;
    }

    onChunk(this.getNoPackageAccessMessage());
  }

  private async streamGenericRequestWithTracking(
    context: PretOrchestratorContext,
    buildContext: BuildContext,
    onChunk: (chunk: string) => void
  ): Promise<{ loadedFiles: string[]; modelName?: string; pendingModelSwitch?: string } | undefined> {
    console.log('[PretOrchestrator.streamGenericRequestWithTracking] Starting');

    if (!context.packageId || !context.packageAnalysis) {
      onChunk(this.getNoPackageAccessMessage());
      return undefined;
    }

    // Check for model switch confirmation (user saying "yes" to switch)
    const switchConfirmation = this.detectModelSwitchConfirmation(context.userMessage, context.sessionMemory);
    if (switchConfirmation.isConfirmation && switchConfirmation.targetModel) {
      console.log('[PretOrchestrator] Model switch confirmed, loading:', switchConfirmation.targetModel);
      return await this.loadModelWithDimensions(context, switchConfirmation.targetModel, onChunk);
    }

    // Check if user is asking about a different model than what's loaded
    const requestedModel = this.detectModelReference(context.userMessage, context.packageAnalysis);
    const currentModel = context.sessionMemory?.getActiveModelName();
    
    if (requestedModel && currentModel && requestedModel.toLowerCase() !== currentModel.toLowerCase()) {
      console.log('[PretOrchestrator] Model mismatch detected:', { current: currentModel, requested: requestedModel });
      
      // Store pending model switch in session memory context  
      const confirmationMessage = this.buildModelSwitchConfirmation(currentModel, requestedModel);
      onChunk(confirmationMessage);
      
      // Return with pendingModelSwitch flag - session memory will be updated by caller
      return {
        loadedFiles: [],
        modelName: currentModel,
        pendingModelSwitch: requestedModel,
      };
    }

    // If no model loaded but user is asking about a specific model, auto-load it
    if (requestedModel && !currentModel && this.pretContextService) {
      console.log('[PretOrchestrator] No model loaded, auto-loading requested model:', requestedModel);
      return await this.loadModelWithDimensions(context, requestedModel, onChunk);
    }

    // IMPORTANT: If a model is already loaded and user is asking questions (same model or no specific model reference),
    // try to get existing loaded contexts from PretContextService and answer using those
    const loadedFileNames = context.sessionMemory?.getLoadedFiles() || [];
    if (currentModel && loadedFileNames.length > 0 && this.pretContextService) {
      console.log('[PretOrchestrator] Model already loaded, using existing contexts:', { 
        currentModel, 
        loadedFileCount: loadedFileNames.length,
        loadedFiles: loadedFileNames 
      });
      
      // Get the loaded file contexts from the context service
      const existingContexts = await this.getLoadedContexts(context.conversationId);
      if (existingContexts && existingContexts.length > 0) {
        console.log('[PretOrchestrator] Using', existingContexts.length, 'existing file contexts for response');
        await this.streamAIWithMultipleFileContexts(
          context,
          existingContexts,
          loadedFileNames,
          [],
          undefined,
          onChunk
        );
        return {
          loadedFiles: loadedFileNames,
          modelName: currentModel,
        };
      }
    }

    const modelWideCheck = this.detectModelWideQuery(context.userMessage, context.packageAnalysis);
    if (modelWideCheck.isModelWide && this.pretContextService) {
      console.log('[PretOrchestrator] Model-wide query detected:', modelWideCheck);
      
      if (!modelWideCheck.modelName) {
        const availableModels = this.getAvailableModelNames(context.packageAnalysis);
        if (availableModels.length === 0) {
          onChunk("I detected a model-wide query, but I don't see any models in the package. Please upload a package with model data first.");
          return undefined;
        }
        onChunk(`I can help you search across all dimensions in a model, but I need to know which model. Available models:\n\n${availableModels.map(m => `- **${m}**`).join('\n')}\n\nPlease specify which model you'd like me to search.`);
        return undefined;
      }
      
      const multiResult = await this.pretContextService.loadMultipleContexts({
        conversationId: context.conversationId,
        tenantId: context.tenantId,
        packageId: context.packageId,
        modelName: modelWideCheck.modelName,
        packageAnalysis: context.packageAnalysis,
      });

      if (multiResult.success && multiResult.fileContexts.length > 0) {
        console.log('[PretOrchestrator] Loaded multiple files:', multiResult.filesLoaded);
        await this.streamAIWithMultipleFileContexts(
          context, 
          multiResult.fileContexts, 
          multiResult.filesLoaded,
          multiResult.filesSkipped,
          modelWideCheck.searchPattern,
          onChunk
        );
        return {
          loadedFiles: multiResult.filesLoaded,
          modelName: modelWideCheck.modelName,
        };
      } else if (multiResult.error) {
        onChunk(multiResult.error);
        return undefined;
      }
    }

    if (this.detectsFileReadingIntent(context.userMessage)) {
      const loadResult = await this.loadFileContext(context);
      
      if (loadResult.success && loadResult.fileContext) {
        console.log('[PretOrchestrator] File loaded, passing to AI for friendly narrative');
        await this.streamAIWithFileContext(context, loadResult.fileContext, onChunk);
        return {
          loadedFiles: [loadResult.fileContext.objectName],
          modelName: loadResult.fileContext.modelName,
        };
      } else if (loadResult.clarificationNeeded) {
        onChunk(loadResult.clarificationNeeded);
        return undefined;
      } else if (loadResult.error) {
        // Explicit file-not-found handling - NEVER fall back to AI without file data
        console.log('[PretOrchestrator] File loading failed with error:', loadResult.error);
        onChunk(`I couldn't access the requested file. ${loadResult.error}\n\n` +
                `Please specify a valid dimension or model name from the package.`);
        return undefined;
      }
    }
    
    const detectedType = this.detectObjectTypeFromMessage(context.userMessage);
    
    if (detectedType) {
      await this.streamSpecificObjectRequest(
        { ...context, targetObjectType: detectedType },
        buildContext,
        onChunk
      );
      return undefined;
    }

    if (this.aiClient) {
      await this.streamAIWithPackageContext(context, onChunk);
      return undefined;
    }

    onChunk(this.getNoPackageAccessMessage());
    return undefined;
  }

  private async handleSpecificObjectRequest(
    context: PretOrchestratorContext,
    buildContext: BuildContext
  ): Promise<PretOutputDto> {
    const objectType = context.targetObjectType!;
    const tool = this.toolRegistry.getTool(objectType);

    if (!tool) {
      return {
        success: false,
        error: `No tool available for ${objectType}. Supported types: ${this.toolRegistry.getSupportedObjectTypes().join(', ')}`,
      };
    }

    const suggestedOrder = this.dependencyResolver.getSuggestedOrder(objectType);
    const missingDeps = suggestedOrder.filter(
      type => type !== objectType && buildContext.getObjectsByType(type).length === 0
    );

    if (missingDeps.length > 0) {
      return {
        success: false,
        clarificationNeeded: `I can see you're asking about ${objectType}. To find specific information, please tell me the name of the dimension or model you'd like to explore.`,
        missingDependencies: missingDeps,
      };
    }

    const result = await tool.execute({
      tenantId: context.tenantId,
      conversationId: context.conversationId,
      userMessage: context.userMessage,
      buildContext,
      onChunk: context.onChunk,
    });

    if (result.success && result.output) {
      buildContext.addObject(result.output);
      await this.contextRepository.save(buildContext);
    }

    return {
      success: result.success,
      yaml: result.output?.content,
      objectType: result.output?.objectType,
      objectName: result.output?.objectName,
      isValid: result.output?.isValid,
      errors: result.output?.errors ? [...result.output.errors] : undefined,
      clarificationNeeded: result.clarificationNeeded,
      error: result.error,
    };
  }

  private async streamSpecificObjectRequest(
    context: PretOrchestratorContext,
    buildContext: BuildContext,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const objectType = context.targetObjectType!;
    const tool = this.toolRegistry.getTool(objectType);

    if (!tool) {
      onChunk(`I don't have a tool for ${objectType} yet. Supported types: ${this.toolRegistry.getSupportedObjectTypes().join(', ')}`);
      return;
    }

    const suggestedOrder = this.dependencyResolver.getSuggestedOrder(objectType);
    const missingDeps = suggestedOrder.filter(
      type => type !== objectType && buildContext.getObjectsByType(type).length === 0
    );

    if (missingDeps.length > 0) {
      onChunk(`I can see you're asking about ${objectType}. To find specific information, please tell me the name of the dimension or model you'd like to explore.`);
      return;
    }

    const result = await tool.execute({
      tenantId: context.tenantId,
      conversationId: context.conversationId,
      userMessage: context.userMessage,
      buildContext,
      onChunk,
    });

    if (result.success && result.output) {
      buildContext.addObject(result.output);
      await this.contextRepository.save(buildContext);
    }
  }

  private detectObjectTypeFromMessage(message: string): PretObjectTypeName | null {
    const lowerMessage = message.toLowerCase();

    const patterns: Array<{ pattern: RegExp; type: PretObjectTypeName }> = [
      { pattern: /\b(cube|model)\b/i, type: 'Cube' },
      { pattern: /\b(account|accounts|account dimension)\b/i, type: 'AccountDimension' },
      { pattern: /\b(time|time dimension|calendar|fiscal)\b/i, type: 'TimeDimension' },
      { pattern: /\b(version|version dimension|scenario)\b/i, type: 'VersionDimension' },
      { pattern: /\b(currency|currencies|currency dimension)\b/i, type: 'CurrencyDimension' },
      { pattern: /\b(entity|entities|entity dimension|department|company)\b/i, type: 'EntityDimension' },
      { pattern: /\b(dimension)\b/i, type: 'GenericDimension' },
    ];

    for (const { pattern, type } of patterns) {
      if (pattern.test(lowerMessage)) {
        return type;
      }
    }

    return null;
  }

  private getGuidanceMessage(buildContext: BuildContext): string {
    let message = `I'm the PRET Agent, and I can help you explore Prophix FP&A Plus packages. `;
    
    if (buildContext.isEmpty()) {
      message += `Upload a PRET package to get started. Once uploaded, I can help you:\n\n`;
    } else {
      message += `${buildContext.getDimensionSummary()}\n\nI can help you:\n\n`;
    }

    message += `- View models, dimensions, and cubes in your package\n`;
    message += `- Explore dimension members and structure\n`;
    message += `- Answer questions about your package configuration\n`;
    message += `\n\nWhat would you like to know about your package?`;

    return message;
  }

  private getAvailableModelNames(packageAnalysis?: PackageAnalysisData): string[] {
    if (!packageAnalysis) return [];
    
    const modelNames = new Set<string>();
    for (const dim of packageAnalysis.dimensions) {
      if (dim.modelName) {
        modelNames.add(dim.modelName);
      }
    }
    for (const cube of packageAnalysis.cubes) {
      modelNames.add(cube.name);
    }
    return Array.from(modelNames).sort();
  }

  private getNoPackageAccessMessage(): string {
    return `I don't have access to a PRET package yet.

To explore your package, please:
1. **Upload a package**: Click the attachment button and select your PRET package ZIP file
2. **Wait for upload**: The system will analyze the package contents
3. **Ask questions**: Once uploaded, I can tell you about the models, dimensions, and cubes in your package

I will never make up or guess information about packages. I only answer based on actual package data.`;
  }

  private buildPackageSummary(packageAnalysis: PackageAnalysisData): string {
    const lines: string[] = [
      `# Package: "${packageAnalysis.packageName}" (ID: ${packageAnalysis.packageId})`,
      '',
    ];

    const modelNames = new Set<string>();
    for (const dim of packageAnalysis.dimensions) {
      if (dim.modelName) {
        modelNames.add(dim.modelName);
      }
    }
    for (const cube of packageAnalysis.cubes) {
      modelNames.add(cube.name);
    }

    const modelNamesArray = Array.from(modelNames);
    lines.push(`## Models (${modelNamesArray.length})`);
    for (const modelName of modelNamesArray) {
      const modelDimensions = packageAnalysis.dimensions.filter(d => d.modelName === modelName);
      lines.push(`- **${modelName}**`);
      if (modelDimensions.length > 0) {
        lines.push(`  - Dimensions: ${modelDimensions.map(d => d.name).join(', ')}`);
      }
    }

    lines.push('');
    lines.push(`## All Dimensions (${packageAnalysis.dimensions.length})`);
    
    for (const dim of packageAnalysis.dimensions) {
      const memberNote = dim.memberCount ? ` - ${dim.memberCount} members` : '';
      const modelNote = dim.modelName ? ` (${dim.modelName})` : '';
      lines.push(`- **${dim.name}**${modelNote}${memberNote}`);
    }

    if (packageAnalysis.cubes.length > 0) {
      lines.push('');
      lines.push(`## Cubes (${packageAnalysis.cubes.length})`);
      for (const cube of packageAnalysis.cubes) {
        const dimList = cube.dimensions ? cube.dimensions.join(', ') : '';
        lines.push(`- **${cube.name}**${dimList ? `: ${dimList}` : ''}`);
      }
    }

    return lines.join('\n');
  }

  private buildSystemPromptWithPackageContext(packageAnalysis: PackageAnalysisData, sessionMemory?: PretSessionMemory): string {
    const packageSummary = this.buildPackageSummary(packageAnalysis);
    
    let sessionMemorySection = '';
    if (sessionMemory) {
      sessionMemorySection = `
## Session Memory (Preserved from Previous Conversation)

${sessionMemory.toContextPrompt()}

**IMPORTANT**: The session memory above shows what we discussed previously. Use this to maintain context continuity.
`;
    }
    
    return `You are PRET AI, a specialized assistant for viewing and exploring PRET packages for Prophix FP&A Plus.

## CRITICAL RULES - NEVER VIOLATE

1. **NEVER HALLUCINATE OR INVENT DATA** - Only respond with information EXPLICITLY present in the package context below. If the data is not listed, say "I don't see that in the package."
2. **NEVER GUESS** - If you're unsure about something, say so. Do not make up model names, dimension names, member counts, or any other data.
3. **CITE YOUR SOURCE** - When answering, reference the specific models/dimensions from the context below.
${sessionMemorySection}
## Package Context (THIS IS YOUR ONLY SOURCE OF TRUTH)

${packageSummary}

## Your Capabilities

You can ONLY answer questions based on the package context above:
- List models and dimensions that are EXPLICITLY shown above
- Provide counts and statistics ONLY from the data above
- Describe the package structure based on what's listed

## What You Cannot Do

- Invent or guess any data not shown in the package context
- Create, modify, or generate YAML content
- Access file contents beyond what's summarized above

## Response Style

- ONLY answer based on the package context above
- If the user asks about something not in the context, say: "I don't see [X] in the current package context."
- Be direct and concise
- Use Prophix/FP&A terminology appropriately`;
  }

  private async callAIWithPackageContext(context: PretOrchestratorContext): Promise<string> {
    if (!this.aiClient || !context.packageAnalysis) {
      return this.getNoPackageAccessMessage();
    }

    const systemPrompt = this.buildSystemPromptWithPackageContext(context.packageAnalysis, context.sessionMemory);
    const model = ModelId.sonnet();

    try {
      const response = await this.aiClient.chat({
        model,
        systemPrompt,
        messages: [AIMessage.user(context.userMessage)],
        maxTokens: 2048,
        temperature: 0.7,
      });

      return response.content;
    } catch (error) {
      console.error('[PretOrchestrator] AI call failed:', error);
      return 'I encountered an error while processing your request. Please try again.';
    }
  }

  private async streamAIWithPackageContext(
    context: PretOrchestratorContext,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    console.log('[PretOrchestrator.streamAIWithPackageContext] Starting');
    
    if (!this.aiClient || !context.packageAnalysis) {
      console.log('[PretOrchestrator.streamAIWithPackageContext] No AI client or package analysis');
      onChunk(this.getNoPackageAccessMessage());
      return;
    }

    const systemPrompt = this.buildSystemPromptWithPackageContext(context.packageAnalysis, context.sessionMemory);
    const model = ModelId.sonnet();

    console.log('[PretOrchestrator.streamAIWithPackageContext] Calling AI with model:', model.toString(), 'sessionMemory:', !!context.sessionMemory);

    try {
      let chunkCount = 0;
      await this.aiClient.streamChat(
        {
          model,
          systemPrompt,
          messages: [AIMessage.user(context.userMessage)],
          maxTokens: 2048,
          temperature: 0.7,
        },
        (chunk) => {
          if (chunk.type === 'content' && chunk.content) {
            chunkCount++;
            onChunk(chunk.content);
          }
        }
      );
      console.log('[PretOrchestrator.streamAIWithPackageContext] Stream complete, chunks:', chunkCount);
    } catch (error) {
      console.error('[PretOrchestrator] AI stream failed:', error);
      onChunk('I encountered an error while processing your request. Please try again.');
    }
  }

  private async callAIWithFileContext(
    context: PretOrchestratorContext,
    fileContext: FileContext
  ): Promise<string> {
    if (!this.aiClient) {
      return this.getNoPackageAccessMessage();
    }

    const systemPrompt = this.buildFileContextSystemPrompt(context, fileContext);
    const model = ModelId.sonnet();

    try {
      const response = await this.aiClient.chat({
        model,
        systemPrompt,
        messages: [AIMessage.user(context.userMessage)],
        maxTokens: 2048,
        temperature: 0.7,
      });

      return response.content;
    } catch (error) {
      console.error('[PretOrchestrator] AI call with file context failed:', error);
      return 'I encountered an error while processing your request. Please try again.';
    }
  }

  private async streamAIWithFileContext(
    context: PretOrchestratorContext,
    fileContext: FileContext,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    console.log('[PretOrchestrator.streamAIWithFileContext] Starting for:', fileContext.objectName);
    
    if (!this.aiClient) {
      console.log('[PretOrchestrator.streamAIWithFileContext] No AI client');
      onChunk(this.getNoPackageAccessMessage());
      return;
    }

    const systemPrompt = this.buildFileContextSystemPrompt(context, fileContext);
    const model = ModelId.sonnet();

    console.log('[PretOrchestrator.streamAIWithFileContext] Calling AI with model:', model.toString());

    try {
      let chunkCount = 0;
      await this.aiClient.streamChat(
        {
          model,
          systemPrompt,
          messages: [AIMessage.user(context.userMessage)],
          maxTokens: 2048,
          temperature: 0.7,
        },
        (chunk) => {
          if (chunk.type === 'content' && chunk.content) {
            chunkCount++;
            onChunk(chunk.content);
          }
        }
      );
      console.log('[PretOrchestrator.streamAIWithFileContext] Stream complete, chunks:', chunkCount);
    } catch (error) {
      console.error('[PretOrchestrator] AI stream with file context failed:', error);
      onChunk('I encountered an error while processing your request. Please try again.');
    }
  }

  private buildFileContextSystemPrompt(context: PretOrchestratorContext, fileContext: FileContext): string {
    const packageInfo = context.packageAnalysis 
      ? `Package: "${context.packageAnalysis.packageName}" (ID: ${context.packageAnalysis.packageId})`
      : 'Package: Unknown';

    const sessionMemoryContext = this.buildSessionMemoryContext(context.sessionMemory);

    return `You are PRET AI, a specialized assistant for viewing and exploring PRET packages for Prophix FP&A Plus.
${sessionMemoryContext}

## CRITICAL ANTI-HALLUCINATION RULES - MUST FOLLOW

1. **NEVER INVENT DATA** - Only describe what is EXPLICITLY shown in the file content below
2. **CITE YOUR SOURCE** - Reference the specific file path when describing content
3. **ADMIT LIMITATIONS** - If the file content is truncated or incomplete, say so
4. **NO GUESSING** - If asked about content not in this file, say "I only have ${fileContext.objectName} loaded. I don't have access to other files unless you ask me to load them."

## Your Task
The user asked about a specific file in their package. I have loaded the file details below. 
Your job is to provide a **user-friendly, narrative response** that explains the content clearly.

## FORMAT RULES
1. **DO NOT dump raw YAML** - Summarize and explain the content in natural language
2. **Be concise but informative** - Highlight the most important aspects
3. **Use proper formatting** - Use bullet points, headers, and bold text for readability
4. **Reference actual data** - Only mention what's explicitly in the file context below

## ${packageInfo}

## LOADED FILE (This is the ONLY file I have access to right now)

**File:** ${fileContext.objectName}
**Type:** ${fileContext.objectType}
${fileContext.modelName ? `**Model:** ${fileContext.modelName}` : ''}
**Path:** ${fileContext.filePath}
**Members/Accounts:** ${fileContext.memberCount}
**Has Calculations:** ${fileContext.hasCalculations ? 'Yes' : 'No'}
**File Size:** ${(fileContext.totalBytes / 1024).toFixed(1)} KB

### File Content Summary
${fileContext.summary}

${fileContext.fullContent ? `### Full Content (for reference)\n\`\`\`yaml\n${fileContext.fullContent.substring(0, 8000)}\n\`\`\`` : '### Note: Full content not loaded (file too large)'}

## Response Guidelines
- Explain what this ${fileContext.objectType} is and what it contains
- List key elements (dimensions, members, calculations) in a readable format
- If it's a model/cube, describe its dimensions and purpose
- If it's a dimension, describe its hierarchy and member structure
- If user asks about OTHER files, remind them you only have ${fileContext.objectName} loaded`;
  }

  private async streamAIWithMultipleFileContexts(
    context: PretOrchestratorContext,
    fileContexts: FileContext[],
    filesLoaded: string[],
    filesSkipped: string[],
    searchPattern: string | undefined,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    console.log('[PretOrchestrator.streamAIWithMultipleFileContexts] Starting with:', {
      fileCount: fileContexts.length,
      filesLoaded,
      filesSkipped,
      searchPattern,
    });
    
    if (!this.aiClient) {
      onChunk(this.getNoPackageAccessMessage());
      return;
    }

    const systemPrompt = this.buildMultiFileContextSystemPrompt(
      context, 
      fileContexts, 
      filesLoaded, 
      filesSkipped,
      searchPattern
    );
    const model = ModelId.sonnet();

    console.log('[PretOrchestrator.streamAIWithMultipleFileContexts] Calling AI with model:', model.toString());

    try {
      let chunkCount = 0;
      await this.aiClient.streamChat(
        {
          model,
          systemPrompt,
          messages: [AIMessage.user(context.userMessage)],
          maxTokens: 4096,
          temperature: 0.7,
        },
        (chunk) => {
          if (chunk.type === 'content' && chunk.content) {
            chunkCount++;
            onChunk(chunk.content);
          }
        }
      );
      console.log('[PretOrchestrator.streamAIWithMultipleFileContexts] Stream complete, chunks:', chunkCount);
    } catch (error) {
      console.error('[PretOrchestrator] AI stream with multiple file contexts failed:', error);
      onChunk('I encountered an error while processing your request. Please try again.');
    }
  }

  private buildMultiFileContextSystemPrompt(
    context: PretOrchestratorContext,
    fileContexts: FileContext[],
    filesLoaded: string[],
    filesSkipped: string[],
    searchPattern?: string
  ): string {
    const packageInfo = context.packageAnalysis 
      ? `Package: "${context.packageAnalysis.packageName}" (ID: ${context.packageAnalysis.packageId})`
      : 'Package: Unknown';

    const modelName = fileContexts[0]?.modelName || 'Unknown Model';
    const sessionMemoryContext = this.buildSessionMemoryContext(context.sessionMemory);
    
    let provenanceSection = `## PROVENANCE - FILES ACTUALLY LOADED\n\n`;
    provenanceSection += `**Model:** ${modelName}\n`;
    provenanceSection += `**Total Files Loaded:** ${filesLoaded.length}\n`;
    provenanceSection += `**Files Loaded:** ${filesLoaded.join(', ')}\n`;
    if (filesSkipped.length > 0) {
      provenanceSection += `**Files Skipped:** ${filesSkipped.join(', ')}\n`;
    }
    provenanceSection += `\n**IMPORTANT:** You have ONLY seen the ${filesLoaded.length} files listed above. You have NOT seen any other files.\n`;

    let fileContentsSection = '';
    for (const fc of fileContexts) {
      fileContentsSection += `\n---\n\n### ${fc.objectName} (${fc.objectType})\n`;
      fileContentsSection += `- **Path:** ${fc.filePath}\n`;
      fileContentsSection += `- **Members:** ${fc.memberCount}\n`;
      fileContentsSection += `- **Has Calculations:** ${fc.hasCalculations ? 'Yes' : 'No'}\n`;
      fileContentsSection += `- **Size:** ${(fc.totalBytes / 1024).toFixed(1)} KB\n`;
      
      if (fc.fullContent) {
        const contentToShow = fc.fullContent.substring(0, 15000);
        const wasTruncated = fc.fullContent.length > 15000;
        fileContentsSection += `\n**File Content:**\n\`\`\`yaml\n${contentToShow}${wasTruncated ? '\n... [TRUNCATED - large file]' : ''}\n\`\`\`\n`;
      } else {
        fileContentsSection += `\n**Summary:** ${fc.summary}\n`;
      }
    }

    let searchInstructions = '';
    if (searchPattern === 'mdx') {
      searchInstructions = `
## SEARCH TASK: Find MDX Formulas

The user is searching for MDX formulas. Look for these indicators in the file contents:
- "Formula Syntax: Mdx" or "Formula Syntax: MDX" in comments
- "formulaSyntax: Mdx" or "formulaSyntax: MDX" in YAML
- MDX-like expressions (e.g., [Dimension].[Member], AGGREGATE, SUM, FILTER, etc.)

**IMPORTANT:** Only report what you ACTUALLY find in the file contents below. Do NOT make up examples.
If no MDX formulas are found, clearly state: "I did not find any MDX formulas in the ${filesLoaded.length} dimension files I examined."
`;
    } else if (searchPattern === 'formula') {
      searchInstructions = `
## SEARCH TASK: Find Formulas/Calculations

The user is searching for formulas or calculations. Look for:
- "calculations:" sections in YAML
- Formula definitions with MDX or Prophix syntax
- Any computed/derived members

**IMPORTANT:** Only report what you ACTUALLY find. Do NOT make up examples.
`;
    }

    return `You are PRET AI, a specialized assistant for viewing and exploring PRET packages for Prophix FP&A Plus.
${sessionMemoryContext}

## CRITICAL ANTI-HALLUCINATION RULES

1. **NEVER claim to have checked files not listed in PROVENANCE** - You only have access to the ${filesLoaded.length} files listed below. If asked about other files, say "I don't have access to that file."
2. **NEVER invent or guess data** - Only report what is EXPLICITLY present in the file contents below.
3. **BE HONEST about limitations** - If file content was truncated or not loaded, say so.
4. **CITE specific files** - When reporting findings, name which specific file(s) contain them.

${provenanceSection}

## ${packageInfo}

${searchInstructions}

## LOADED FILE CONTENTS

The following ${fileContexts.length} dimension files were loaded from the "${modelName}" model:

${fileContentsSection}

## Response Format

1. **State which files you examined** (be specific about the count)
2. **Report your findings** with citations to specific files
3. **Be explicit if nothing was found** - Don't claim to have searched files you didn't receive
4. **Use clear formatting** - Tables, bullet points, headers for readability`;
  }

  private buildSessionMemoryContext(sessionMemory: PretSessionMemory | undefined): string {
    if (!sessionMemory) {
      return '';
    }
    return '\n' + sessionMemory.toContextPrompt() + '\n';
  }

  private detectModelReference(userMessage: string, packageAnalysis: PackageAnalysisData): string | undefined {
    const lowerMessage = userMessage.toLowerCase();
    const availableModels = this.getAvailableModelNames(packageAnalysis);
    
    for (const modelName of availableModels) {
      const lowerModelName = modelName.toLowerCase();
      if (lowerMessage.includes(lowerModelName)) {
        return modelName;
      }
      
      // Check for partial word matches (e.g., "jobs" matches "Jobs Reporting")
      const modelWords = lowerModelName.split(/\s+/).filter(w => w.length > 2);
      const significantMatches = modelWords.filter(word => lowerMessage.includes(word));
      if (significantMatches.length > 0 && significantMatches.length >= modelWords.length * 0.5) {
        return modelName;
      }
    }
    
    return undefined;
  }

  private detectModelSwitchConfirmation(
    userMessage: string,
    sessionMemory?: PretSessionMemory
  ): { isConfirmation: boolean; targetModel?: string } {
    const lowerMessage = userMessage.toLowerCase().trim();
    
    const pendingSwitch = sessionMemory?.getPendingModelSwitch?.();
    if (!pendingSwitch) {
      return { isConfirmation: false };
    }
    
    const confirmPatterns = [
      /^(yes|yep|yeah|sure|ok|okay|go ahead|switch|load it|please|confirm|do it|proceed)[\s!.]*$/i,
      /^(yes|sure|okay)\s*(please|switch|load)/i,
      /switch\s+(to\s+)?it/i,
      /load\s+(it|the\s+model)/i,
    ];
    
    for (const pattern of confirmPatterns) {
      if (pattern.test(lowerMessage)) {
        return { isConfirmation: true, targetModel: pendingSwitch };
      }
    }
    
    return { isConfirmation: false };
  }

  private buildModelSwitchConfirmation(currentModel: string, requestedModel: string): string {
    return `I currently have the **${currentModel}** model loaded with its dimensions.\n\n` +
           `Would you like me to switch to the **${requestedModel}** model instead? ` +
           `This will unload the current model's context and load ${requestedModel} with all its dimensions.\n\n` +
           `Reply **"yes"** to confirm the switch, or ask me something else about ${currentModel}.`;
  }

  private async loadModelWithDimensions(
    context: PretOrchestratorContext,
    modelName: string,
    onChunk: (chunk: string) => void
  ): Promise<{ loadedFiles: string[]; modelName?: string }> {
    if (!this.pretContextService || !context.packageId || !context.packageAnalysis) {
      onChunk(`Unable to load model "${modelName}" - missing package context.`);
      // Return undefined modelName so session memory won't be updated with a failed load
      return { loadedFiles: [] };
    }

    onChunk(`Loading **${modelName}** model with all its dimensions...\n\n`);

    const multiResult = await this.pretContextService.loadMultipleContexts({
      conversationId: context.conversationId,
      tenantId: context.tenantId,
      packageId: context.packageId,
      modelName: modelName,
      packageAnalysis: context.packageAnalysis,
    });

    if (!multiResult.success || multiResult.fileContexts.length === 0) {
      onChunk(`I couldn't find any dimension files for the "${modelName}" model. ` +
              `Please check that this model exists in the package and has associated dimensions.`);
      // Return undefined modelName so session memory won't be updated with a failed load
      return { loadedFiles: [] };
    }

    // Build a summary of what was loaded
    const loadedSummary = multiResult.filesLoaded.map(f => `- ${f}`).join('\n');
    const skippedSummary = multiResult.filesSkipped.length > 0 
      ? `\n\n**Skipped:** ${multiResult.filesSkipped.join(', ')}`
      : '';

    onChunk(`**${modelName}** model loaded successfully!\n\n` +
            `**Loaded ${multiResult.filesLoaded.length} dimension files:**\n${loadedSummary}${skippedSummary}\n\n` +
            `You can now ask me about any of these dimensions - their members, calculations, structure, or search for specific patterns like MDX formulas.`);

    // Only return modelName when load is successful - this signals to caller to update session memory
    return {
      loadedFiles: multiResult.filesLoaded,
      modelName: modelName,
    };
  }
}
