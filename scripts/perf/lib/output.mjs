// 性能計測の結果を、日本語の表と機械が読めるJSONにそろえて出力する。

import fs from 'node:fs';
import path from 'node:path';

const number = (value, digits = 2) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '-');

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function printWidgetTable(rows) {
  console.log('画面名 | CPU % | ヒープ最大 MB | ヒープ増加 MB(GC後) | DOM増加 | 落ちたフレーム % | 最悪フレーム ms | 判定');
  console.log('--- | ---: | ---: | ---: | ---: | ---: | ---: | ---');
  for (const row of rows) {
    console.log(`${row.widget} | ${number(row.cpuPercent)} | ${number(row.heapMaxMB)} | ${number(row.heapGrowthMB)} | ${number(row.domGrowth, 0)} | ${number(row.droppedFramePercent)} | ${number(row.worstFrameMs)} | ${row.ok ? 'よし' : 'だめ'}`);
  }
}

export function printServerTable(result) {
  console.log('項目 | 数値');
  console.log('--- | ---:');
  console.log(`イベント処理量（1秒あたり） | ${number(result.eventsPerSecond)}`);
  console.log(`イベント処理 p50（ms） | ${number(result.simulateP50Ms)}`);
  console.log(`イベント処理 p95（ms） | ${number(result.simulateP95Ms)}`);
  console.log(`メモリ（開始 RSS MB → 終了 RSS MB） | ${number(result.startRssMB)} → ${number(result.endRssMB)}`);
  console.log(`WebSocket 送信量（1イベントあたり bytes） | ${number(result.websocketBytesPerEvent)}`);
  console.log(`書き込み（回数 / bytes） | ${result.sessionWrites} / ${result.sessionWriteBytes}`);
}
