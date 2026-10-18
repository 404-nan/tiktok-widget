// 計測した数値を上限と比べ、画面に依存しない形で合否と理由を返す。

const LABELS = {
  cpuPercent: 'CPU',
  heapGrowthMB: 'ヒープ増加',
  droppedFramePercent: '落ちたフレーム',
  websocketBytesPerEvent: 'WebSocket 1イベントあたりの送信バイト',
  simulateP95Ms: 'イベント処理 p95',
  memoryGrowthMB: 'サーバーメモリ増加',
};

export function judge(measured = {}, limits = {}) {
  const reasons = [];
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof limit !== 'number' || !Number.isFinite(limit)) continue;
    const value = measured[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      reasons.push(`${LABELS[key] ?? key} の数字がありません`);
    } else if (value > limit) {
      reasons.push(`${LABELS[key] ?? key} ${value.toFixed(2)} が上限 ${limit} を超えています`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}
