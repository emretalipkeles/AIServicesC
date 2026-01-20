export interface FuzzyMatchResult {
  match: string | null;
  confidence: number;
  isExactMatch: boolean;
  suggestions: string[];
}

export interface IFuzzyMatcher {
  findBestMatch(input: string, candidates: string[]): FuzzyMatchResult;
  
  calculateSimilarity(str1: string, str2: string): number;
  
  normalizeForMatching(input: string): string;
}
