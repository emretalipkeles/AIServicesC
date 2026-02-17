import type { ProjectDocumentType } from '../entities/ProjectDocument';

export interface DelayCategory {
  readonly name: string;
  readonly delayTypes: ReadonlyArray<DelayCategoryEntry>;
}

export interface DelayCategoryEntry {
  readonly indicator: string;
  readonly whatToLookFor: string;
  readonly classification: string;
}

export interface DecisionFrameworkEntry {
  readonly scenario: string;
  readonly keyQuestion: string;
  readonly ifYes: string;
  readonly ifNo: string;
}

export interface WorkedExample {
  readonly id: string;
  readonly title: string;
  readonly excerpt: string;
  readonly analysis: string;
  readonly classification: string;
}

export interface GrayAreaScenario {
  readonly id: number;
  readonly title: string;
  readonly situation: string;
  readonly whyGray: string;
  readonly howToClassify: string;
}

export interface CheatSheetSection {
  readonly isContractorDelay: ReadonlyArray<string>;
  readonly isNotContractorDelay: ReadonlyArray<string>;
  readonly flagForVerification: ReadonlyArray<string>;
  readonly coreTest: string;
  readonly keyQuestions: ReadonlyArray<string>;
}

export type KnowledgeSection =
  | 'purpose'
  | 'contract_basis'
  | 'delay_definition'
  | 'categories'
  | 'exclusions'
  | 'decision_framework'
  | 'worked_examples_delays'
  | 'worked_examples_not_delays'
  | 'worked_examples_gray'
  | 'gray_areas'
  | 'common_pitfalls'
  | 'guiding_principle'
  | 'cheat_sheet';

export interface IDelayKnowledgeBase {
  readonly contractBasis: string;
  readonly coreTest: string;
  readonly delayDefinition: string;
  readonly categories: ReadonlyArray<DelayCategory>;
  readonly exclusions: string;
  readonly decisionFramework: ReadonlyArray<DecisionFrameworkEntry>;
  readonly workedExamplesDelays: ReadonlyArray<WorkedExample>;
  readonly workedExamplesNotDelays: ReadonlyArray<WorkedExample>;
  readonly workedExamplesGray: ReadonlyArray<WorkedExample>;
  readonly grayAreaScenarios: ReadonlyArray<GrayAreaScenario>;
  readonly commonPitfalls: ReadonlyArray<string>;
  readonly guidingPrinciple: string;
  readonly cheatSheet: CheatSheetSection;

  getSectionsForDocumentType(documentType: ProjectDocumentType): ReadonlyArray<KnowledgeSection>;
}
