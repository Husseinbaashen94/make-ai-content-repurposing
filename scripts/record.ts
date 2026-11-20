/**
 * Replaces the synthetic recorded answers in fixtures/recorded/ with real Claude replies
 * (art-08 keeps its deliberately invalid answer, which demonstrates the rejection path):
 *
 *   ANTHROPIC_API_KEY=... npm run record
 *   npm test && npm run demo
 */
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { answerText, hasAnthropicCredentials, repurposeLive } from '../src/live.js';
import { DEFAULT_MODEL } from '../src/request.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const KEEP = new Set(['art-08-invalid-drafts.json']);

async function main() {
  if (!hasAnthropicCredentials()) {
    console.error('No credentials: set ANTHROPIC_API_KEY in .env (or LIVE_EVAL=1 with another credential).');
    process.exit(1);
  }
  const client = new Anthropic();
  const model = process.env.AI_MODEL || DEFAULT_MODEL;
  for (const file of readdirSync('fixtures/articles').sort()) {
    if (KEEP.has(file)) continue;
    const article = JSON.parse(readFileSync(`fixtures/articles/${file}`, 'utf8'));
    try {
      const text = answerText(await repurposeLive(client, article, model));
      writeFileSync(`fixtures/recorded/${file}`, JSON.stringify({ model, text }, null, 2) + '\n');
      console.log(`recorded ${file}`);
    } catch (error) {
      // Most specific first: a bad key stops the run; rate limits and server errors skip one post.
      if (error instanceof Anthropic.AuthenticationError) {
        console.error('Authentication failed: check ANTHROPIC_API_KEY.');
        process.exit(1);
      } else if (error instanceof Anthropic.RateLimitError) {
        console.error(`${file}: rate limited, kept the previous recording. Re-run later.`);
      } else if (error instanceof Anthropic.APIError) {
        console.error(`${file}: API error ${error.status}, kept the previous recording: ${error.message}`);
      } else {
        throw error;
      }
    }
  }
  console.log('\nNow run npm test: if a validation result changed, update fixtures/expected.json only where the new drafts are defensibly right.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
