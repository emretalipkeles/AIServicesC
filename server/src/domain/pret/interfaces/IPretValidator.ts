import type { ValidationError } from '../value-objects/YamlOutput';
import type { BuildContext } from '../entities/BuildContext';
import type { PretObjectTypeName } from '../value-objects/ObjectType';

export interface SchemaValidationResult {
  readonly isValid: boolean;
  readonly errors: ValidationError[];
}

export interface ReferenceValidationResult {
  readonly isValid: boolean;
  readonly errors: ValidationError[];
  readonly missingReferences: MissingReference[];
}

export interface MissingReference {
  readonly objectType: PretObjectTypeName;
  readonly objectName: string;
  readonly referencedIn: string;
}

export interface ISchemaValidator {
  validateSchema(yamlContent: string, schemaPath: string): Promise<SchemaValidationResult>;
  
  getSchema(schemaPath: string): Promise<string | null>;
}

export interface IReferenceValidator {
  validateReferences(
    yamlContent: string,
    objectType: PretObjectTypeName,
    buildContext: BuildContext
  ): Promise<ReferenceValidationResult>;
}

export interface IPretValidator extends ISchemaValidator, IReferenceValidator {
  validateAll(
    yamlContent: string,
    objectType: PretObjectTypeName,
    schemaPath: string,
    buildContext: BuildContext
  ): Promise<{
    schemaResult: SchemaValidationResult;
    referenceResult: ReferenceValidationResult;
    allErrors: ValidationError[];
    isValid: boolean;
  }>;
}
