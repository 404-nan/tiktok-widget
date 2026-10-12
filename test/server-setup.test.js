import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareServer, updateProperties, newWorldName, checkServer } from '../src/server-setup.js';
import { readPreset } from '../src/presets.js';

// パネルの代わり。止める・起動するは次に状態を見たときに反映する
function fakePanel(state = 'running', files = {}) {
  const log = [];
  let next = null;
  return {
    log,
    files,
    async state() {
      if (next) [state, next] = [next, null];
      return state;
    },
    async power(signal) {
      log.push(`power ${signal}`);
      next = signal === 'start' ? 'running' : 'offline';
      state = signal === 'start' ? 'starting' : 'stopping';
    },
    async readFile(f) {
      if (!(f in files)) throw new Error('ない');
      return files[f];
    },
    async writeFile(f, text) {
      log.push(`write ${f}`);
      files[f] = text;
    },
    async send(c) {
      if (state !== 'running') throw new Error('止まっています');
      log.push(`cmd ${c}`);
    },
  };
}

const panelMc = { enabled: true, via: 'panel', panelUrl: 'x', panelServer: 'y', panelKey: 'z' };
const opts = (client, extra = {}) => ({ client, pollMs: 1, afterStartMs: 0, now: new Date(2026, 9, 12, 21, 5), ...extra });

test('server.properties は指定した項目だけ書き換え、コメントや他の項目は残す', () => {
  const before = '#Minecraft server properties\nlevel-name=world\nrcon.password=secret\ndifficulty=easy\n';
  const after = updateProperties(before, { 'level-name': 'bougai-endra-1', difficulty: 'normal', 'level-type': 'minecraft:normal', 'allow-flight': true });
  assert.equal(after, '#Minecraft server properties\nlevel-name=bougai-endra-1\nrcon.password=secret\ndifficulty=normal\nlevel-type=minecraft\\:normal\nallow-flight=true\n');
  assert.equal(newWorldName('bougai-endra', new Date(2026, 9, 12, 21, 5)), 'bougai-endra-20261012-2105');
});

test('パネルのとき: 止める → 新しい世界にする → 起動 → コマンド の順に進む', async () => {
  const panel = fakePanel('running', { '/server.properties': 'level-name=world\nonline-mode=true\n' });
  const steps = [];
  const r = await prepareServer(readPreset('bougai-endra'), panelMc, opts(panel, { onStep: (t) => steps.push(t) }));
  assert.equal(r.world, 'bougai-endra-20261012-2105');
  assert.deepEqual(panel.log.slice(0, 3), ['power stop', 'write /server.properties', 'power start']);
  assert.ok(panel.log.includes('cmd gamemode survival @a'));
  const props = panel.files['/server.properties'];
  assert.match(props, /^level-name=bougai-endra-20261012-2105$/m);
  assert.match(props, /^online-mode=true$/m);
  assert.match(props, /^allow-flight=true$/m);
  assert.equal(steps.at(-1), '準備ができました');
});

test('一度も起動していないサーバー（server.properties がない）でも準備できる', async () => {
  const panel = fakePanel('offline');
  await prepareServer(readPreset('bougai-parkour'), panelMc, opts(panel));
  assert.equal(panel.log[0], 'write /server.properties');
  assert.match(panel.files['/server.properties'], /^level-name=parkour$/m);
  assert.match(panel.files['/server.properties'], /^gamemode=adventure$/m);
});

test('RCON のときはコマンドだけ送る。Minecraft 連携がオフなら何もしない', async () => {
  const sent = [];
  const rcon = { send: async (c) => sent.push(c), close() {} };
  const steps = [];
  await prepareServer(readPreset('bougai-diamond'), { enabled: true, via: 'rcon' }, opts(rcon, { onStep: (t) => steps.push(t) }));
  assert.ok(sent.includes('clear @a diamond'));
  assert.ok(steps[0].includes('コマンドだけ'));
  await assert.rejects(prepareServer(readPreset('bougai-diamond'), { enabled: false }, opts(rcon)), /オフ/);
});

test('ひな形の server の間違い（パスワードを変える・世界の名前がおかしい）はエラー', () => {
  const errors = checkServer({ world: '../x', properties: { 'rcon.password': 'a', 'level-name': 'w' }, commands: 'say' });
  assert.equal(errors.length, 4);
});
