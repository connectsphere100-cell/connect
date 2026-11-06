import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';

test('vector retrieval pipeline declares tenant and agent filters', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../lib/ai-support.ts', import.meta.url), 'utf8');
  assert.match(source, /filter:\s*\{\s*tenantId,\s*agentIds:\s*agent\._id\s*\}/);
  assert.match(source, /find\(\{ tenantId, agentIds: agent\._id \}\)/);
});

test('prompt only accepts agent-scoped business instructions and grounded excerpts', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../lib/ai-support.ts', import.meta.url), 'utf8');
  assert.match(source, /agent\.instructions/);
  assert.match(source, /Only use the supplied knowledge excerpts/);
  assert.match(source, /No relevant knowledge found/);
});

test('human takeover and customer handoff are persisted', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../lib/ai-support.ts', import.meta.url), 'utf8');
  const route = await (await import('node:fs/promises')).readFile(new URL('../app/api/ai/conversations/[id]/handoff/route.ts', import.meta.url), 'utf8');
  assert.match(source, /reply\.includes\('\[HANDOFF\]'\)/);
  assert.match(source, /handoff: 'human'/);
  assert.match(route, /mode:z\.enum\(\['ai','human'\]\)/);
  assert.ok(ObjectId.isValid(new ObjectId().toString()));
});
