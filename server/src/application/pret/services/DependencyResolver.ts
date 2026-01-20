import { ObjectType, type PretObjectTypeName } from '../../../domain/pret/value-objects/ObjectType';
import type { BuildContext } from '../../../domain/pret/entities/BuildContext';

export interface DependencyNode {
  objectType: PretObjectTypeName;
  dependencies: PretObjectTypeName[];
  satisfied: boolean;
}

export interface ResolutionResult {
  canProceed: boolean;
  orderedTypes: PretObjectTypeName[];
  unsatisfiedDependencies: UnsatisfiedDependency[];
}

export interface UnsatisfiedDependency {
  objectType: PretObjectTypeName;
  missing: PretObjectTypeName[];
}

export class DependencyResolver {
  resolveOrder(
    targetTypes: PretObjectTypeName[],
    buildContext: BuildContext
  ): ResolutionResult {
    const nodes = this.buildDependencyGraph(targetTypes, buildContext);
    const unsatisfied = this.findUnsatisfied(nodes);

    if (unsatisfied.length > 0) {
      return {
        canProceed: false,
        orderedTypes: [],
        unsatisfiedDependencies: unsatisfied,
      };
    }

    const ordered = this.topologicalSort(nodes);

    return {
      canProceed: true,
      orderedTypes: ordered,
      unsatisfiedDependencies: [],
    };
  }

  getSuggestedOrder(targetType: PretObjectTypeName): PretObjectTypeName[] {
    const objectType = ObjectType.fromName(targetType);
    const allTypes: PretObjectTypeName[] = [];
    const visited = new Set<PretObjectTypeName>();

    this.collectDependencies(objectType, allTypes, visited);
    allTypes.push(targetType);

    return allTypes;
  }

  private collectDependencies(
    objectType: ObjectType,
    result: PretObjectTypeName[],
    visited: Set<PretObjectTypeName>
  ): void {
    for (const dep of objectType.dependencies) {
      if (!visited.has(dep.type)) {
        visited.add(dep.type);
        const depObjectType = ObjectType.fromName(dep.type);
        this.collectDependencies(depObjectType, result, visited);
        result.push(dep.type);
      }
    }
  }

  private buildDependencyGraph(
    targetTypes: PretObjectTypeName[],
    buildContext: BuildContext
  ): Map<PretObjectTypeName, DependencyNode> {
    const nodes = new Map<PretObjectTypeName, DependencyNode>();

    for (const typeName of targetTypes) {
      const objectType = ObjectType.fromName(typeName);
      const requiredDeps = objectType.getRequiredDependencies();

      const satisfiedDeps = requiredDeps.filter(dep => {
        const existing = buildContext.getObjectsByType(dep);
        return existing.length > 0 || targetTypes.includes(dep);
      });

      nodes.set(typeName, {
        objectType: typeName,
        dependencies: requiredDeps,
        satisfied: satisfiedDeps.length === requiredDeps.length,
      });
    }

    return nodes;
  }

  private findUnsatisfied(
    nodes: Map<PretObjectTypeName, DependencyNode>
  ): UnsatisfiedDependency[] {
    const result: UnsatisfiedDependency[] = [];

    const entries = Array.from(nodes.entries());
    for (const [typeName, node] of entries) {
      if (!node.satisfied) {
        const missing = node.dependencies.filter((dep: PretObjectTypeName) => !nodes.has(dep));
        if (missing.length > 0) {
          result.push({
            objectType: typeName,
            missing,
          });
        }
      }
    }

    return result;
  }

  private topologicalSort(
    nodes: Map<PretObjectTypeName, DependencyNode>
  ): PretObjectTypeName[] {
    const result: PretObjectTypeName[] = [];
    const visited = new Set<PretObjectTypeName>();
    const visiting = new Set<PretObjectTypeName>();

    const visit = (typeName: PretObjectTypeName): void => {
      if (visited.has(typeName)) return;
      if (visiting.has(typeName)) {
        throw new Error(`Circular dependency detected involving ${typeName}`);
      }

      visiting.add(typeName);

      const node = nodes.get(typeName);
      if (node) {
        for (const dep of node.dependencies) {
          if (nodes.has(dep)) {
            visit(dep);
          }
        }
      }

      visiting.delete(typeName);
      visited.add(typeName);
      result.push(typeName);
    };

    const keys = Array.from(nodes.keys());
    for (const typeName of keys) {
      visit(typeName);
    }

    return result;
  }
}
