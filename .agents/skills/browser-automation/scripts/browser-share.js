#!/usr/bin/env node
/**
 * browser-share.js — Temporary remote view of (and control over) this repo's
 * browser, so the user can watch or interact from their phone/another device:
 * credential entry, "show me what you're doing", remote login, etc.
 *
 * What it does:
 *   1. Default: closes this repo's browser instance and relaunches it fresh
 *      with a single tab on <url> — total isolation, only that view exposed.
 *      Other repos/agents have their own browser and are unaffected; session
 *      cookies persist in .browser-profile across the restart.
 *      --attach: skips the restart and shares the running session as-is; the
 *      viewer gets a tab bar to switch between all open tabs.
 *   2. Enables the agent-browser stream on a random localhost port.
 *   3. Starts a tiny HTTP+WebSocket server (random port) serving viewer.html,
 *      which bridges to the stream (the stream only accepts localhost browser
 *      origins, so the page cannot connect to it directly).
 *   4. Exposes it via an ephemeral cloudflared quick tunnel (PATH or npx
 *      fallback) — or directly on the LAN with --lan. Prints the link.
 *   5. TTL: default 300s, clamped to 300s max; --ttl 0 = infinite (explicit
 *      opt-in only). Teardown kills tunnel+viewer; the browser stays open.
 *
 * Usage (from the repo root):
 *   node .agents/skills/browser-automation/scripts/browser-share.js <url> [--ttl <sec>] [--viewport <WxH>] [--headed] [--lan]
 *   node .agents/skills/browser-automation/scripts/browser-share.js --attach [--ttl <sec>] [--lan]
 *
 * Requires: agent-browser, Node >= 22 (global WebSocket). cloudflared optional
 * (PATH or npx); --lan needs neither.
 *
 * Env:
 *   BROWSER_DEBUG=1   Verbose logging to stderr.
 */
'use strict';

const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');

const REPO_ROOT = process.cwd();
const PROFILE_DIR = path.join(REPO_ROOT, '.browser-profile');
const CONFIG_PATH = path.join(REPO_ROOT, 'agent-browser.json');
const DEBUG = process.env.BROWSER_DEBUG === '1';
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function debug(msg) { if (DEBUG) console.error(`[browser-share:debug] ${msg}`); }
function fail(msg) { console.error(`[browser-share] ${msg}`); cleanup(1); }

// --- agent-browser env (mirrors browser.js) ---

function env() {
  const e = Object.assign({}, process.env);
  e.AGENT_BROWSER_CONFIG = e.AGENT_BROWSER_CONFIG || CONFIG_PATH;
  e.AGENT_BROWSER_ARGS = e.AGENT_BROWSER_ARGS || '--no-sandbox,--disable-blink-features=AutomationControlled';
  e.AGENT_BROWSER_PROFILE = e.AGENT_BROWSER_PROFILE || PROFILE_DIR;
  e.AGENT_BROWSER_NAMESPACE = e.AGENT_BROWSER_NAMESPACE || path.basename(REPO_ROOT);
  if (!e.AGENT_BROWSER_EXECUTABLE_PATH) {
    for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
                     'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                     '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']) {
      if (fs.existsSync(p)) { e.AGENT_BROWSER_EXECUTABLE_PATH = p; break; }
    }
  }
  return e;
}

function abBin() {
  if (process.env.AGENT_BROWSER_BIN) return [process.env.AGENT_BROWSER_BIN];
  const local = path.join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'agent-browser.cmd' : 'agent-browser');
  if (fs.existsSync(local)) return [local];
  const probe = spawnSync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!probe.error) return ['agent-browser'];
  return process.platform === 'win32' ? ['cmd.exe', '/d', '/s', '/c', 'npx', '-y', 'agent-browser']
                                    : ['npx', '-y', 'agent-browser'];
}

function ab(args) {
  const [bin, ...binArgs] = abBin();
  const r = spawnSync(bin, [...binArgs, ...args], { env: env(), encoding: 'utf8', timeout: 30000 });
  if (r.error) throw new Error(`agent-browser spawn failed: ${r.error.message}`);
  debug(`ab ${args.join(' ')} -> ${r.status}${r.stderr ? ' stderr:' + r.stderr.trim().slice(0, 300) : ''}`);
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function abJson(args) {
  const r = ab([...args, '--json']);
  try { return JSON.parse(r.stdout); } catch { return null; }
}

// Non-fatal variant — returns exit status, never calls fail().
function abSoft(args) {
  const [bin, ...binArgs] = abBin();
  const r = spawnSync(bin, [...binArgs, ...args], { env: env(), encoding: 'utf8', timeout: 15000 });
  return r.status;
}

// Cross-platform sync sleep (no shell-out).
function sleepSync(ms) {
  const b = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(b, 0, 0, ms);
}

// --- args ---

const NODE_MAJOR = parseInt(process.versions.node, 10);
if (NODE_MAJOR < 22) {
  console.error(`[browser-share] requires Node >= 22 (uses global WebSocket); found ${process.versions.node}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const ATTACH = args.includes('--attach');   // share the running session, all tabs switchable
const HEADED = args.includes('--headed');   // force headed on fresh launch
const LAN = args.includes('--lan');         // expose on LAN instead of cloudflared tunnel
// Positional args = non-flag tokens that aren't values of value-taking flags.
const VALUE_FLAGS = new Set(['--ttl', '--viewport']);
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) { if (VALUE_FLAGS.has(a)) i++; continue; }
  positional.push(a);
}
const url = positional[0];
const ttlIdx = args.indexOf('--ttl');
const vpIdx = args.indexOf('--viewport');
// Remote viewport shown to the user — desktop by default (VNC-like view of the
// real browser). Pass --viewport 390x844 for a mobile layout on phones.
const VIEWPORT = vpIdx >= 0 ? args[vpIdx + 1] : '1280x720';
// TTL: default 5 min (security). --ttl 0 = infinite, explicit opt-in only.
// Any other value is clamped to 300s.
const MAX_TTL = 300;
let TTL_SEC = ttlIdx >= 0 ? parseInt(args[ttlIdx + 1], 10) : MAX_TTL;

if (!ATTACH && (!url || !/^https?:\/\//.test(url))) {
  console.error('Usage: browser-share.js <url> [--ttl <sec>] [--viewport <WxH>] [--headed] [--lan]');
  console.error('       browser-share.js --attach [--ttl <sec>] [--lan]   (share running session, all tabs)');
  process.exit(1);
}
if (!Number.isFinite(TTL_SEC) || TTL_SEC < 0) {
  console.error('--ttl must be a non-negative number of seconds (0 = infinite, explicit only)');
  process.exit(1);
}
if (TTL_SEC > MAX_TTL) {
  console.error(`[browser-share] --ttl ${TTL_SEC}s exceeds max ${MAX_TTL}s — clamped`);
  TTL_SEC = MAX_TTL;
}

// --- state for cleanup ---

let server = null;
let tunnel = null;
let upstream = null;
let cleaned = false;
let viewportChanged = false;

function cleanup(code = 0) {
  if (cleaned) return;
  cleaned = true;
  debug('cleanup');
  if (tunnel) { try { tunnel.kill('SIGTERM'); } catch {} }
  if (upstream) { try { upstream.close(); } catch {} }
  if (server) { try { server.close(); } catch {} }
  if (viewportChanged) { try { ab(['set', 'viewport', '1280', '720']); } catch {} }
  // Give cloudflared a moment to die, then force.
  setTimeout(() => { try { if (tunnel) tunnel.kill('SIGKILL'); } catch {} process.exit(code); }, 800).unref();
  setTimeout(() => process.exit(code), 3000).unref();
}

process.on('SIGINT', () => { console.error('\n[browser-share] interrupted — tearing down'); cleanup(0); });
process.on('SIGTERM', () => { console.error('\n[browser-share] terminated — tearing down'); cleanup(0); });

// --- port picker ---

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

// --- minimal WebSocket server (RFC 6455, text/binary, ping/pong, fragmentation) ---

const WS_MAGIC = crypto.createHash('sha1').update(WS_GUID).digest();

function wsAccept(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}

function encodeFrame(opcode, payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, data]);
}

// Parses buffered bytes into complete messages.
// Returns { messages: [{opcode, payload(Buffer)}], rest: Buffer }
function decodeFrames(buf) {
  const messages = [];
  let off = 0;
  while (buf.length - off >= 2) {
    const b0 = buf[off];
    const b1 = buf[off + 1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let pos = off + 2;
    if (len === 126) {
      if (buf.length - pos < 2) break;
      len = buf.readUInt16BE(pos); pos += 2;
    } else if (len === 127) {
      if (buf.length - pos < 8) break;
      len = Number(buf.readBigUInt64BE(pos)); pos += 8;
    }
    const maskLen = masked ? 4 : 0;
    if (buf.length - pos < maskLen + len) break;
    let payload = buf.subarray(pos + maskLen, pos + maskLen + len);
    if (masked) {
      const mask = buf.subarray(pos, pos + 4);
      const unmasked = Buffer.alloc(len);
      for (let i = 0; i < len; i++) unmasked[i] = payload[i] ^ mask[i & 3];
      payload = unmasked;
    }
    off = pos + maskLen + len;
    if (opcode === 0x8) { messages.push({ opcode: 0x8, payload }); return { messages, rest: buf.subarray(off), closed: true }; }
    if (opcode === 0x9) { messages.push({ opcode: 0x9, payload }); continue; }
    if (opcode === 0xa) continue; // pong
    messages.push({ opcode, payload, fin });
  }
  return { messages, rest: buf.subarray(off) };
}

// Reassemble fragmented messages; returns complete {opcode, payload} list.
function reassemble(frames) {
  const out = [];
  let fragOp = 0;
  let fragParts = [];
  for (const f of frames) {
    if (f.opcode === 0x0) { fragParts.push(f.payload); if (f.fin) { out.push({ opcode: fragOp, payload: Buffer.concat(fragParts) }); fragParts = []; } continue; }
    if (!f.fin) { fragOp = f.opcode; fragParts = [f.payload]; continue; }
    out.push({ opcode: f.opcode, payload: f.payload });
  }
  return out;
}

// --- viewer page ---

const VIEWER_HTML_PATH = path.join(__dirname, 'viewer.html');
let _viewerTemplate = null;
function viewerHtml(token, expiresAt) {
  if (!_viewerTemplate) _viewerTemplate = fs.readFileSync(VIEWER_HTML_PATH, 'utf8');
  return _viewerTemplate
    .replace('%%K%%', token)
    .replace('%%EXPIRES%%', String(expiresAt));
}

// --- main ---

(async () => {
  // 1. Browser setup.
  // Default: kill this repo's browser instance and relaunch fresh with a single
  // tab on the target URL — total isolation, only that view is exposed. Other
  // repos/agents have their own daemon+profile and are unaffected. Session
  // cookies persist in .browser-profile, so logins survive the restart.
  // --attach: skip all of this and share the running session as-is (all tabs
  // become switchable in the viewer).
  if (ATTACH) {
    debug('attach mode — sharing running session as-is');
  } else {
    debug('fresh instance: close --all, open <url>');
    ab(['close', '--all']);
    // close --all kills the daemon too — the first command after it races the
    // daemon restart (EOF from socket). Retry open until the daemon is back.
    const openArgs = ['open', url];
    if (HEADED) openArgs.push('--headed');
    let opened = false;
    for (let i = 0; i < 10 && !opened; i++) {
      opened = ab(openArgs).ok;
      if (!opened) sleepSync(1000);
    }
    if (!opened) throw new Error('browser open failed');

    // Remote viewport (VNC-like desktop view by default; --viewport overrides).
    const vp = VIEWPORT === 'desktop' ? null : VIEWPORT.match(/^(\d+)x(\d+)$/);
    if (vp) { ab(['set', 'viewport', vp[1], vp[2]]); viewportChanged = true; }
  }

  // Tracker blocklist (same origins as browser.js).
  const BLOCKED = ['doubleclick.net','google-analytics.com','googletagmanager.com','facebook.com',
    'connect.facebook.net','ads.linkedin.com','px.ads.linkedin.com','snap.licdn.com',
    'googleads.g.doubleclick.net','amazon-adsystem.com','criteo.com','taboola.com','outbrain.com',
    'scorecardresearch.com','quantserve.com','hotjar.com','mixpanel.com','segment.io','amplitude.com'];
  const routes = BLOCKED.map((o) => ['network', 'route', `*://*.${o}/*`, '--abort']);
  {
    const [bin, ...ba] = abBin();
    spawnSync(bin, [...ba, 'batch', '--json'], { env: env(), encoding: 'utf8', input: JSON.stringify(routes), timeout: 30000 });
  }

  // 2. Stream on a random port.
  const streamPort = await freePort();
  ab(['stream', 'disable']);
  const en = ab(['stream', 'enable', '--port', String(streamPort)]);
  if (!en.ok) throw new Error('stream enable failed');
  debug(`stream on ${streamPort}`);

  // 3. HTTP + WS server on a random port.
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + (TTL_SEC || 24 * 3600) * 1000;
  const html = viewerHtml(token, expiresAt);
  const clients = new Set();

  // Latest message per type — replayed to each new viewer so clients that
  // connect after upstream attach still get status/tabs/url/current frame.
  const latest = {};
  function connectUpstream() {
    // Push pacing (default): the stream server holds only the newest frame per
    // client, so our single upstream connection always has the latest frame.
    // Ack pacing is filtered out in the bridge — viewers' acks must never
    // reach the stream or it would stall waiting for them.
    upstream = new WebSocket(`ws://127.0.0.1:${streamPort}/?maxFps=8`);
    upstream.onopen = () => debug('upstream ws open');
    upstream.onmessage = (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8');
      try { const t = JSON.parse(data).type; if (t) latest[t] = data; } catch {}
      if (!connectUpstream._n) connectUpstream._n = 0;
      if (++connectUpstream._n % 50 === 1) debug(`upstream msgs: ${connectUpstream._n}`);
      const frame = encodeFrame(0x1, data);
      for (const c of clients) { try { c.write(frame); } catch {} }
    };
    upstream.onclose = () => {
      for (const c of clients) { try { c.end(); } catch {} } clients.clear();
      if (!cleaned) setTimeout(connectUpstream, 1500);
    };
    upstream.onerror = (e) => debug(`upstream ws error: ${e.message || e}`);
  }
  connectUpstream();

  server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/' && u.searchParams.get('k') === token) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html);
    } else {
      res.writeHead(404); res.end('not found');
    }
  });

  server.on('upgrade', (req, socket, head) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== '/ws' || u.searchParams.get('k') !== token) { socket.destroy(); return; }
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${wsAccept(key)}\r\n\r\n`);
    clients.add(socket);
    // Replay latest state so the viewer renders immediately.
    for (const t of ['status', 'tabs', 'url', 'frame']) {
      if (latest[t]) { try { socket.write(encodeFrame(0x1, latest[t])); } catch {} }
    }
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));

    let buf = Buffer.alloc(0);
    let fragOp = 0, fragParts = [];
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const { messages, rest, closed } = decodeFrames(buf);
      buf = rest;
      if (closed) { try { upstream.close(); } catch {} socket.end(); return; }
      for (const m of reassemble(messages)) {
        if (m.opcode === 0x9) { socket.write(encodeFrame(0xA, m.payload)); continue; }
        if (m.opcode === 0x1 || m.opcode === 0x2) {
          let text;
          try { text = m.payload.toString('utf8'); } catch { continue; }
          let msg;
          try { msg = JSON.parse(text); } catch { msg = null; }
          if (msg && msg.type === 'ack') continue; // never ack the stream
          if (msg && msg.type === '__tab' && msg.tab) {
            // Viewer tab switch — handled locally, never reaches the stream.
            debug(`tab switch -> ${msg.tab}: ${abSoft(['tab', String(msg.tab)])}`);
            continue;
          }
          if (msg && msg.type === 'config') {
            // Forward only maxFps; strip pacing so viewers can't stall upstream.
            text = JSON.stringify({ type: 'config', maxFps: Math.min(Math.max(parseInt(msg.maxFps, 10) || 8, 1), 30) });
          }
          try { upstream.send(text); } catch (e) { debug(`upstream send: ${e.message}`); }
        }
      }
    });
  });

  const listenHost = LAN ? '0.0.0.0' : '127.0.0.1';
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, listenHost, resolve);
  });
  const webPort = server.address().port;
  debug(`viewer on ${listenHost}:${webPort}`);

  // 4. Exposure: LAN direct or ephemeral cloudflared tunnel.
  let publicUrl;
  if (LAN) {
    const ip = (() => {
      for (const list of Object.values(os.networkInterfaces()))
        for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
      return 'localhost';
    })();
    publicUrl = `http://${ip}:${webPort}`;
    console.log(`\n[browser-share] LAN mode — no tunnel, no cloudflared needed`);
  } else {
    // cloudflared resolution: PATH first, then npx (downloads the binary on
    // first run). Works on any OS where Node+npm exist.
    const cfProbe = spawnSync('cloudflared', ['--version'], { encoding: 'utf8', timeout: 5000 });
    const useNpx = !!cfProbe.error;
    debug(`cloudflared via ${useNpx ? 'npx' : 'PATH'}`);
    const cfArgs = ['tunnel', '--url', `http://localhost:${webPort}`, '--no-autoupdate'];
    const spawnOpts = { stdio: ['ignore', 'pipe', 'pipe'] };
    if (useNpx) {
      if (process.platform === 'win32') {
        tunnel = spawn('cmd.exe', ['/d', '/s', '/c', 'npx', '-y', 'cloudflared', ...cfArgs], spawnOpts);
      } else {
        tunnel = spawn('npx', ['-y', 'cloudflared', ...cfArgs], spawnOpts);
      }
    } else {
      tunnel = spawn('cloudflared', cfArgs, spawnOpts);
    }
    publicUrl = await new Promise((resolve, reject) => {
      let out = '';
      const to = setTimeout(() => reject(new Error('cloudflared did not print a URL within 60s (first npx run downloads the binary)')), 60000);
      const onErr = (e) => { clearTimeout(to); reject(new Error(`cloudflared: ${e.message}`)); };
      const onData = (d) => {
        out += d.toString();
        debug(`cloudflared: ${d.toString().trim().slice(0, 200)}`);
        const m = out.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m) { clearTimeout(to); resolve(m[0]); }
      };
      tunnel.stdout.on('data', onData);
      tunnel.stderr.on('data', onData);
      tunnel.on('error', onErr);
      tunnel.on('exit', (c) => { clearTimeout(to); reject(new Error(`cloudflared exited (${c})`)); });
    });
  }

  const link = `${publicUrl}/?k=${token}`;
  console.log('\n🔐 Browser share ready');
  console.log(`   URL: ${url || '(attached session)'}`);
  console.log(`   Link (send to user): ${link}`);
  console.log(`   TTL: ${TTL_SEC === 0 ? 'infinite (explicit)' : TTL_SEC + 's'} — then exposure dies automatically. Browser stays open.`);
  console.log('   Press Ctrl+C to end early.\n');

  // 5. Hard TTL (0 = infinite, explicit opt-in only).
  if (TTL_SEC > 0) {
    setTimeout(() => {
      console.error(`[browser-share] TTL expired — tearing down`);
      cleanup(0);
    }, TTL_SEC * 1000);
  }
})().catch((e) => fail(e.message));
