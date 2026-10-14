import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-cutin-'));
process.env.TW_CONFIG = path.join(dir, 'config.yaml');
const cfg = await import('../src/config.js');
const style = await import('../src/cutin-style.js');
const { SCHEMA } = await import('../src/schema.js');

function loadCutinStyle() {
  const sandbox = { console, Math, Number, isFinite, Object };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/widgets/lib/cutin-style.js'), 'utf8'), sandbox);
  return sandbox.CutinStyle;
}

test('文字の太さは普通と太字だけ、画像スタイルは縞が3種', () => {
  assert.deepEqual(SCHEMA.cutins.fields.textWeight.values, ['normal', 'bold']);
  assert.deepEqual(style.TEXT_WEIGHTS, ['normal', 'bold']);
  assert.deepEqual(style.TEXT_WEIGHT_LABELS, { normal: '普通', bold: '太字' });
  assert.deepEqual(style.IMAGE_STYLES, ['stripe', 'invert', 'thick']);
  assert.deepEqual(style.IMAGE_STYLES.map((id) => style.STYLES[id].label), ['縞・標準', '縞・反転', '縞・枠太']);
});

test('古いカットイン設定は初期値で埋まり、写真の置き方は残る', () => {
  const { config, errors, warnings } = cfg.normalize({
    cutins: { default: { minCoins: 100, redText: '激アツ' } },
    imageCutins: { default: { photo: 'media/a.png', layout: 'side', minCoins: 1000 } },
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(config.cutins.default.textWeight, 'normal');
  assert.equal(config.cutins.default.redText, '激アツ');
  assert.equal(config.cutins.default.minCoins, 100);
  assert.equal(config.imageCutins.default.layout, 'side');
  assert.equal(config.imageCutins.default.photo, 'media/a.png');
  assert.equal(config.imageCutins.default.minCoins, 1000);
  assert.equal(config.imageCutins.default.imageStyle, '');
  assert.deepEqual(config.imageCutins.default.crop, { x: 0.5, y: 0.5, scale: 1 });
});

test('スタイルと切り抜きの範囲を外すと直し、元画像の中身は保存しない', () => {
  const badStyle = cfg.normalize({ cutins: { default: { textWeight: 'black' } }, imageCutins: { default: { imageStyle: 'glass' } } });
  assert.ok(badStyle.errors.some((e) => e.includes('textWeight')));
  assert.ok(badStyle.errors.some((e) => e.includes('imageStyle')));
  assert.equal(badStyle.config.cutins.default.textWeight, 'normal');
  assert.equal(badStyle.config.imageCutins.default.imageStyle, '');

  const crop = cfg.normalize({
    imageCutins: { default: { photo: 'media/a.png', crop: { x: 0.25, y: 2, scale: 9, pixels: 'data:image/png;base64,aaaa' } } },
  });
  assert.deepEqual(crop.config.imageCutins.default.crop, { x: 0.25, y: 1, scale: 4 });
  assert.equal(crop.config.imageCutins.default.photo, 'media/a.png');
  assert.equal(JSON.stringify(crop.config.imageCutins.default.crop).includes('data:'), false);
  assert.ok(crop.errors.some((e) => e.includes('y')));
  assert.ok(crop.errors.some((e) => e.includes('scale')));
  assert.ok(crop.warnings.some((w) => w.includes('pixels')));

  const ok = cfg.normalize({ cutins: { default: { textWeight: 'bold' } }, imageCutins: { default: { imageStyle: 'thick', crop: { x: '0.2', y: '0.8', scale: '2' } } } });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.config.cutins.default.textWeight, 'bold');
  assert.equal(ok.config.imageCutins.default.imageStyle, 'thick');
  assert.deepEqual(ok.config.imageCutins.default.crop, { x: 0.2, y: 0.8, scale: 2 });
});

test('ひな形は縞を空のまま読め、帯の縦横比は3種で同じ', () => {
  fs.copyFileSync(cfg.EXAMPLE_PATH, cfg.CONFIG_PATH);
  const loaded = cfg.load();
  assert.deepEqual(loaded.errors, []);
  assert.deepEqual(loaded.warnings, []);
  assert.equal(loaded.config.cutins.default.textWeight, 'normal');
  assert.equal(loaded.config.imageCutins.default.imageStyle, '');
  assert.equal(loaded.config.imageCutins.default.layout, 'inside');
  assert.deepEqual(loaded.config.imageCutins.default.crop, { x: 0.5, y: 0.5, scale: 1 });

  const paints = [];
  for (const id of style.IMAGE_STYLES) {
    const spec = style.STYLES[id];
    const metrics = style.frameMetrics(360, 640, spec);
    const paint = style.hatchBackground(spec);
    paints.push(paint);
    assert.ok(Math.abs(metrics.bandW / metrics.bandH - style.BAND_ASPECT) < 1e-9, id);
    assert.ok(metrics.hatch > 8, id);
    assert.match(paint, /^repeating-linear-gradient\(/);
    assert.equal(paint.replaceAll('repeating-linear-gradient', '').includes('linear-gradient'), false);
    assert.doesNotMatch(paint, /backdrop-filter|blur\(/);
  }
  assert.equal(new Set(paints).size, 3);
  assert.notEqual(style.STYLES.stripe.border, style.STYLES.thick.border);
  assert.notEqual(style.STYLES.stripe.angle, style.STYLES.invert.angle);
  assert.notEqual(style.STYLES.stripe.ink, style.STYLES.invert.ink);
});

test('公開側の切り抜き計算はサーバーと同じで、帯からはみ出さない', () => {
  const pub = loadCutinStyle();
  const cases = [
    [240, 100, 240, 100, { x: 0.5, y: 0.5, scale: 1 }],
    [240, 100, 240, 100, { x: 0, y: 0.2, scale: 2 }],
    [100, 300, 240, 100, { x: 0.2, y: 0.8, scale: 1.5 }],
    [400, 200, 240, 100, { x: 0.5, y: 0.5, scale: 2 }],
  ];
  for (const args of cases) {
    const server = style.layoutImage(...args);
    const client = JSON.parse(JSON.stringify(pub.layoutImage(...args)));
    assert.deepEqual(client, server);
    assert.ok(client.left <= 0.001);
    assert.ok(client.top <= 0.001);
    assert.ok(client.left + client.width >= args[2] - 0.001);
    assert.ok(client.top + client.height >= args[3] - 0.001);
  }
  for (const id of style.IMAGE_STYLES) {
    assert.equal(pub.hatchBackground(pub.styleById(id)), style.hatchBackground(style.STYLES[id]));
    assert.deepEqual(JSON.parse(JSON.stringify(pub.frameMetrics(360, 640, pub.styleById(id)))), style.frameMetrics(360, 640, style.STYLES[id]));
  }
  const zoom = style.zoomKeepPoint(200, 200, 200, 100, 100, 50, 0.5, 0.5, 2);
  assert.equal(zoom.scale, 2);
  assert.equal(zoom.x, 0.5);
  assert.deepEqual(zoom, JSON.parse(JSON.stringify(pub.zoomKeepPoint(200, 200, 200, 100, 100, 50, 0.5, 0.5, 2))));
  const laid = style.layoutImage(400, 200, 240, 100, { x: 0.5, y: 0.5, scale: 2 });
  const moved = style.layoutImage(400, 200, 240, 100, {
    x: (240 / 2 - (laid.left + 30)) / laid.width,
    y: (100 / 2 - laid.top) / laid.height,
    scale: 2,
  });
  assert.notEqual(moved.x, laid.x);
  assert.ok(moved.left <= 0.001 && moved.left + moved.width >= 240 - 0.001);
});

test('画面のJSは開発者向けのメモを出さず、縞にガラスやグラデーション塗りが無い', () => {
  const cropJs = fs.readFileSync(path.join(root, 'public/dashboard/cutin-crop.js'), 'utf8');
  const styleJs = fs.readFileSync(path.join(root, 'public/widgets/lib/cutin-style.js'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'public/dashboard/editor.js'), 'utf8');
  assert.doesNotMatch(cropJs, /console\.|TODO|FIXME|debug|ES5/);
  assert.doesNotMatch(styleJs, /console\.|TODO|FIXME|backdrop-filter|blur\(/);
  assert.match(cropJs, /中央に戻す/);
  assert.match(styleJs, /縞・標準/);
  assert.match(styleJs, /縞・反転/);
  assert.match(styleJs, /縞・枠太/);
  assert.match(editor, /縞・標準/);
  assert.match(editor, /'普通'/);
  assert.match(editor, /'太字'/);
  const dash = fs.readFileSync(path.join(root, 'public/dashboard/style.css'), 'utf8');
  const part = dash.slice(dash.indexOf('.cutin-crop'));
  assert.ok(part.length > 100);
  assert.doesNotMatch(part, /linear-gradient|backdrop-filter|blur\(/);
  const page = fs.readFileSync(path.join(root, 'public/dashboard/index.html'), 'utf8');
  const widget = fs.readFileSync(path.join(root, 'public/widgets/image-cutin.html'), 'utf8');
  assert.ok(page.indexOf('cutin-style.js') < page.indexOf('cutin-crop.js'));
  assert.ok(page.indexOf('cutin-crop.js') < page.indexOf('app.js'));
  assert.match(widget, /cutin-style\.js/);
  assert.match(fs.readFileSync(path.join(root, 'public/widgets/lib/cutin.js'), 'utf8'), /weight-bold/);
  assert.match(fs.readFileSync(path.join(root, 'public/widgets/lib/cutin.css'), 'utf8'), /\.weight-bold/);
});
