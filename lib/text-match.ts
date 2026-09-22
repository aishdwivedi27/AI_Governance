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

// Two words are a "close" fuzzy match if they're identical, or similar enough in
// edit distance relative to their length to plausibly be a typo of each other.
// Short words (< 4 chars) are excluded: at that length, an edit-distance-based
// similarity score is too easily satisfied by two unrelated words (e.g. "rail"
// vs "spam"), which produced false positives against real trigger lists.
function isCloseWordMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  const distance = levenshteinDistance(a, b);
  const similarity = 1 - distance / Math.max(a.length, b.length);
  return similarity >= 0.8;
}

// Check if word contains trigger with fuzzy matching (allows typos)
export function wordContainsTriggerFuzzy(word: string, trigger: string): boolean {
  const normalized = normalizeText(word);
  const normalizedTrigger = normalizeText(trigger);

  // Exact match first (fastest)
  if (normalized.includes(normalizedTrigger)) return true;

  // Split into words and check each word/phrase
  const words = normalized.split(/\s+/);
  const triggerWords = normalizedTrigger.split(/\s+/);

  // For single-word triggers, check fuzzy match against all words
  if (triggerWords.length === 1) {
    return words.some(w => isCloseWordMatch(w, normalizedTrigger));
  }

  // For multi-word triggers, every trigger word must fuzzy-match some word in the text
  return triggerWords.every(triggerWord => words.some(w => isCloseWordMatch(w, triggerWord)));
}

export function textContainsTrigger(text: string, trigger: string): boolean {
  return wordContainsTriggerFuzzy(text, trigger);
}
