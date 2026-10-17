import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MCP_ENTRY = path.join(repoRoot, 'mcp', 'server.js');
const CLI_ENTRY = path.join(repoRoot, 'bin', 'tw.js');

const tmpDirs = [];
const tmpDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-guard-'));
  tmpDirs.push(d);
  return d;
};
process.once('exit', () => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

const STRIP = ['TW_HOSTED', 'TW_SERVER', 'TW_AI_TOKEN', 'TW_AI_TENANT', 'TW_CONFIG', 'TW_DATA', 'TW_ENV', 'PORT', 'TIKTOK_USERNAME', 'TW_VAULT', 'TW_ADMIN_TOKEN'];
export const cleanEnv = (over = {}) => {
  const env = { ...process.env };
  for (const k of STRIP) delete env[k];
  return Object.assign(env, over);
};

// 1人用の形( TW_HOSTED も tenants.json も無い)のローカル環境。hosted なのは送り先のサーバーだけ
export function localScenario() {
  const root = tmpDir();
  const configPath = path.join(root, 'config.yaml');
  fs.writeFileSync(configPath, fs.readFileSync(path.join(repoRoot, 'config.example.yaml'), 'utf8'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return { root, configPath, dataDir, env: { TW_CONFIG: configPath, TW_DATA: dataDir } };
}

const listenPort = (server) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close((error) => error ? reject(error) : resolve(port));
  });
});

/** 実物の server.js を hosted として一時ポートで起動し、ready を返す */
export async function startHostedServer(s) {
  const probe = net.createServer();
  const port = await listenPort(probe);
  const child = spawn(process.execPath, [path.join(repoRoot, 'server.js')], {
    cwd: repoRoot,
    env: cleanEnv({ ...s.env, TW_HOSTED: '1', HOST: '127.0.0.1', PORT: String(port) }),
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const stderr = [];
  child.stderr.on('data', (d) => stderr.push(String(d)));
  const target = `http://127.0.0.1:${port}`;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`hosted サーバーが起動しません\n${stderr.join('')}`)), 60000);
    const poll = () => {
      const sock = net.connect(port, '127.0.0.1');
      sock.once('connect', () => { sock.destroy(); clearTimeout(timer); resolve(target); });
      sock.once('error', () => { sock.destroy(); setTimeout(poll, 100); });
    };
    poll();
  });
  return { child, target, ready };
}

/** リクエストを本物に中継しつつ記録するプロキシ */
export function startProxy(target) {
  const hits = [];
  const proxyServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      hits.push({ method: req.method, url: req.url });
      const nreq = http.request(`${target}${req.url}`, {
        method: req.method,
        headers: { ...req.headers, host: new URL(target).host },
      }, (nres) => {
        res.writeHead(nres.statusCode, nres.headers);
        nres.pipe(res);
      });
      nreq.on('error', () => { try { res.writeHead(502); res.end(); } catch {} });
      if (chunks.length) nreq.write(Buffer.concat(chunks));
      nreq.end();
    });
  });
  return {
    hits,
    served: () => new Promise((resolve) => proxyServer.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${proxyServer.address().port}`))),
    stop: () => new Promise((resolve) => {
      proxyServer.closeAllConnections?.();
      proxyServer.close(() => resolve());
    }),
  };
}

export async function withMcp(env, run) {
  const child = spawn(process.execPath, [MCP_ENTRY], { cwd: repoRoot, env: cleanEnv(env), stdio: ['pipe', 'pipe', 'pipe'] });
  const stderr = [];
  child.stderr.on('data', (d) => stderr.push(String(d)));
  let buffer = '';
  const readers = new Map();
  let nextId = 1;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (;;) {
      const i = buffer.indexOf('\n');
      if (i === -1) break;
      const raw = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      if (!raw.trim()) continue;
      let msg = null;
      try { msg = JSON.parse(raw); } catch {}
      if (msg && msg.id != null && readers.has(msg.id)) {
        readers.get(msg.id)(msg);
        readers.delete(msg.id);
      }
    }
  });
  const request = (method, params) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        readers.delete(id);
        reject(new Error(`MCP ${method} が応答しません\nstderr: ${stderr.join('')}`));
      }, 60000);
      readers.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  };
  try {
    const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'acceptance-guard', version: '0.0.0' } });
    if (init.error) throw new Error(`initialize 失敗: ${JSON.stringify(init.error)}\nstderr: ${stderr.join('')}`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
    return await run({ request });
  } finally {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

export const callTool = async (request, name, args) => {
  const msg = await request('tools/call', { name, arguments: args });
  assert.ok(!msg.error, `tools/call ${name} が失敗: ${JSON.stringify(msg.error)}`);
  const result = msg.result ?? {};
  const text = (result.content ?? []).map((c) => c.text ?? '').join('\n');
  return { isError: result.isError === true, text };
};

export function runCliWithCode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...args], { cwd: repoRoot, env: cleanEnv(env), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`tw ${args.join(' ')} がタイムアウトしました\n${out}`));
    }, 60000);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}
