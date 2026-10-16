// 画面テスト(npm run check:ui)。開発サーバーは global-setup が空いているポートで起動する。
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/visual',
  testMatch: '*.spec.mjs',
  globalSetup: './test/visual/global-setup.mjs',
  outputDir: 'artifacts/test-results',
  reporter: [['list']],
  workers: 1,
  timeout: 60_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  // 見本画像は test/visual/<spec>-snapshots/ に置く。AIは書き換えない(npm run shot:approve をめにくんが実行)
  snapshotPathTemplate: '{testDir}/{testFileName}-snapshots/{arg}-{projectName}{ext}',
  updateSnapshots: 'none',
  use: { headless: true, deviceScaleFactor: 1 },
  projects: [
    { name: 'tate', use: { viewport: { width: 1080, height: 1920 } } }, // 縦配信
    { name: 'yoko', use: { viewport: { width: 1920, height: 1080 } } },
  ],
});
