import { describe, it, expect } from 'vitest';
import { IDRToolExtractionSystemPromptStrategy } from '../tool-extraction-prompts/IDRToolExtractionSystemPromptStrategy';
import { IDRExtractionStrategy } from '../extraction-strategies/IDRExtractionStrategy';
import { ContractorDelayTrainingGuide } from '../../../domain/delay-analysis/config/ContractorDelayTrainingGuide';
import { DelayKnowledgePromptBuilder } from '../DelayKnowledgePromptBuilder';
import type { DocumentExtractionContext } from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';

/**
 * Guards the prompt contract that inspector-diary IDRs depend on.
 *
 * These reports leave "Delays and Reason" as "None" and carry no activity-ID table, so any prompt
 * that lets either fact short-circuit analysis silently returns zero delay events — a failure that
 * looks like a successful run. These assertions fail loudly if that phrasing comes back.
 */
describe('IDR prompt contract', () => {
  const promptBuilder = new DelayKnowledgePromptBuilder(new ContractorDelayTrainingGuide());

  const toolPrompt = new IDRToolExtractionSystemPromptStrategy(promptBuilder).buildSystemPrompt();
  const toolSuffix = new IDRToolExtractionSystemPromptStrategy(promptBuilder).buildUserPromptSuffix();

  const context: DocumentExtractionContext = {
    documentContent: '0730 Crew onsite. 1400 Panels removed.',
    documentFilename: 'idr.pdf',
    documentId: 'doc-1',
    documentType: 'idr',
  };
  const idrPrompt = new IDRExtractionStrategy(promptBuilder).buildExtractionPrompt(context).prompt;

  const prompts: Array<[string, string]> = [
    ['tool-based system prompt', toolPrompt],
    ['single-shot IDR prompt', idrPrompt],
  ];

  it('orders narrative analysis before activity discovery in the tool workflow', () => {
    const narrativeAt = toolPrompt.indexOf('READ THE ENTIRE NARRATIVE');
    const activityScanAt = toolPrompt.search(/scan for the "Contractor's Work Activity" table/i);

    expect(narrativeAt).toBeGreaterThan(-1);
    expect(activityScanAt).toBeGreaterThan(-1);
    expect(narrativeAt).toBeLessThan(activityScanAt);
  });

  it.each(prompts)('%s makes narrative analysis mandatory before any conclusion', (_name, prompt) => {
    expect(prompt).toMatch(/NARRATIVE ANALYSIS — MANDATORY/i);
  });

  it('tells the model to read the narrative before calling the schedule tool', () => {
    const narrativeAt = toolPrompt.indexOf('READ THE ENTIRE NARRATIVE');
    const toolCallAt = toolPrompt.indexOf('use the get_schedule_activities tool');

    expect(toolCallAt).toBeGreaterThan(-1);
    expect(narrativeAt).toBeLessThan(toolCallAt);
    expect(toolSuffix.indexOf('NARRATIVE')).toBeLessThan(toolSuffix.indexOf('activity IDs'));
  });

  it.each(prompts)('%s names the summary field and missing table as NOT grounds for zero events', (_name, prompt) => {
    expect(prompt).toMatch(/THESE ARE NOT (?:REASONS TO CONCLUDE THERE ARE NO DELAYS|GROUNDS FOR RETURNING ZERO EVENTS)/i);
    expect(prompt).toMatch(/"None", "N\/A", or (?:is )?blank/);
    expect(prompt).toMatch(/"Contractor's Work Activity" table/i);
    expect(prompt).toMatch(/CODE_CIE/);
  });

  it.each(prompts)('%s requires a narrative timestamp in sourceReference', (_name, prompt) => {
    expect(prompt).toMatch(/TIMESTAMP REQUIRED|TIMESTAMP.*— REQUIRED|REQUIRED:/);
    expect(prompt).toMatch(/MUST (?:carry|begin with) that timestamp|MUST begin with the timestamp/i);
  });

  it.each(prompts)('%s expects fractional durations calculated from time gaps', (_name, prompt) => {
    expect(prompt).toMatch(/including fractions|Fractional values are supported/i);
    expect(prompt).toMatch(/takes precedence over/i);
  });

  it('states that matching rules never decide whether an event exists', () => {
    expect(toolPrompt).toMatch(/NEVER govern whether an event exists/i);
  });
});
