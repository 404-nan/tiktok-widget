// 性能計測コマンドの引数を、ウィジェット用とサーバー用で共通に読む。

export function parseArgs(argv, defaults = {}) {
  const out = {
    quick: false,
    json: null,
    only: null,
    rate: defaults.rate ?? 50,
    seconds: defaults.seconds ?? 60,
    kinds: defaults.kinds ?? ['gift'],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--quick') out.quick = true;
    else if (arg === '--json') out.json = argv[++i] ?? null;
    else if (arg === '--only') out.only = argv[++i] ?? null;
    else if (arg === '--rate') out.rate = positiveNumber(argv[++i], '--rate');
    else if (arg === '--seconds') out.seconds = positiveNumber(argv[++i], '--seconds');
    else if (arg === '--kinds') out.kinds = String(argv[++i] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    else throw new Error(`知らない引数です: ${arg}`);
  }

  if (out.quick) {
    out.rate = Math.min(out.rate, 50);
    out.seconds = Math.min(out.seconds, 5);
  }
  if (out.rate <= 0 || out.seconds <= 0) throw new Error('rate と seconds は 0 より大きくしてください');
  return out;
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} は 0 より大きい数にしてください`);
  return number;
}
