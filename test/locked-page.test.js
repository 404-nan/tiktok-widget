// 使えないウィジェットの代わりに出す locked.html が、配信画面（OBS）では透明な空白のまま、
// ダッシュボードの見本（?preview=1）でだけ「○○ プランで使えます」などの理由を出すかを確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lockedReason, pageOfPath } from '../public/widgets/lib/locked-reason.js';

const html = fs.readFileSync(new URL('../public/widgets/locked.html', import.meta.url), 'utf8');
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');

const ME = {
  plan: { id: 'free', label: '無料', status: 'trial', enforcementOn: true, contactNote: 'プランを変えたいときは LuL にご連絡ください。' },
  locked: [
    { key: 'cutins', kind: 'feature', label: 'カットイン', requiredPlan: 'plus', requiredPlanLabel: 'Plus', reason: 'plan', pages: ['cutin.html'] },
    { key: 'alerts', kind: 'feature', label: 'ギフト通知', requiredPlan: null, requiredPlanLabel: '', reason: 'switch', pages: ['gift-alert.html'] },
  ],
};

// locked.html の <script type="module"> を、本物の DOM の代わりの小さな部品で動かす
async function runPage(search) {
  const script = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1].replace(/^\s*import .*$/gm, '');
  const nodes = Object.fromEntries(['lockedReason', 'lockedTitle', 'lockedDetail'].map((id) => [id, { hidden: id === 'lockedReason', textContent: '' }]));
  const fetched = [];
  const fetch = async (url) => { fetched.push(url); return { ok: true, json: async () => ME }; };
  const location = { search, pathname: '/t/abc/widgets/cutin.html' };
  const document = { getElementById: (id) => nodes[id] };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const run = new AsyncFunction('setupPage', 'connect', 'lockedReason', 'pageOfPath', 'location', 'document', 'fetch', 'URLSearchParams', `${script}\nawait new Promise((r) => setTimeout(r, 0));`);
  await run(() => {}, () => {}, lockedReason, pageOfPath, location, document, fetch, URLSearchParams);
  return { nodes, fetched };
}

test('locked.html は配信画面では透明な空白のまま、ダッシュボードの見本（?preview=1）でだけ理由を出す', async () => {
  // 配信画面（OBS）: 背景は透明、文字は1つも出さず、/api/me も読まない
  assert.match(html, /html, body \{ background: transparent; \}/);
  assert.match(html, /id="lockedReason" hidden/);
  const visibleText = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<title>[\s\S]*?<\/title>/, '').replace(/<[^>]+>/g, '').trim();
  assert.equal(visibleText, '', '配信画面に出る文字を HTML に書かない');
  for (const search of ['', '?preview=live', '?preview=0']) {
    const obs = await runPage(search);
    assert.equal(obs.nodes.lockedReason.hidden, true, search);
    assert.equal(obs.nodes.lockedTitle.textContent, '', search);
    assert.deepEqual(obs.fetched, [], search);
  }
  // 見本: 理由を出す
  const preview = await runPage('?preview=1&sound=0');
  assert.equal(preview.nodes.lockedReason.hidden, false);
  assert.equal(preview.nodes.lockedTitle.textContent, '「カットイン」は Plus プランで使えます');
  assert.match(preview.nodes.lockedDetail.textContent, /いまは無料プランです/);
  assert.match(preview.nodes.lockedDetail.textContent, /配信画面には何も出ません/);
  // README の説明と食い違わない
  assert.match(readme, /OBS には何も表示されません/);
  assert.match(readme, /\?preview=1/);
});

test('見本の理由は、プラン・停止・管理者が止めた・読めなかった、を分けて書く', () => {
  assert.equal(pageOfPath('/t/abc/widgets/cutin.html'), 'cutin.html');
  assert.equal(pageOfPath('/widgets/quiz/index.html'), 'quiz.html');
  assert.equal(lockedReason(ME, 'gift-alert.html').title, '「ギフト通知」はいまは使えないようになっています');
  const stopped = lockedReason({ ...ME, plan: { ...ME.plan, status: 'suspended' } }, 'cutin.html');
  assert.equal(stopped.title, 'いまは配信画面を止めています');
  assert.match(stopped.detail, /LuL にご連絡ください/);
  assert.equal(lockedReason(null, 'cutin.html').title, 'このウィジェットはいまは使えません');
});
