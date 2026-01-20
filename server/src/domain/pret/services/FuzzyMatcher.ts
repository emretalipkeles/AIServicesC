import type { IFuzzyMatcher, FuzzyMatchResult } from '../interfaces/IFuzzyMatcher';

export class FuzzyMatcher implements IFuzzyMatcher {
  private static readonly EXACT_MATCH_THRESHOLD = 1.0;
  private static readonly GOOD_MATCH_THRESHOLD = 0.7;
  private static readonly SUGGESTION_THRESHOLD = 0.4;
  private static readonly MAX_SUGGESTIONS = 3;

  private static readonly NOISE_WORDS = ['dim', 'dimension', 'dimensions', 'the', 'a', 'an'];

  findBestMatch(input: string, candidates: string[]): FuzzyMatchResult {
    if (!input || candidates.length === 0) {
      return {
        match: null,
        confidence: 0,
        isExactMatch: false,
        suggestions: []
      };
    }

    const normalizedInput = this.normalizeForMatching(input);
    
    const scoredCandidates = candidates.map(candidate => {
      const normalizedCandidate = this.normalizeForMatching(candidate);
      const similarity = this.calculateSimilarity(normalizedInput, normalizedCandidate);
      
      return {
        original: candidate,
        normalized: normalizedCandidate,
        similarity
      };
    });

    scoredCandidates.sort((a, b) => b.similarity - a.similarity);

    const bestMatch = scoredCandidates[0];
    const isExactMatch = bestMatch.similarity >= FuzzyMatcher.EXACT_MATCH_THRESHOLD;
    const isGoodMatch = bestMatch.similarity >= FuzzyMatcher.GOOD_MATCH_THRESHOLD;

    const suggestions = scoredCandidates
      .filter(c => c.similarity >= FuzzyMatcher.SUGGESTION_THRESHOLD && c.similarity < FuzzyMatcher.EXACT_MATCH_THRESHOLD)
      .slice(0, FuzzyMatcher.MAX_SUGGESTIONS)
      .map(c => c.original);

    if (isGoodMatch) {
      return {
        match: bestMatch.original,
        confidence: bestMatch.similarity,
        isExactMatch,
        suggestions: isExactMatch ? [] : suggestions
      };
    }

    return {
      match: null,
      confidence: bestMatch.similarity,
      isExactMatch: false,
      suggestions
    };
  }

  calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    if (s1 === s2) return 1.0;

    if (s1.includes(s2) || s2.includes(s1)) {
      const lengthRatio = Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
      return 0.8 + (lengthRatio * 0.2);
    }

    if (s1.startsWith(s2) || s2.startsWith(s1)) {
      const lengthRatio = Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
      return 0.85 + (lengthRatio * 0.15);
    }

    const distance = this.levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    const levenshteinSimilarity = 1 - (distance / maxLength);

    return levenshteinSimilarity;
  }

  normalizeForMatching(input: string): string {
    let normalized = input.toLowerCase().trim();
    
    for (const noise of FuzzyMatcher.NOISE_WORDS) {
      const regex = new RegExp(`\\b${noise}\\b`, 'gi');
      normalized = normalized.replace(regex, '');
    }
    
    normalized = normalized.replace(/['"]/g, '');
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }

    return dp[m][n];
  }
}
