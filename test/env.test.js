import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDevEnv } from '../src/env.js';

function withProcess(patch, fn) {
  const before = {};
  for (const key of Object.keys(patch)) before[key] = process.env[key];
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const widget = { get: (name) => (name === 'host' ? 'widget.lul.works' : undefined) };
const local = { get: (name) => (name === 'host' ? 'localhost:3940' : undefined) };

test('TW_DEV・TW_ENV が無ければ、どのポートでも本番扱い', () => {
  for (const PORT of ['3939', '3940', '41234', null]) {
    withProcess({ TW_DEV: null, TW_ENV: null, PORT }, () => {
      assert.equal(isDevEnv(), false);
      assert.equal(isDevEnv(local), false);
    });
  }
});

test('TW_DEV=1 なら、どのポートでも開発扱い（作業場所を並べても取り合わない）', () => {
  for (const PORT of ['3939', '41234', null]) {
    withProcess({ TW_DEV: '1', TW_ENV: null, PORT }, () => {
      assert.equal(isDevEnv(), true);
      assert.equal(isDevEnv(local), true);
      assert.equal(isDevEnv(widget), false);
    });
  }
});

test('TW_DEV は 1 だけを開発扱いにする', () => {
  for (const TW_DEV of ['0', 'true', 'yes', '']) {
    withProcess({ TW_DEV, TW_ENV: null, PORT: '3940' }, () => {
      assert.equal(isDevEnv(local), false);
    });
  }
});

test('Host が widget.lul.works なら本番扱い', () => {
  withProcess({ TW_ENV: 'dev', PORT: '3940' }, () => {
    assert.equal(isDevEnv(widget), false);
    assert.equal(isDevEnv({ get: () => 'Widget.Lul.Works:443' }), false);
  });
});

test('TW_ENV 未設定は本番扱い', () => {
  withProcess({ TW_DEV: null, TW_ENV: null, PORT: '3940' }, () => {
    assert.equal(isDevEnv(), false);
    assert.equal(isDevEnv(local), false);
  });
});

test('通常の dev は dev', () => {
  withProcess({ TW_ENV: 'dev', PORT: '3940' }, () => {
    assert.equal(isDevEnv(), true);
    assert.equal(isDevEnv(local), true);
  });
});

test('壊れた Host・例外は本番扱い', () => {
  withProcess({ TW_ENV: 'dev', PORT: '3940' }, () => {
    assert.equal(isDevEnv({ get: () => '' }), false);
    assert.equal(isDevEnv({ get() { throw new Error('host'); } }), false);
  });
});
