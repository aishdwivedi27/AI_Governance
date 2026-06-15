#!/usr/bin/env node

/**
 * Setup script to generate trigger embeddings from rules.yaml
 * One-time execution to populate embeddings.json
 * 
 * Usage:
 *   npx ts-node scripts/setup-embeddings.ts
 *   OR
 *   node dist/scripts/setup-embeddings.js
 * 
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

interface EmbeddingEntry {
  trigger: string;
  category: string;
  articleId: string;
  embedding: number[];
  timestamp: string;
  model: string;
}

interface EmbeddingsData {
  metadata: {
    generatedAt: string;
    model: string;
    rulesVersion: string;
    totalTriggers: number;
  };
  embeddings: EmbeddingEntry[];
}

async function loadRules(): Promise<any> {
  const possiblePaths = [
    path.join(__dirname, '..', 'data', 'rules.yaml'),
    path.join(process.cwd(), 'data', 'rules.yaml'),
    path.join(__dirname, '..', '..', 'data', 'rules.yaml'),
  ];

  let rulesPath = '';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      rulesPath = p;
      break;
    }
  }

  if (!rulesPath) {
    throw new Error(`Rules file not found. Tried: ${possiblePaths.join(', ')}`);
  }

  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');
  return YAML.parse(rulesContent);
}

async function generateEmbedding(client: Anthropic, text: string): Promise<number[]> {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Generate a semantic embedding for this AI system trigger/characteristic. Return ONLY a JSON array of 1536 numbers between -1 and 1, representing the embedding vector. Do not include any explanation or markdown.

Trigger: "${text}"

Return format: [-0.123, 0.456, ..., 0.789]`,
        },
      ],
    });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from API');
  }

  let text_response = content.text.trim();
  // Remove markdown code blocks if present
  text_response = text_response.replace(/```json\n?/, '').replace(/```\n?/, '');
  const embedding = JSON.parse(text_response);
  
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Invalid embedding format returned from API');
    }

    return embedding;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
    throw error;
  }
}

async function extractTriggers(rules: any): Promise<Array<{ trigger: string; category: string; articleId: string }>> {
  const triggers: Array<{ trigger: string; category: string; articleId: string }> = [];

  // Article 5 - Prohibited Practices
  if (rules.article_5?.prohibited_practices) {
    for (const practice of rules.article_5.prohibited_practices) {
      if (practice.triggers && Array.isArray(practice.triggers)) {
        for (const trigger of practice.triggers) {
          triggers.push({
            trigger,
            category: practice.name,
            articleId: `article_5_${practice.id}`,
          });
        }
      }
    }
  }

  // Annex I - Safety Components
  if (rules.annex_i?.triggers && Array.isArray(rules.annex_i.triggers)) {
    for (const trigger of rules.annex_i.triggers) {
      triggers.push({
        trigger,
        category: 'Safety Component (Annex I)',
        articleId: 'annex_i',
      });
    }
  }

  // Annex III - High-Risk Categories
  if (rules.annex_iii?.categories && Array.isArray(rules.annex_iii.categories)) {
    for (const category of rules.annex_iii.categories) {
      if (category.triggers && Array.isArray(category.triggers)) {
        for (const trigger of category.triggers) {
          triggers.push({
            trigger,
            category: category.name,
            articleId: `annex_iii_${category.id}`,
          });
        }
      }
    }
  }

  // Article 50 - Transparency
  if (rules.article_50?.triggers && Array.isArray(rules.article_50.triggers)) {
    for (const trigger of rules.article_50.triggers) {
      triggers.push({
        trigger,
        category: 'Transparency Obligations (Article 50)',
        articleId: 'article_50',
      });
    }
  }

  return triggers;
}

async function main() {
  console.log('🚀 Starting EU AI Act Embeddings Generation');
  console.log('==========================================\n');

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ERROR: ANTHROPIC_API_KEY environment variable not set');
    console.error('Set it with: export ANTHROPIC_API_KEY="your-key-here"');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  try {
    // Load rules
    console.log('📖 Loading rules from rules.yaml...');
    const rules = await loadRules();
    console.log('✓ Rules loaded\n');

    // Extract triggers
    console.log('🔍 Extracting triggers from all articles and annexes...');
    const triggers = await extractTriggers(rules);
    console.log(`✓ Found ${triggers.length} triggers to embed\n`);

    // Generate embeddings
    console.log('🤖 Generating embeddings using Anthropic API...');
    console.log('⏳ This may take a moment (batching 5 requests at a time)\n');

    const embeddings: EmbeddingEntry[] = [];
    const batchSize = 5;

    for (let i = 0; i < triggers.length; i += batchSize) {
      const batch = triggers.slice(i, Math.min(i + batchSize, triggers.length));
      const batchPromises = batch.map(async (item) => {
        try {
          const embedding = await generateEmbedding(client, item.trigger);
          return {
            trigger: item.trigger,
            category: item.category,
            articleId: item.articleId,
            embedding,
            timestamp: new Date().toISOString(),
            model: 'claude-3-5-sonnet-20241022',
          };
        } catch (error) {
          console.error(`   ⚠️  Failed to embed "${item.trigger}": ${error}`);
          throw error;
        }
      });

      try {
        const batchResults = await Promise.all(batchPromises);
        embeddings.push(...batchResults);
        console.log(`   ✓ Batch ${Math.ceil((i + batchSize) / batchSize)} complete (${embeddings.length}/${triggers.length})`);
      } catch (error) {
        console.error('\n❌ ERROR: Cannot perform embedding generation at this time due to downstream system unavailable');
        process.exit(1);
      }
    }

    console.log(`\n✓ Generated ${embeddings.length} embeddings\n`);

    // Prepare output
    const embeddingsData: EmbeddingsData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        model: 'claude-3-5-sonnet-20241022',
        rulesVersion: rules.metadata?.version || '3.1.0',
        totalTriggers: embeddings.length,
      },
      embeddings,
    };

    // Save to file
    const outputPath = path.join(process.cwd(), 'data', 'embeddings.json');
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(embeddingsData, null, 2));
    console.log(`💾 Embeddings saved to: ${outputPath}\n`);

    // Summary
    console.log('📊 Embedding Summary');
    console.log('==========================================');
    const articleGroups = embeddings.reduce((acc: any, e) => {
      acc[e.articleId] = (acc[e.articleId] || 0) + 1;
      return acc;
    }, {});

    Object.entries(articleGroups).forEach(([articleId, count]) => {
      console.log(`  ${articleId}: ${count} triggers`);
    });

    console.log('\n✅ Embeddings generation complete!');
    console.log('You can now use semantic matching in classification-engine.ts');
  } catch (error) {
    console.error('\n❌ ERROR: Cannot perform embedding generation at this time due to downstream system unavailable');
    if (error instanceof Error) {
      console.error(`Details: ${error.message}`);
    }
    process.exit(1);
  }
}

main();