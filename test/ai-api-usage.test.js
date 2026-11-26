import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAi } from '../src/ai.js';
import { ApiUsage } from '../src/api-usage.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ai-central-'));
const fakeClient = (proposal) => ({
  messages: {
    async parse() {
      return { stop_reason: 'end_turn', parsed_output: proposal, usage: { input_tokens: 12, output_tokens: 4, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 } };
    },
  },
});

test('AI の成功を tenant つきで中央 API 使用量へ記録する', async () => {
  const dir = tmp();
  const apiUsage = new ApiUsage({ dir });
  const ai = createAi({ dir, apiUsage, makeClient: () => fakeClient({ reply: 'こうします', changes: [] }) });
  ai.update({ key: 'sk-ant-test-0000000000abcd', model: 'claude-sonnet-5-5' });
  await ai.ask({ tenant: 't123', text: '背景を変えて', config: {} });
  const rows = apiUsage.rows({ service: 'anthropic' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tenant, 't123');
  assert.equal(rows[0].operation, 'aiAsk');
  assert.equal(rows[0].ok, true);
  assert.equal(rows[0].input, 12);
  assert.equal(rows[0].output, 4);
  assert.equal(rows[0].cacheRead, 2);
  assert.equal(rows[0].cacheWrite, 3);
  assert.equal(rows[0].provider, 'claude');
  assert.equal(rows[0].model, 'claude-sonnet-5-5');
  const legacy = JSON.parse(fs.readFileSync(path.join(dir, 'ai-usage.jsonl'), 'utf8').trim());
  assert.equal(legacy.tenant, 't123');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('OpenAI 形の AI の失敗を status つきで中央 API 使用量へ記録する', async () => {
  const dir = tmp();
  const apiUsage = new ApiUsage({ dir });
  const ai = createAi({
    dir,
    apiUsage,
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: 'busy' }) }),
  });
  ai.update({ provider: 'openai', key: 'test-key', baseUrl: 'https://ai.example', model: 'test-model' });
  await assert.rejects(() => ai.ask({ tenant: 't123', text: '背景を変えて', config: {} }), /混み合っています/);
  const rows = apiUsage.rows({ service: 'openai' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tenant, 't123');
  assert.equal(rows[0].operation, 'aiAsk');
  assert.equal(rows[0].ok, false);
  assert.equal(rows[0].status, 429);
  fs.rmSync(dir, { recursive: true, force: true });
});
