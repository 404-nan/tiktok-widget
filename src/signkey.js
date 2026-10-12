// TikTok につなぐための署名サーバー（Euler Stream）の API キー。全員の接続で共通に使う。
// 管理画面で入れたキーは data/sign-api-key.txt に残し、環境変数 TIKTOK_SIGN_API_KEY より先に使う。
// キーそのものは外に返さない（入っているか・どこから来たか・末尾4文字だけ）。

import fs from 'node:fs';
import path from 'node:path';

export function createSignKey({ dir }) {
  const file = path.join(dir, 'sign-api-key.txt');
  const fromEnv = (process.env.TIKTOK_SIGN_API_KEY || '').trim();
  let saved = '';
  try {
    saved = fs.readFileSync(file, 'utf8').trim();
  } catch {}

  // src/tiktok.js は接続するたびに環境変数を読むので、次の接続から効く
  const apply = () => {
    const key = saved || fromEnv;
    if (key) process.env.TIKTOK_SIGN_API_KEY = key;
    else delete process.env.TIKTOK_SIGN_API_KEY;
  };
  apply();

  return {
    state() {
      const key = saved || fromEnv;
      return { set: !!key, source: saved ? 'admin' : fromEnv ? 'env' : null, tail: key.length >= 12 ? key.slice(-4) : '' };
    },
    /** 空の文字なら、管理画面で入れたキーを消す（環境変数があればそちらに戻る） */
    set(value) {
      const key = String(value ?? '').trim();
      if (key.length > 300 || /[^\x21-\x7e]/.test(key)) throw new Error('API キーの形が正しくありません（空白や日本語が混ざっていないか確かめてください）');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, key ? `${key}\n` : '', { mode: 0o600 });
      fs.chmodSync(file, 0o600);
      saved = key;
      apply();
      return this.state();
    },
  };
}
