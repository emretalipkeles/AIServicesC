export { ObjectType } from './value-objects/ObjectType';
export type { PretObjectTypeName, ObjectTypeDependency } from './value-objects/ObjectType';

export { YamlOutput } from './value-objects/YamlOutput';
export type { ValidationError } from './value-objects/YamlOutput';

export { FileContext } from './value-objects/FileContext';
export type { FileContextProps } from './value-objects/FileContext';

export { PretTool } from './entities/PretTool';
export type { ToolExecutionContext, ToolExecutionResult } from './entities/PretTool';

export { BuildContext } from './entities/BuildContext';
export type { CreatedObject } from './entities/BuildContext';

export { PretPackageSession } from './entities/PretPackageSession';
export type { PretPackageSessionProps, PackageSessionStatus } from './entities/PretPackageSession';

export type { IPretToolRegistry } from './interfaces/IPretToolRegistry';
export type { 
  IPretPackageStorage, 
  UploadResult, 
  PackageValidationResult 
} from './interfaces/IPretPackageStorage';
export type { IPretPackageSessionRepository } from './interfaces/IPretPackageSessionRepository';
export type { 
  ISchemaValidator, 
  IReferenceValidator, 
  IPretValidator,
  SchemaValidationResult,
  ReferenceValidationResult,
  MissingReference
} from './interfaces/IPretValidator';
export type { IBuildContextRepository } from './interfaces/IBuildContextRepository';

export type { 
  IPretFileLocator,
  FileLocationResult,
  MultiFileLocationResult,
  FileLocationMatch,
  PackageAnalysisData,
  DimensionInfo,
  CubeInfo
} from './interfaces/IPretFileLocator';

export type {
  IPretFileReader,
  FileChunk,
  FileReadResult,
  FileReadOptions
} from './interfaces/IPretFileReader';

export type {
  IFileContextRepository,
  FileContextKey
} from './interfaces/IFileContextRepository';

export type { IPackageAnalysisCache } from './interfaces/IPackageAnalysisCache';

export type {
  IPretCommand,
  PretCommandType,
  ListModelsArgs,
  ListDimensionsArgs,
  GetCubeDetailsArgs,
  GetDimensionDetailsArgs,
  UpdateCubeArgs,
  UpdateDimensionArgs,
  CreateOtherDimensionArgs,
  DimensionKind
} from './interfaces/IPretCommand';

export type {
  IPretCommandResult,
  ModelInfo,
  DimensionReference,
  DimensionInfo as CommandDimensionInfo,
  CubeDetailsResult,
  DimensionDetailsResult,
  MemberSummary,
  PropertyDefinition,
  ListModelsResult,
  ListDimensionsResult,
  UpdateResult,
  CreateOtherDimensionResult
} from './interfaces/IPretCommandResult';

export type {
  IPretCommandHandler,
  IPretCommandRegistry
} from './interfaces/IPretCommandHandler';

export type {
  IFuzzyMatcher,
  FuzzyMatchResult
} from './interfaces/IFuzzyMatcher';

export { FuzzyMatcher } from './services/FuzzyMatcher';

export { ClassifiedIntent } from './value-objects/ClassifiedIntent';
export type { ClassifiedIntentProps } from './value-objects/ClassifiedIntent';

export type { CommandDescriptor, CommandArgDescriptor } from './value-objects/CommandDescriptor';
export { createCommandDescriptor } from './value-objects/CommandDescriptor';

export type { IIntentClassifier } from './interfaces/IIntentClassifier';

export type { 
  IResponseNarrator, 
  NarratorContext 
} from './interfaces/IResponseNarrator';

export { PretInteractionSummary } from './value-objects/PretInteractionSummary';
export type { PretInteractionSummaryProps } from './value-objects/PretInteractionSummary';

export { ObjectGeneratedEvent } from './events/ObjectGeneratedEvent';
