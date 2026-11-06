// YAML エディタと AI パネルの初期設定。editor.js の createEditor から呼ばれる。

import { copyText, flashCopied } from './common.js';

const $ = (id) => document.getElementById(id);

/**
 * YAML のエラーと警告を #yamlIssues に描く。
 * editor.js の reload / onConfigError からも使うので export する。
 */
export function renderYamlIssues(errors = [], warnings = []) {
  const el = $('yamlIssues');
  el.replaceChildren();
  for (const e of errors) {
    const li = document.createElement('li');
    li.className = 'error';
    li.textContent = e;
    el.append(li);
  }
  for (const w of warnings) {
    const li = document.createElement('li');
    li.textContent = w;
    el.append(li);
  }
}

/**
 * YAML テキストエリアと AI 案内パネルのイベントを配線する。
 * @param {object} ctx - { api, isTenant, render, reload, getPayload, setPayload, getYamlDirty, setYamlDirty }
 */
export async function setupYaml(ctx) {
  const { api, isTenant, render, reload, getPayload, setPayload, getYamlDirty, setYamlDirty } = ctx;

  const text = $('yamlText');
  text.addEventListener('input', () => {
    setYamlDirty(true);
    $('yamlState').textContent = '未保存の変更があります';
  });
  $('yamlSave').addEventListener('click', async () => {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ yaml: text.value }),
    });
    const data = await res.json();
    renderYamlIssues(data.errors, data.warnings);
    if (data.ok) {
      setYamlDirty(false);
      setPayload(data);
      $('yamlState').textContent = '保存しました';
      render();
    } else {
      $('yamlState').textContent = '保存していません（エラーを直してください）';
    }
  });
  $('yamlRevert').addEventListener('click', async () => {
    setYamlDirty(false);
    $('yamlState').textContent = '';
    await reload();
  });

  const ai = await api('/api/ai');
  // 配信者ごとの URL では、AI の案内（サーバーの場所など）は出さない
  if (ai.tenant) {
    document.querySelector('.config-body .ai').hidden = true;
    document.querySelector('.config-body').classList.add('single');
    document.querySelector('.config-panel h3').textContent = '設定ファイル（YAML）';
    return;
  }
  $('aiPath').textContent = ai.configPath;
  $('aiClaude').textContent = ai.claudeCode;
  $('aiDesktop').textContent = ai.desktop;
  for (const btn of document.querySelectorAll('[data-copy]')) {
    btn.addEventListener('click', () => {
      copyText($(btn.dataset.copy).textContent);
      flashCopied(btn);
    });
  }
}
