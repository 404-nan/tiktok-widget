// 公開側の死活確認、Cloudflare DNS の確認・切替、転送したデータの最小検証。
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const hostname = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const dnsId = /^[a-f0-9]{32}$/;
const unavailable = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530]);

class CheckError extends Error {}
function requireCheck(condition, message) {
  if (!condition) throw new CheckError(message);
}

export async function validateSnapshot(dir) {
  const tenants = JSON.parse(await readFile(join(dir, 'data/tenants.json'), 'utf8'));
  requireCheck(Array.isArray(tenants.tenants) && tenants.tenants.length > 0, '配信者が入った tenants.json がありません。');
  const token = await stat(join(dir, 'data/admin-token.txt'));
  requireCheck(token.isFile() && token.size > 0, '空でない admin-token.txt がありません。');
  const config = await stat(join(dir, 'config.yaml')).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  requireCheck(!config || config.isFile(), 'config.yaml がファイルではありません。');
}

export function createRoute({ env = process.env, request = fetch, pause = delay } = {}) {
  const { PUBLIC_HOST: host, STANDBY_PROBE_HOST: probeHost, CF_ZONE_ID: zone,
    CF_DNS_RECORD_ID: recordId, PRIMARY_TUNNEL_ID: mainTunnel, STANDBY_TUNNEL_ID: standbyTunnel,
    CF_API_TOKEN: apiToken, TUNNEL_TOKEN: tunnelToken } = env;

  function checkHost(value) {
    requireCheck(hostname.test(value ?? ''), 'ホスト名の設定が不正です（https:// やパスは含めません）。');
  }

  async function send(url, options, target) {
    try {
      return await request(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(5_000) });
    } catch {
      throw new CheckError(`${target}: 接続失敗・タイムアウト・リダイレクトのいずれかです。`);
    }
  }

  async function publicRequest(target, path) {
    checkHost(target);
    return send(`https://${target}/${path}?standby-check=${randomUUID()}`,
      { headers: { 'cache-control': 'no-cache, no-store' } }, `${target}/${path}`);
  }

  async function health() {
    const reply = await publicRequest(host, 'healthz');
    if (!reply.ok) throw new CheckError(`${host}/healthz: HTTP ${reply.status}。`);
    const payload = await reply.json().catch(() => null);
    requireCheck(payload?.ok === true && Number.isInteger(payload.live) && payload.live >= 0,
      `${host}/healthz: ライコネの応答ではありません。`);
    return payload;
  }

  async function checkOrigin(target, marker) {
    requireCheck(uuid.test(marker ?? ''), '昇格時の識別子が不正です。');
    const reply = await publicRequest(target, `help/standby-${marker}.txt`);
    requireCheck(reply.ok && (await reply.text()).trim() === marker,
      `${target}: 待機機固有の応答を確認できません（HTTP ${reply.status}）。`);
  }

  function routeConfig() {
    checkHost(host);
    checkHost(probeHost);
    requireCheck(host !== probeHost, '本番用と待機機の確認用は別のホスト名を設定してください。');
    requireCheck(dnsId.test(zone ?? '') && dnsId.test(recordId ?? '') && Boolean(apiToken),
      'Cloudflare のゾーン、DNS レコード ID、または API キーがありません。');
    requireCheck(uuid.test(mainTunnel ?? '') && uuid.test(standbyTunnel ?? '') && mainTunnel !== standbyTunnel,
      '本番と待機機にはそれぞれ別のトンネル ID が必要です。');
    return {
      url: `https://api.cloudflare.com/client/v4/zones/${zone}/dns_records/${recordId}`,
      main: `${mainTunnel}.cfargotunnel.com`, standby: `${standbyTunnel}.cfargotunnel.com`,
    };
  }

  async function dnsRecord(cfg, content) {
    const options = { headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' } };
    if (content) Object.assign(options, { method: 'PATCH', body: JSON.stringify({ content }) });
    const operation = content ? 'Cloudflare DNS 更新' : 'Cloudflare DNS 確認';
    const reply = await send(cfg.url, options, operation);
    const result = reply.ok ? await reply.json().catch(() => null) : null;
    requireCheck(result?.success === true, `${operation}: HTTP ${reply.status}、成功の応答がありません。`);
    const record = result.result;
    requireCheck(record?.id === recordId && record?.type === 'CNAME' && record?.name === host && record?.proxied === true,
      `${operation}: 指定 ID が公開ホストのプロキシ付き CNAME と一致しません。`);
    requireCheck(record.content === cfg.main || record.content === cfg.standby,
      `${operation}: 未知のトンネルを指しています。変更しません。`);
    if (content) requireCheck(record.content === content, `${operation}: 更新結果が指定先と一致しません。`);
    return record.content;
  }

  async function requirePrimaryDown() {
    const reply = await publicRequest(host, 'healthz');
    requireCheck(unavailable.has(reply.status) && reply.headers.has('cf-ray'),
      `${host}/healthz: 旧本番の公開停止を確認できません（HTTP ${reply.status}）。転送先は変更しません。`);
  }

  async function preflight() {
    const cfg = routeConfig();
    let tokenId;
    try { tokenId = JSON.parse(Buffer.from(tunnelToken ?? '', 'base64').toString('utf8')).t; } catch {}
    requireCheck(tokenId === standbyTunnel, '起動用トークンが待機専用トンネルのものと一致しません。');
    if (await dnsRecord(cfg) !== cfg.main) return 'standby';
    await requirePrimaryDown();
    return 'primary';
  }

  async function switchRoute(marker) {
    const cfg = routeConfig();
    // 別ホスト名で待機機の応答を先に確認し、本番 DNS を壊さない。
    for (let i = 0; ; i++) {
      try { await checkOrigin(probeHost, marker); break; } catch (error) {
        if (i === 11) throw error;
        await pause(2_000);
      }
    }
    if (await dnsRecord(cfg) === cfg.main) {
      await requirePrimaryDown();
      await dnsRecord(cfg, cfg.standby);
    }
    for (let i = 0; ; i++) {
      try {
        await checkOrigin(host, marker);
        await health();
        return;
      } catch (error) {
        if (i === 11) throw error;
        await pause(2_000);
      }
    }
  }

  return { health, preflight, switchRoute, checkOrigin: (marker) => checkOrigin(host, marker) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , command, arg] = process.argv;
  const route = createRoute();
  try {
    if (command === 'validate') await validateSnapshot(arg);
    else if (command === 'health') await route.health();
    else if (command === 'preflight') console.log(await route.preflight());
    else if (command === 'switch') await route.switchRoute(arg);
    else if (command === 'origin') await route.checkOrigin(arg);
    else throw new CheckError('不明な確認操作です。');
  } catch (error) {
    const reason = error instanceof CheckError ? error.message : (error.code ?? '読み込みまたは形式のエラー');
    console.error(`[${new Date().toISOString()}] standby-route/${command}: ${reason}`);
    process.exitCode = 1;
  }
}
