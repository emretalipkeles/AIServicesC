import { describe, it, expect } from 'vitest';
import { IDRExtractionStrategy } from '../extraction-strategies/IDRExtractionStrategy';
import { NCRExtractionStrategy } from '../extraction-strategies/NCRExtractionStrategy';
import { FieldMemoExtractionStrategy } from '../extraction-strategies/FieldMemoExtractionStrategy';
import { DefaultExtractionStrategy } from '../extraction-strategies/DefaultExtractionStrategy';
import { DocumentExtractionStrategyFactory } from '../extraction-strategies/DocumentExtractionStrategyFactory';
import { ContractorDelayTrainingGuide } from '../../../domain/delay-analysis/config/ContractorDelayTrainingGuide';
import { DelayKnowledgePromptBuilder } from '../DelayKnowledgePromptBuilder';
import type { DocumentExtractionContext } from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';

describe('Extraction Strategies', () => {
  const knowledgeBase = new ContractorDelayTrainingGuide();
  const promptBuilder = new DelayKnowledgePromptBuilder(knowledgeBase);

  const createContext = (documentType: 'idr' | 'ncr' | 'field_memo' | 'other', content: string): DocumentExtractionContext => ({
    documentContent: content,
    documentFilename: `test-document.pdf`,
    documentId: 'test-doc-123',
    documentType,
  });

  describe('IDRExtractionStrategy', () => {
    const strategy = new IDRExtractionStrategy(promptBuilder);

    it('should have correct document type', () => {
      expect(strategy.documentType).toBe('idr');
    });

    it('should have lower base confidence (0.6)', () => {
      const result = strategy.buildExtractionPrompt(createContext('idr', 'test content'));
      expect(result.baseConfidence).toBe(0.6);
    });

    it('should require narrative verification', () => {
      const result = strategy.buildExtractionPrompt(createContext('idr', 'test content'));
      expect(result.requiresNarrativeVerification).toBe(true);
    });

    it('should not mark delay as certain', () => {
      const result = strategy.buildExtractionPrompt(createContext('idr', 'test content'));
      expect(result.delayIsCertain).toBe(false);
    });

    it('should include CODE_CIE in prompt', () => {
      const result = strategy.buildExtractionPrompt(createContext('idr', 'test content'));
      expect(result.prompt).toContain('CODE_CIE');
    });

    it('should include confidence scoring instructions', () => {
      const result = strategy.buildExtractionPrompt(createContext('idr', 'test content'));
      expect(result.prompt).toContain('CONFIDENCE SCORING');
    });

    it('should include duration estimation guidance', () => {
      const result = strategy.buildExtractionPrompt(createContext('idr', 'test content'));
      expect(result.prompt).toContain('DURATION ESTIMATION');
    });

    it('should truncate document content to 30000 characters', () => {
      const longContent = 'x'.repeat(50000);
      const result = strategy.buildExtractionPrompt(createContext('idr', longContent));
      expect(result.prompt.length).toBeLessThan(longContent.length);
    });

    it('should include training guide knowledge base content', () => {
      const result = strategy.buildExtractionPrompt(createContext('idr', 'test content'));
      expect(result.prompt).toContain('CONTRACTOR DELAY IDENTIFICATION KNOWLEDGE BASE');
      expect(result.prompt).toContain('WHAT IS A CONTRACTOR-CAUSED DELAY');
      expect(result.prompt).toContain('CATEGORIES OF CONTRACTOR-CAUSED DELAYS');
      expect(result.prompt).toContain('WHAT IS NOT A CONTRACTOR-CAUSED DELAY');
      expect(result.prompt).toContain('DECISION FRAMEWORK');
      expect(result.prompt).toContain('QUICK-REFERENCE CHEAT SHEET');
    });

    it('should include worked examples for IDR documents', () => {
      const result = strategy.buildExtractionPrompt(createContext('idr', 'test content'));
      expect(result.prompt).toContain('CONTRACTOR-CAUSED DELAY EXAMPLES');
      expect(result.prompt).toContain('EVENTS THAT ARE NOT CONTRACTOR-CAUSED DELAYS');
      expect(result.prompt).toContain('GRAY AREAS REQUIRING VERIFICATION');
    });

    it('should include gray area scenarios for IDR documents', () => {
      const result = strategy.buildExtractionPrompt(createContext('idr', 'test content'));
      expect(result.prompt).toContain('GRAY AREAS & BORDERLINE SCENARIOS');
    });
  });

  describe('NCRExtractionStrategy', () => {
    const strategy = new NCRExtractionStrategy(promptBuilder);

    it('should have correct document type', () => {
      expect(strategy.documentType).toBe('ncr');
    });

    it('should have higher base confidence (0.85)', () => {
      const result = strategy.buildExtractionPrompt(createContext('ncr', 'test content'));
      expect(result.baseConfidence).toBe(0.85);
    });

    it('should not require narrative verification', () => {
      const result = strategy.buildExtractionPrompt(createContext('ncr', 'test content'));
      expect(result.requiresNarrativeVerification).toBe(false);
    });

    it('should mark delay as certain', () => {
      const result = strategy.buildExtractionPrompt(createContext('ncr', 'test content'));
      expect(result.delayIsCertain).toBe(true);
    });

    it('should include rework instructions', () => {
      const result = strategy.buildExtractionPrompt(createContext('ncr', 'test content'));
      expect(result.prompt).toContain('rework');
    });

    it('should include NCR-specific language about quality failures', () => {
      const result = strategy.buildExtractionPrompt(createContext('ncr', 'test content'));
      expect(result.prompt).toContain('quality failure');
    });

    it('should instruct to treat as definitive delay', () => {
      const result = strategy.buildExtractionPrompt(createContext('ncr', 'test content'));
      expect(result.prompt).toContain('DEFINITIVE DELAY');
    });

    it('should include training guide knowledge base but NOT worked examples', () => {
      const result = strategy.buildExtractionPrompt(createContext('ncr', 'test content'));
      expect(result.prompt).toContain('CONTRACTOR DELAY IDENTIFICATION KNOWLEDGE BASE');
      expect(result.prompt).toContain('WHAT IS NOT A CONTRACTOR-CAUSED DELAY');
      expect(result.prompt).not.toContain('CONTRACTOR-CAUSED DELAY EXAMPLES');
    });
  });

  describe('FieldMemoExtractionStrategy', () => {
    const strategy = new FieldMemoExtractionStrategy(promptBuilder);

    it('should have correct document type', () => {
      expect(strategy.documentType).toBe('field_memo');
    });

    it('should have moderate base confidence (0.5)', () => {
      const result = strategy.buildExtractionPrompt(createContext('field_memo', 'test content'));
      expect(result.baseConfidence).toBe(0.5);
    });

    it('should require narrative verification', () => {
      const result = strategy.buildExtractionPrompt(createContext('field_memo', 'test content'));
      expect(result.requiresNarrativeVerification).toBe(true);
    });

    it('should not mark delay as certain', () => {
      const result = strategy.buildExtractionPrompt(createContext('field_memo', 'test content'));
      expect(result.delayIsCertain).toBe(false);
    });

    it('should include gray areas but NOT worked examples', () => {
      const result = strategy.buildExtractionPrompt(createContext('field_memo', 'test content'));
      expect(result.prompt).toContain('GRAY AREAS & BORDERLINE SCENARIOS');
      expect(result.prompt).not.toContain('CONTRACTOR-CAUSED DELAY EXAMPLES');
    });
  });

  describe('DefaultExtractionStrategy', () => {
    const strategy = new DefaultExtractionStrategy(promptBuilder);

    it('should have other document type', () => {
      expect(strategy.documentType).toBe('other');
    });

    it('should have moderate base confidence (0.5)', () => {
      const result = strategy.buildExtractionPrompt(createContext('other', 'test content'));
      expect(result.baseConfidence).toBe(0.5);
    });
  });

  describe('DocumentExtractionStrategyFactory', () => {
    const factory = new DocumentExtractionStrategyFactory();

    it('should return IDRExtractionStrategy for idr documents', () => {
      const strategy = factory.getStrategy('idr');
      expect(strategy.documentType).toBe('idr');
      expect(strategy.strategyName).toBe('IDR Extraction Strategy');
    });

    it('should return NCRExtractionStrategy for ncr documents', () => {
      const strategy = factory.getStrategy('ncr');
      expect(strategy.documentType).toBe('ncr');
      expect(strategy.strategyName).toBe('NCR Extraction Strategy');
    });

    it('should return FieldMemoExtractionStrategy for field_memo documents', () => {
      const strategy = factory.getStrategy('field_memo');
      expect(strategy.documentType).toBe('field_memo');
      expect(strategy.strategyName).toBe('Field Memo Extraction Strategy');
    });

    it('should return DefaultExtractionStrategy for other document types', () => {
      const strategy = factory.getStrategy('cpm_schedule');
      expect(strategy.strategyName).toBe('Default Extraction Strategy');
    });

    it('should return DefaultExtractionStrategy for contract_plan', () => {
      const strategy = factory.getStrategy('contract_plan');
      expect(strategy.strategyName).toBe('Default Extraction Strategy');
    });

    it('should return DefaultExtractionStrategy for dsc_claim', () => {
      const strategy = factory.getStrategy('dsc_claim');
      expect(strategy.strategyName).toBe('Default Extraction Strategy');
    });

    it('should return DefaultExtractionStrategy for other', () => {
      const strategy = factory.getStrategy('other');
      expect(strategy.strategyName).toBe('Default Extraction Strategy');
    });
  });

  describe('Confidence Score Comparison', () => {
    const factory = new DocumentExtractionStrategyFactory();
    const testContent = 'Sample document content';

    it('NCR should have higher confidence than IDR', () => {
      const idrStrategy = factory.getStrategy('idr');
      const ncrStrategy = factory.getStrategy('ncr');

      const idrResult = idrStrategy.buildExtractionPrompt(createContext('idr', testContent));
      const ncrResult = ncrStrategy.buildExtractionPrompt(createContext('ncr', testContent));

      expect(ncrResult.baseConfidence).toBeGreaterThan(idrResult.baseConfidence);
    });

    it('IDR should have higher confidence than field_memo', () => {
      const idrStrategy = factory.getStrategy('idr');
      const memoStrategy = factory.getStrategy('field_memo');

      const idrResult = idrStrategy.buildExtractionPrompt(createContext('idr', testContent));
      const memoResult = memoStrategy.buildExtractionPrompt(createContext('field_memo', testContent));

      expect(idrResult.baseConfidence).toBeGreaterThan(memoResult.baseConfidence);
    });

    it('NCR delays should be certain, IDR delays should not be', () => {
      const idrStrategy = factory.getStrategy('idr');
      const ncrStrategy = factory.getStrategy('ncr');

      const idrResult = idrStrategy.buildExtractionPrompt(createContext('idr', testContent));
      const ncrResult = ncrStrategy.buildExtractionPrompt(createContext('ncr', testContent));

      expect(ncrResult.delayIsCertain).toBe(true);
      expect(idrResult.delayIsCertain).toBe(false);
    });
  });
});
