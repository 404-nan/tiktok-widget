import assert from 'node:assert/strict';
import test from 'node:test';
import { createErrorLogger } from '../src/error-logger.js';

function captureLogger(options = {}) {
  const lines = [];
  const logger = createErrorLogger({
    service: 'tiktok-widget-test',
    write: (line) => lines.push(line),
    ...options,
  });
  return { lines, logger, records: () => lines.map((line) => JSON.parse(line)) };
}

test('error logger writes one structured JSON line with cause, location, and context', () => {
  const { logger, records } = captureLogger();
  const cause = new Error('設定ファイルが読めません');
  const error = new Error('起動できません', { cause });

  logger.error(error, { operation: 'startServer', component: 'server' });

  assert.equal(records().length, 1);
  const [record] = records();
  assert.equal(record.level, 'error');
  assert.equal(record.service, 'tiktok-widget-test');
  assert.equal(record.message, '起動できません');
  assert.equal(record.error.name, 'Error');
  assert.equal(record.error.message, '起動できません');
  assert.equal(record.cause.message, '設定ファイルが読めません');
  assert.equal(record.context.operation, 'startServer');
  assert.equal(record.context.component, 'server');
  assert.match(record.location.file, /error-logger\.test\.js$/);
  assert.equal(typeof record.location.line, 'number');
  assert.ok(record.location.line > 0);
});

test('error logger redacts secret-shaped context values and secret keys', () => {
  const { logger, records } = captureLogger();
  const error = new Error('外部APIに失敗しました');

  logger.error(error, {
    apiKey: 'sk-' + 'A'.repeat(24),
    nested: { authorization: 'Bearer secret-value' },
    note: 'token is ' + 'ghp_' + 'B'.repeat(32),
  });

  const [record] = records();
  assert.equal(record.context.apiKey, '[redacted]');
  assert.equal(record.context.nested.authorization, '[redacted]');
  assert.equal(record.context.note, 'token is [redacted]');
  assert.equal(JSON.stringify(record).includes('A'.repeat(24)), false);
  assert.equal(JSON.stringify(record).includes('secret-value'), false);
});

test('error logger accepts non-Error values without throwing', () => {
  const { logger, records } = captureLogger();

  logger.error('保存に失敗しました', { operation: 'saveState' });

  const [record] = records();
  assert.equal(record.error.name, 'Error');
  assert.equal(record.error.message, '保存に失敗しました');
  assert.equal(record.message, '保存に失敗しました');
});
