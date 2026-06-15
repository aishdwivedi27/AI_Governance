#!/usr/bin/env node

/**
 * Test script to validate fuzzy matching and classification improvements
 * Run with: node test-classification-fixes.js
 */

// Implement Levenshtein distance
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;

  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }

  return matrix[len2][len1];
}

// Fuzzy matching function
function textContainsTriggerFuzzy(text, trigger, maxDistance = 3) {
  const normalized = text.toLowerCase().trim();
  const normalizedTrigger = trigger.toLowerCase().trim();

  // Exact match first
  if (normalized.includes(normalizedTrigger)) return true;

  const words = normalized.split(/\s+/);
  const triggerWords = normalizedTrigger.split(/\s+/);

  if (triggerWords.length === 1) {
    for (const word of words) {
      const distance = levenshteinDistance(word, normalizedTrigger);
      const similarity = 1 - (distance / Math.max(word.length, normalizedTrigger.length));
      if (similarity >= 0.8 || distance <= maxDistance) {
        return true;
      }
    }
  }

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

// Test cases
const testCases = [
  {
    text: "Facial Recognistion System",
    trigger: "facial recognition",
    expectedMatch: true,
    description: "Typo in 'Recognition'"
  },
  {
    text: "Facial Recognition System",
    trigger: "facial recognition",
    expectedMatch: true,
    description: "Exact match"
  },
  {
    text: "Predictive ICU detoriation",
    trigger: "deterioration",
    expectedMatch: true,
    description: "Typo in 'deterioration' (detoriation -> deterioration)"
  },
  {
    text: "Healthcare ICU Patient Deterioration",
    trigger: "patient deterioration",
    expectedMatch: true,
    description: "Multi-word trigger with exact match"
  },
  {
    text: "Recoginses people by faces",
    trigger: "recognises",
    expectedMatch: true,
    description: "Typo in 'Recognises'"
  },
  {
    text: "clinical decision support system",
    trigger: "clinical decision support",
    expectedMatch: true,
    description: "Multi-word exact match"
  },
  {
    text: "Emotion recognition in workplace",
    trigger: "emotion recognition workplace",
    expectedMatch: true,
    description: "Multi-word fuzzy match"
  },
  {
    text: "Standard test system",
    trigger: "facial recognition",
    expectedMatch: false,
    description: "No match - different content"
  }
];

// Run tests
console.log("\n========================================");
console.log("FUZZY MATCHING TEST SUITE");
console.log("========================================\n");

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  const result = textContainsTriggerFuzzy(testCase.text, testCase.trigger);
  const success = result === testCase.expectedMatch;

  if (success) {
    passed++;
    console.log(`✓ Test ${index + 1}: PASS`);
  } else {
    failed++;
    console.log(`✗ Test ${index + 1}: FAIL`);
  }

  console.log(`  Description: ${testCase.description}`);
  console.log(`  Text: "${testCase.text}"`);
  console.log(`  Trigger: "${testCase.trigger}"`);
  console.log(`  Expected: ${testCase.expectedMatch}, Got: ${result}`);
  console.log();
});

// Summary
console.log("========================================");
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("========================================\n");

if (failed === 0) {
  console.log("✓ All tests passed!");
  process.exit(0);
} else {
  console.log("✗ Some tests failed");
  process.exit(1);
}