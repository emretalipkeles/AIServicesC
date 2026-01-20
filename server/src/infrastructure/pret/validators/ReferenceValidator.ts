import type { IReferenceValidator, ReferenceValidationResult, MissingReference } from '../../../domain/pret/interfaces/IPretValidator';
import type { PretObjectTypeName } from '../../../domain/pret/value-objects/ObjectType';
import type { BuildContext } from '../../../domain/pret/entities/BuildContext';
import type { ValidationError } from '../../../domain/pret/value-objects/YamlOutput';

export class ReferenceValidator implements IReferenceValidator {
  async validateReferences(
    yamlContent: string,
    objectType: PretObjectTypeName,
    buildContext: BuildContext
  ): Promise<ReferenceValidationResult> {
    const errors: ValidationError[] = [];
    const missingReferences: MissingReference[] = [];

    if (objectType === 'Cube') {
      const dimensionRefs = this.extractDimensionReferences(yamlContent);
      
      for (const ref of dimensionRefs) {
        if (!this.dimensionExists(ref.name, ref.kind, buildContext)) {
          missingReferences.push({
            objectType: ref.kind as PretObjectTypeName,
            objectName: ref.name,
            referencedIn: 'spec.dimensions',
          });
          errors.push({
            path: `spec.dimensions[${ref.name}]`,
            message: `Referenced dimension "${ref.name}" of type "${ref.kind}" not found in build context`,
            severity: 'warning',
          });
        }
      }
    }

    if (objectType === 'AccountDimension') {
      const parentRefs = this.extractParentReferences(yamlContent);
      const memberKeys = this.extractMemberKeys(yamlContent);

      for (const parentRef of parentRefs) {
        if (parentRef && !memberKeys.includes(parentRef)) {
          errors.push({
            path: `spec.members[parent=${parentRef}]`,
            message: `Parent member "${parentRef}" not found in dimension members`,
            severity: 'error',
          });
        }
      }

      const linkedCube = this.extractLinkedCube(yamlContent);
      if (linkedCube && !this.cubeExists(linkedCube, buildContext)) {
        missingReferences.push({
          objectType: 'Cube',
          objectName: linkedCube,
          referencedIn: 'spec.linked.cube',
        });
        errors.push({
          path: 'spec.linked.cube',
          message: `Referenced cube "${linkedCube}" not found in build context`,
          severity: 'warning',
        });
      }
    }

    return {
      isValid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
      missingReferences,
    };
  }

  private extractDimensionReferences(yamlContent: string): Array<{ name: string; kind: string }> {
    const refs: Array<{ name: string; kind: string }> = [];
    const dimensionPattern = /kind:\s*["']?(\w+Dimension)["']?\s*\n\s*name:\s*["']?([^"'\n]+)["']?/g;
    
    let match;
    while ((match = dimensionPattern.exec(yamlContent)) !== null) {
      refs.push({
        kind: match[1],
        name: match[2].trim(),
      });
    }

    return refs;
  }

  private extractParentReferences(yamlContent: string): string[] {
    const refs: string[] = [];
    const parentPattern = /parent:\s*["']?([^"'\n]+)["']?/g;
    
    let match;
    while ((match = parentPattern.exec(yamlContent)) !== null) {
      refs.push(match[1].trim());
    }

    return refs;
  }

  private extractMemberKeys(yamlContent: string): string[] {
    const keys: string[] = [];
    const keyPattern = /key:\s*["']?([^"'\n]+)["']?/g;
    
    let match;
    while ((match = keyPattern.exec(yamlContent)) !== null) {
      keys.push(match[1].trim());
    }

    return keys;
  }

  private extractLinkedCube(yamlContent: string): string | null {
    const match = yamlContent.match(/linked:\s*\n\s*cube:\s*["']?([^"'\n]+)["']?/);
    return match ? match[1].trim() : null;
  }

  private dimensionExists(name: string, kind: string, context: BuildContext): boolean {
    const objects = context.getObjectsByType(kind as PretObjectTypeName);
    return objects.some(obj => obj.objectName === name);
  }

  private cubeExists(name: string, context: BuildContext): boolean {
    const cubes = context.getObjectsByType('Cube');
    return cubes.some(cube => cube.objectName === name);
  }
}
