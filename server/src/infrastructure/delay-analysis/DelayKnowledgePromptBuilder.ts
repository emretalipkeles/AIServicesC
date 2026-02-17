import type {
  IDelayKnowledgeBase,
  KnowledgeSection,
  DelayCategory,
  DecisionFrameworkEntry,
  WorkedExample,
  GrayAreaScenario,
  CheatSheetSection,
} from '../../domain/delay-analysis/interfaces/IDelayKnowledgeBase';
import type { ProjectDocumentType } from '../../domain/delay-analysis/entities/ProjectDocument';

export class DelayKnowledgePromptBuilder {
  constructor(private readonly knowledgeBase: IDelayKnowledgeBase) {}

  buildPromptForDocumentType(documentType: ProjectDocumentType): string {
    const sections = this.knowledgeBase.getSectionsForDocumentType(documentType);

    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║  CONTRACTOR DELAY TRAINING GUIDE - KNOWLEDGE BASE INJECTION     ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    console.log(`[Knowledge Base] Document type: ${documentType}`);
    console.log(`[Knowledge Base] Sections selected (${sections.length}): ${sections.join(', ')}`);

    const prompt = this.buildPromptFromSections(sections);

    const approxTokens = Math.round(prompt.length / 4);
    console.log(`[Knowledge Base] Prompt size: ~${approxTokens.toLocaleString()} tokens (${prompt.length.toLocaleString()} chars)`);

    const allSections: KnowledgeSection[] = [
      'delay_definition', 'contract_basis', 'categories', 'exclusions',
      'decision_framework', 'worked_examples_delays', 'worked_examples_not_delays',
      'worked_examples_gray', 'gray_areas', 'common_pitfalls', 'guiding_principle', 'cheat_sheet',
    ];
    const included = allSections.filter(s => sections.includes(s));
    const excluded = allSections.filter(s => !sections.includes(s));

    if (included.length > 0) {
      console.log(`[Knowledge Base] ✓ INCLUDED sections:`);
      for (const s of included) {
        console.log(`[Knowledge Base]   ✓ ${s}`);
      }
    }
    if (excluded.length > 0) {
      console.log(`[Knowledge Base] ✗ EXCLUDED sections (not needed for ${documentType}):`);
      for (const s of excluded) {
        console.log(`[Knowledge Base]   ✗ ${s}`);
      }
    }
    console.log('');

    return prompt;
  }

  buildPromptFromSections(sections: ReadonlyArray<KnowledgeSection>): string {
    const parts: string[] = [
      '=============================================================================',
      'CONTRACTOR DELAY IDENTIFICATION KNOWLEDGE BASE',
      '=============================================================================',
      '',
    ];

    for (const section of sections) {
      const rendered = this.renderSection(section);
      if (rendered) {
        parts.push(rendered);
        parts.push('');
      }
    }

    return parts.join('\n');
  }

  private renderSection(section: KnowledgeSection): string | null {
    switch (section) {
      case 'delay_definition':
        return this.renderDelayDefinition();
      case 'contract_basis':
        return this.renderContractBasis();
      case 'categories':
        return this.renderCategories();
      case 'exclusions':
        return this.renderExclusions();
      case 'decision_framework':
        return this.renderDecisionFramework();
      case 'worked_examples_delays':
        return this.renderWorkedExamples('CONTRACTOR-CAUSED DELAY EXAMPLES', this.knowledgeBase.workedExamplesDelays);
      case 'worked_examples_not_delays':
        return this.renderWorkedExamples('EVENTS THAT ARE NOT CONTRACTOR-CAUSED DELAYS', this.knowledgeBase.workedExamplesNotDelays);
      case 'worked_examples_gray':
        return this.renderWorkedExamples('GRAY AREAS REQUIRING VERIFICATION', this.knowledgeBase.workedExamplesGray);
      case 'gray_areas':
        return this.renderGrayAreas();
      case 'common_pitfalls':
        return this.renderCommonPitfalls();
      case 'guiding_principle':
        return this.renderGuidingPrinciple();
      case 'cheat_sheet':
        return this.renderCheatSheet();
      case 'purpose':
        return null;
      default:
        return null;
    }
  }

  private renderDelayDefinition(): string {
    return [
      '--- WHAT IS A CONTRACTOR-CAUSED DELAY ---',
      '',
      this.knowledgeBase.delayDefinition,
      '',
      'THE CORE TEST:',
      this.knowledgeBase.coreTest,
    ].join('\n');
  }

  private renderContractBasis(): string {
    return [
      '--- CONTRACT BASIS ---',
      '',
      this.knowledgeBase.contractBasis,
    ].join('\n');
  }

  private renderCategories(): string {
    const parts: string[] = [
      '--- CATEGORIES OF CONTRACTOR-CAUSED DELAYS ---',
      '',
    ];

    for (const category of this.knowledgeBase.categories) {
      parts.push(this.renderCategory(category));
      parts.push('');
    }

    return parts.join('\n');
  }

  private renderCategory(category: DelayCategory): string {
    const lines: string[] = [`${category.name.toUpperCase()}:`];
    for (const entry of category.delayTypes) {
      lines.push(`  - ${entry.indicator}: ${entry.whatToLookFor} [${entry.classification}]`);
    }
    return lines.join('\n');
  }

  private renderExclusions(): string {
    return [
      '--- WHAT IS NOT A CONTRACTOR-CAUSED DELAY ---',
      '',
      this.knowledgeBase.exclusions,
    ].join('\n');
  }

  private renderDecisionFramework(): string {
    const lines: string[] = [
      '--- DECISION FRAMEWORK ---',
      '',
      'When unsure whether to classify an event as a contractor-caused delay, work through these questions:',
      '',
    ];

    for (const entry of this.knowledgeBase.decisionFramework) {
      lines.push(this.renderDecisionEntry(entry));
    }

    return lines.join('\n');
  }

  private renderDecisionEntry(entry: DecisionFrameworkEntry): string {
    return [
      `Scenario: ${entry.scenario}`,
      `  Key Question: ${entry.keyQuestion}`,
      `  If YES → ${entry.ifYes}`,
      `  If NO → ${entry.ifNo}`,
      '',
    ].join('\n');
  }

  private renderWorkedExamples(title: string, examples: ReadonlyArray<WorkedExample>): string {
    const lines: string[] = [
      `--- ${title} ---`,
      '',
    ];

    for (const example of examples) {
      lines.push(this.renderWorkedExample(example));
    }

    return lines.join('\n');
  }

  private renderWorkedExample(example: WorkedExample): string {
    return [
      `Example ${example.id}: ${example.title}`,
      `  Report Excerpt: "${example.excerpt}"`,
      `  Analysis: ${example.analysis}`,
      `  Classification: ${example.classification}`,
      '',
    ].join('\n');
  }

  private renderGrayAreas(): string {
    const lines: string[] = [
      '--- GRAY AREAS & BORDERLINE SCENARIOS ---',
      '',
      'These scenarios require additional context before classification:',
      '',
    ];

    for (const scenario of this.knowledgeBase.grayAreaScenarios) {
      lines.push(this.renderGrayArea(scenario));
    }

    return lines.join('\n');
  }

  private renderGrayArea(scenario: GrayAreaScenario): string {
    return [
      `Scenario ${scenario.id}: ${scenario.title}`,
      `  Situation: ${scenario.situation}`,
      `  Why It's Gray: ${scenario.whyGray}`,
      `  How to Classify: ${scenario.howToClassify}`,
      '',
    ].join('\n');
  }

  private renderCommonPitfalls(): string {
    const lines: string[] = [
      '--- COMMON PITFALLS TO AVOID ---',
      '',
    ];

    for (const pitfall of this.knowledgeBase.commonPitfalls) {
      lines.push(`- ${pitfall}`);
    }

    return lines.join('\n');
  }

  private renderGuidingPrinciple(): string {
    return [
      '--- GUIDING PRINCIPLE ---',
      '',
      this.knowledgeBase.guidingPrinciple,
    ].join('\n');
  }

  private renderCheatSheet(): string {
    const cs: CheatSheetSection = this.knowledgeBase.cheatSheet;

    const lines: string[] = [
      '--- QUICK-REFERENCE CHEAT SHEET ---',
      '',
      'IS A CONTRACTOR DELAY:',
    ];

    for (const item of cs.isContractorDelay) {
      lines.push(`  ✓ ${item}`);
    }

    lines.push('');
    lines.push('NOT A CONTRACTOR DELAY:');
    for (const item of cs.isNotContractorDelay) {
      lines.push(`  ✗ ${item}`);
    }

    lines.push('');
    lines.push('FLAG FOR VERIFICATION:');
    for (const item of cs.flagForVerification) {
      lines.push(`  ? ${item}`);
    }

    lines.push('');
    lines.push(`CORE TEST: ${cs.coreTest}`);

    lines.push('');
    lines.push('KEY QUESTIONS FOR EVERY ENTRY:');
    for (const q of cs.keyQuestions) {
      lines.push(`  • ${q}`);
    }

    return lines.join('\n');
  }
}
