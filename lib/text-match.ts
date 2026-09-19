// lib/text-match.ts
// Pure string matching shared by the classification engine and the client-side wizard
// (no fs access, safe to import in the browser).

export function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

// Levenshtein distance for fuzzy matching
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;

  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,      // insertion
        matrix[j - 1][i] + 1,      // deletion
        matrix[j - 1][i - 1] + cost // substitution
      );
    }
  }

  return matrix[len2][len1];
}

// Check if word contains trigger with fuzzy matching (allows typos)
export function wordContainsTriggerFuzzy(word: string, trigger: string, maxDistance: number = 3): boolean {
  const normalized = normalizeText(word);
  const normalizedTrigger = normalizeText(trigger);

  // Exact match first (fastest)
  if (normalized.includes(normalizedTrigger)) return true;

  // Split into words and check each word/phrase
  const words = normalized.split(/\s+/);
  const triggerWords = normalizedTrigger.split(/\s+/);

  // For single-word triggers, check fuzzy match against all words
  if (triggerWords.length === 1) {
    for (const word of words) {
      const distance = levenshteinDistance(word, normalizedTrigger);
      const similarity = 1 - (distance / Math.max(word.length, normalizedTrigger.length));
      if (similarity >= 0.8 || distance <= maxDistance) {
        return true;
      }
    }
  }

  // For multi-word triggers, check if all trigger words appear (fuzzy)
  let matchedWords = 0;
  for (const triggerWord of triggerWords) {
    for (const word of words) {
      const distance = levenshteinDistance(word, triggerWord);
      if (distance <= maxDistance || (1 - (distance / Math.max(word.length, triggerWord.length))) >= 0.8) {
        matchedWords++;
        break;
      }
    }
  }

  return matchedWords === triggerWords.length;
}

export function textContainsTrigger(text: string, trigger: string): boolean {
  return wordContainsTriggerFuzzy(text, trigger);
}
