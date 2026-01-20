import type { PretCommandType } from '../../../domain/pret';

export interface ClassifiedIntent {
  commandType: PretCommandType | null;
  args: Record<string, unknown>;
  confidence: number;
  rawMessage: string;
}

interface IntentPattern {
  commandType: PretCommandType;
  patterns: RegExp[];
  argExtractors: ArgExtractor[];
}

interface ArgExtractor {
  argName: string;
  pattern: RegExp;
  transform?: (match: string) => unknown;
}

export class PretIntentClassifier {
  private readonly intentPatterns: IntentPattern[] = [
    {
      commandType: 'listModels',
      patterns: [
        /\b(list|show|what|get|display)\b.*\b(models?|cubes?)\b/i,
        /\b(models?|cubes?)\b.*\b(list|show|available|have)\b/i,
        /\bwhat\s+(models?|cubes?)\b/i,
        /\bhow many (models?|cubes?)\b/i,
      ],
      argExtractors: [
        {
          argName: 'includeDetails',
          pattern: /\b(detail|details|detailed|full|all info)\b/i,
          transform: () => true
        }
      ]
    },
    {
      commandType: 'listDimensions',
      patterns: [
        /\b(list|show|what|get|display)\b.*\b(dimensions?)\b/i,
        /\b(dimensions?)\b.*\b(list|show|available|have)\b/i,
        /\bwhat\s+(dimensions?)\b/i,
        /\bhow many (dimensions?)\b/i,
      ],
      argExtractors: [
        {
          argName: 'modelName',
          pattern: /\b(?:for|in|of)\s+(?:model\s+)?["']?(\w[\w\s]+?)["']?(?:\s+model)?\b/i,
          transform: (match: string) => match.trim()
        },
        {
          argName: 'dimensionType',
          pattern: /\b(account|time|version|entity|currency|employee|geography)\s*dimensions?\b/i,
          transform: (match: string) => match.trim()
        }
      ]
    },
    {
      commandType: 'getCubeDetails',
      patterns: [
        /\b(tell|show|get|describe|details?|info)\b.*\b(about|for|of)\b.*\b(cube|model)\b/i,
        /\b(cube|model)\b.*\b(details?|info|structure)\b/i,
        /\bwhat('s| is) in\b.*\b(cube|model)\b/i,
        /\b(describe|explain)\b.*\b(cube|model)\b/i,
      ],
      argExtractors: [
        {
          argName: 'cubeName',
          pattern: /\b(?:cube|model)\s+["']?(\w[\w\s]+?)["']?(?:\s|$)/i,
          transform: (match: string) => match.trim()
        },
        {
          argName: 'cubeName',
          pattern: /["'](\w[\w\s]+?)["']\s+(?:cube|model)/i,
          transform: (match: string) => match.trim()
        }
      ]
    },
    {
      commandType: 'getDimensionDetails',
      patterns: [
        /\b(tell|show|get|describe|details?|info)\b.*\b(about|for|of)\b.*\b(dim|dimension)\b/i,
        /\b(dim|dimension)\b.*\b(details?|info|structure|members?)\b/i,
        /\bwhat('s| is) in\b.*\b(dim|dimension)\b/i,
        /\b(describe|explain)\b.*\b(dim|dimension)\b/i,
        /\bhow many\s+members?\b.*\b(dim|dimension|has|have|does)\b/i,
        /\bmembers?\s+(in|of|for|does)\b.*\b(dim|dimension)?\b/i,
        /\b(account|time|version|entity|currency|org|organization)\s+(dim|dimension)\b/i,
        /\b(dim|dimension)\s+(account|time|version|entity|currency|org|organization)\b/i,
      ],
      argExtractors: [
        {
          argName: 'dimensionName',
          pattern: /\b(?:dim|dimension)\s+["']?(\w[\w\s-]+?)["']?(?:\s+(?:has|have|details?|info)|$)/i,
          transform: (match: string) => match.trim()
        },
        {
          argName: 'dimensionName',
          pattern: /["']?(\w[\w\s-]+?)["']?\s+(?:dim|dimension)\b/i,
          transform: (match: string) => match.trim()
        },
        {
          argName: 'dimensionName',
          pattern: /\bhow many\s+members?\s+(?:does|do|in|of|for)?\s*(?:the\s+)?["']?(\w[\w\s-]+?)["']?\s+(?:dim|dimension|has|have)/i,
          transform: (match: string) => match.trim()
        },
        {
          argName: 'dimensionName',
          pattern: /\b(account|time|version|entity|currency|org|organization)(?:\s+(?:dim|dimension))?\b/i,
          transform: (match: string) => match.trim()
        },
        {
          argName: 'modelName',
          pattern: /\b(?:for|in|of)\s+(?:model\s+)?["']?(\w[\w\s]+?)["']?(?:\s+model)?\b/i,
          transform: (match: string) => match.trim()
        }
      ]
    }
  ];

  classify(message: string): ClassifiedIntent {
    const normalizedMessage = message.trim();

    for (const intentPattern of this.intentPatterns) {
      for (const pattern of intentPattern.patterns) {
        if (pattern.test(normalizedMessage)) {
          const args = this.extractArgs(normalizedMessage, intentPattern.argExtractors);
          return {
            commandType: intentPattern.commandType,
            args,
            confidence: 0.8,
            rawMessage: normalizedMessage
          };
        }
      }
    }

    return {
      commandType: null,
      args: {},
      confidence: 0,
      rawMessage: normalizedMessage
    };
  }

  private extractArgs(message: string, extractors: ArgExtractor[]): Record<string, unknown> {
    const args: Record<string, unknown> = {};

    for (const extractor of extractors) {
      const match = message.match(extractor.pattern);
      if (match && match[1]) {
        const value = extractor.transform ? extractor.transform(match[1]) : match[1];
        if (value !== undefined && value !== '') {
          args[extractor.argName] = value;
        }
      }
    }

    return args;
  }

  getSupportedCommands(): PretCommandType[] {
    return this.intentPatterns.map(p => p.commandType);
  }

  getCommandDescription(commandType: PretCommandType): string {
    const descriptions: Record<PretCommandType, string> = {
      'listModels': 'List all models/cubes in the package',
      'listDimensions': 'List dimensions, optionally filtered by model or type',
      'getCubeDetails': 'Get detailed information about a specific cube/model',
      'getDimensionDetails': 'Get detailed information about a specific dimension',
      'updateCube': 'Update properties of a cube/model',
      'updateDimension': 'Update properties of a dimension'
    };
    return descriptions[commandType] || 'Unknown command';
  }
}
