import type { 
  IPretValidator, 
  SchemaValidationResult, 
  ReferenceValidationResult 
} from '../../../domain/pret/interfaces/IPretValidator';
import type { PretObjectTypeName } from '../../../domain/pret/value-objects/ObjectType';
import type { BuildContext } from '../../../domain/pret/entities/BuildContext';
import type { ValidationError } from '../../../domain/pret/value-objects/YamlOutput';
import { SchemaValidator } from './SchemaValidator';
import { ReferenceValidator } from './ReferenceValidator';

export class PretValidator implements IPretValidator {
  private readonly schemaValidator: SchemaValidator;
  private readonly referenceValidator: ReferenceValidator;

  constructor(schemasDir?: string) {
    this.schemaValidator = new SchemaValidator(schemasDir);
    this.referenceValidator = new ReferenceValidator();
  }

  async validateSchema(yamlContent: string, schemaPath: string): Promise<SchemaValidationResult> {
    return this.schemaValidator.validateSchema(yamlContent, schemaPath);
  }

  async getSchema(schemaPath: string): Promise<string | null> {
    return this.schemaValidator.getSchema(schemaPath);
  }

  async validateReferences(
    yamlContent: string,
    objectType: PretObjectTypeName,
    buildContext: BuildContext
  ): Promise<ReferenceValidationResult> {
    return this.referenceValidator.validateReferences(yamlContent, objectType, buildContext);
  }

  async validateAll(
    yamlContent: string,
    objectType: PretObjectTypeName,
    schemaPath: string,
    buildContext: BuildContext
  ): Promise<{
    schemaResult: SchemaValidationResult;
    referenceResult: ReferenceValidationResult;
    allErrors: ValidationError[];
    isValid: boolean;
  }> {
    const [schemaResult, referenceResult] = await Promise.all([
      this.validateSchema(yamlContent, schemaPath),
      this.validateReferences(yamlContent, objectType, buildContext),
    ]);

    const allErrors: ValidationError[] = [
      ...schemaResult.errors,
      ...referenceResult.errors,
    ];

    const isValid = schemaResult.isValid && referenceResult.isValid;

    return {
      schemaResult,
      referenceResult,
      allErrors,
      isValid,
    };
  }
}
