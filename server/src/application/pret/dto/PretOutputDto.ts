import type { PretObjectTypeName } from '../../../domain/pret/value-objects/ObjectType';
import type { ValidationError } from '../../../domain/pret/value-objects/YamlOutput';

export interface PretOutputDto {
  success: boolean;
  yaml?: string;
  objectType?: PretObjectTypeName;
  objectName?: string;
  isValid?: boolean;
  errors?: ValidationError[];
  clarificationNeeded?: string;
  missingDependencies?: string[];
  error?: string;
}

export interface PretSessionDto {
  tenantId: string;
  conversationId: string;
  objectCount: number;
  createdObjects: PretObjectSummaryDto[];
}

export interface PretObjectSummaryDto {
  objectType: PretObjectTypeName;
  objectName: string;
  isValid: boolean;
  createdAt: Date;
}
