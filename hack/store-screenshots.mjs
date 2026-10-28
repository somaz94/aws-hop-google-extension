#!/usr/bin/env node
// Regenerates the Chrome Web Store screenshots in store/screenshots/<language>/: loads the extension into
// Chrome for Testing with example accounts, captures the popup and two options panels in each language,
// and lays them out with hack/store-slide.html at 1280x800. Uses the same Chrome as `make e2e`.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'aws-hop-e2e');
const LANGUAGES = ['en', 'ko'];
const SLIDES = 4;

// The accounts shown in every screenshot; all IDs are documentation-style placeholders.
const ACCOUNTS = [
  { id: 'a1', name: 'shop-prod', provider: 'switch-role', group: 'shop', tag: 'prod', guarded: true, fields: { account: '111122223333', roleName: 'Admin' } },
  { id: 'a2', name: 'shop-staging', provider: 'switch-role', group: 'shop', tag: 'staging', fields: { account: '444455556666', roleName: 'Admin' } },
  { id: 'a3', name: 'shop-dev', provider: 'switch-role', group: 'shop', tag: 'dev', fields: { account: '777788889999', roleName: 'Developer' } },
  { id: 'a4', name: 'data-prod', provider: 'sso', group: 'data', tag: 'prod', guarded: true, fields: { startUrl: 'https://example.awsapps.com/start', accountId: '123456789012', roleName: 'ReadOnly' } },
  { id: 'a5', name: 'data-sandbox', provider: 'sso', group: 'data', tag: 'sandbox', fields: { startUrl: 'https://example.awsapps.com/start', accountId: '012345678901', roleName: 'PowerUser' } },
  { id: 'a6', name: 'billing', provider: 'iam-user', group: 'management', tag: 'finance', fields: { account: '222222222222' } },
  { id: 'a7', name: 'audit', provider: 'custom-url', group: 'management', tag: 'security', fields: { url: 'https://idp.example.com/app/aws/sso', accountId: '333333333333' } },
];

function chromeBinary() {
  if (process.env.AWS_HOP_E2E_CHROME) return process.env.AWS_HOP_E2E_CHROME;
  const out = execFileSync('npx', ['--yes', '@puppeteer/browsers', 'install', 'chrome@stable', '--path', CACHE], { encoding: 'utf8' });
  return /^chrome@\S+ (.+)$/m.exec(out)[1].trim();
}

const SEND_TIMEOUT = 20000;
const work = mkdtempSync(join(tmpdir(), 'aws-hop-store-'));
const chrome = spawn(chromeBinary(), [
  '--headless=new', `--user-data-dir=${join(work, 'profile')}`, '--remote-debugging-port=0',
  `--load-extension=${ROOT}`, `--disable-extensions-except=${ROOT}`, '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', '--use-mock-keychain', '--password-store=basic', '--hide-scrollbars', '--allow-file-access-from-files', 'about:blank',
], { stdio: 'ignore' });

try {
  const portFile = join(work, 'profile', 'DevToolsActivePort');
  const readPort = () => (existsSync(portFile) ? readFileSync(portFile, 'utf8').trim().split('\n') : []);
  for (let i = 0; i < 100 && readPort().length < 2; i += 1) await sleep(100);
  const [port, path] = readPort();
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const call = message.id && pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    clearTimeout(call.timer);
    if (message.error) call.reject(new Error(message.error.message));
    else call.resolve(message.result);
  });
  // A Chrome that stops answering fails the run instead of hanging it; the slowest call takes a few seconds.
  const send = (method, params = {}, sessionId = undefined) => new Promise((resolve, reject) => {
    nextId += 1;
    const id = nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method}: no answer in ${SEND_TIMEOUT} ms`));
    }, SEND_TIMEOUT);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

  async function open(url, width, height, scale) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false }, sessionId);
    await send('Page.navigate', { url }, sessionId);
    const evaluate = async (expression) => {
      const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result.value;
    };
    for (let i = 0; i < 100; i += 1) {
      try {
        if (await evaluate('document.readyState === "complete"')) break;
      } catch {
        // Still navigating.
      }
      await sleep(100);
    }
    const shoot = async (file, selector = null) => {
      const clip = selector
        ? await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height, scale: 1 }; })()`)
        : { x: 0, y: 0, width, height, scale: 1 };
      const { data } = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true }, sessionId);
      writeFileSync(file, Buffer.from(data, 'base64'));
    };
    return { evaluate, shoot, close: () => send('Target.closeTarget', { targetId }) };
  }

  // An unpacked extension's id is the SHA-256 of its path, hex digits mapped onto a-p.
  const id = [...createHash('sha256').update(ROOT).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
  const origin = `chrome-extension://${id}`;
  await sleep(1000);

  for (const language of LANGUAGES) {
    const dir = join(work, language);
    mkdirSync(dir);
    const options = await open(`${origin}/src/options/options.html`, 740, 900, 2);
    await options.evaluate(`(async () => {
      const { createStore, DEFAULT_SETTINGS } = await import('/src/lib/store.js');
      const { normalizeProfile } = await import('/src/lib/profile.js');
      const store = createStore();
      await store.replaceAll(${JSON.stringify(ACCOUNTS)}.map((profile) => normalizeProfile(profile)));
      await store.saveSettings({ ...DEFAULT_SETTINGS, language: ${JSON.stringify(language)} });
    })()`);
    await options.evaluate('location.reload()');
    await sleep(1500);
    await options.shoot(join(dir, 'accounts.png'), 'section:has(#profile-list)');
    await options.evaluate(`document.getElementById('cli-helper').open = true`);
    await sleep(300);
    await options.shoot(join(dir, 'cli.png'), '#cli-helper');
    await options.close();

    const popup = await open(`${origin}/src/popup/popup.html`, 360, 700, 2);
    await sleep(1200);
    await popup.evaluate(`document.getElementById('search').focus()`);
    await popup.shoot(join(dir, 'popup.png'), 'body');
    await popup.close();

    copyFileSync(join(ROOT, 'hack', 'store-slide.html'), join(dir, 'slide.html'));
    const out = join(ROOT, 'store', 'screenshots', language);
    mkdirSync(out, { recursive: true });
    for (let n = 0; n < SLIDES; n += 1) {
      const slide = await open(`file://${join(dir, 'slide.html')}?lang=${language}&n=${n}`, 1280, 800, 1);
      await sleep(500);
      await slide.shoot(join(out, `${n + 1}.png`));
      await slide.close();
    }
    console.log(`store/screenshots/${language}: ${SLIDES} screenshots`);
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(work, { recursive: true, force: true });
}
