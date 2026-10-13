import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MediaAlerts, MEDIA_LIMITS, AUTOPLAY_NOTE } from '../src/media-alerts.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-media-'));
  const sent = [];
  const hub = { broadcast: (msg) => sent.push(msg) };
  const media = new MediaAlerts({ dir, hub });
  return { dir, media, sent, hub };
}

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test('アップロード・一覧・削除と、種類・大きさの制限', () => {
  const { media, dir } = setup();
  const item = media.addBuffer({ mime: 'image/png', name: '花.png', buffer: png });
  assert.equal(item.kind, 'image');
  assert.equal(media.snapshot().items.length, 1);
  assert.equal(fs.existsSync(path.join(dir, 'catalog.json')), true);
  const info = media.fileInfo(item.id);
  assert.equal(fs.readFileSync(info.path).equals(png), true);
  assert.equal(media.fileInfo('../secret'), null);
  assert.throws(() => media.addBuffer({ mime: 'text/plain', name: 'a.txt', buffer: Buffer.from('x') }), /種類/);
  const before = MEDIA_LIMITS.image;
  try {
    MEDIA_LIMITS.image = 3;
    assert.throws(() => media.addBuffer({ mime: 'image/png', name: 'big.png', buffer: png }), /大き/);
  } finally {
    MEDIA_LIMITS.image = before;
  }
  media.remove(item.id);
  assert.equal(media.snapshot().items.length, 0);
  assert.equal(fs.existsSync(info.path), false);
  assert.throws(() => media.remove(item.id), /見つかりません/);
});

test('ディレクトリの外のファイルは読み込まない', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-media-escape-'));
  const dir = path.join(parent, 'alert-media');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(parent, 'secret.txt'), 'no');
  fs.writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify({
    items: [{ id: 'abcdefabcdefabcd', name: 'x', mime: 'image/png', size: 1, file: '../secret.txt', createdAt: 1 }],
  }));
  const media = new MediaAlerts({ dir, hub: { broadcast() {} } });
  assert.equal(media.snapshot().items.length, 0);
  assert.equal(media.fileInfo('abcdefabcdefabcd'), null);
  assert.equal(fs.readFileSync(path.join(parent, 'secret.txt'), 'utf8'), 'no');
});

test('ギフトは ID と最低コインの両方、フォロー、全部を待ち列にして順に再生', () => {
  const { media, sent } = setup();
  const a = media.addBuffer({ mime: 'image/png', name: 'a.png', buffer: png });
  const b = media.addBuffer({ mime: 'audio/mpeg', name: 'b.mp3', buffer: Buffer.from('abc') });
  media.setConfig({
    enabled: true,
    rules: [
      { gifts: ['5655'], minCoins: 50, mediaId: a.id },
      { events: ['follow'], mediaId: b.id },
      { mediaId: a.id },
    ],
  });
  media.onEvent({ kind: 'gift', gift: { id: '5655', name: 'Rose', count: 1 }, totalDiamonds: 40 });
  assert.equal(media.snapshot().playing, null);
  media.onEvent({ kind: 'gift', gift: { id: '5655', name: 'Rose', count: 1 }, totalDiamonds: 50, user: { id: 'u', name: 'たろう' } });
  assert.equal(media.snapshot().playing.item.id, a.id);
  assert.equal(sent.at(-1).item.giftLabel, 'バラ');
  assert.equal(sent.at(-1).item.holdMs, 4000);
  media.onEvent({ kind: 'follow', user: { id: 'u', name: 'たろう' } });
  assert.equal(media.snapshot().queue.length, 1);
  assert.equal(media.snapshot().queue[0].item.id, b.id);
  const token = media.snapshot().playing.token;
  assert.equal(media.ack('nope'), false);
  assert.equal(media.ack(token), true);
  assert.equal(media.snapshot().playing.item.id, b.id);
  assert.equal(sent.at(-1).event, 'play');
});

test('オフのときはイベントでは再生せず、直接の再生はできる', () => {
  const { media } = setup();
  const item = media.addBuffer({ mime: 'image/gif', name: 'g.gif', buffer: png });
  media.setConfig({ enabled: false, rules: [{ gifts: ['5655'], mediaId: item.id }] });
  media.onEvent({ kind: 'gift', gift: { id: '5655', name: 'Rose' }, totalDiamonds: 10 });
  assert.equal(media.snapshot().playing, null);
  media.play(item.id, { source: 'action' });
  assert.equal(media.snapshot().playing.item.id, item.id);
});

test('音あり自動再生が拒否されたらダッシュボード向けの文を残す', () => {
  const { media } = setup();
  const note = media.reportAutoplay({ muted: true });
  assert.equal(note.note, AUTOPLAY_NOTE);
  assert.equal(media.snapshot().autoplay.muted, true);
  media.reportAutoplay({ muted: false });
  assert.equal(media.snapshot().autoplay.note, null);
});

test('待ち列は 30 件で頭から捨てる', () => {
  const { media } = setup();
  const item = media.addBuffer({ mime: 'image/webp', name: 'w.webp', buffer: png });
  media.play(item.id);
  for (let i = 0; i < 31; i++) media.play(item.id);
  assert.equal(media.snapshot().queue.length, 30);
});
