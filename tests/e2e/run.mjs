#!/usr/bin/env node
// Loads the unpacked extension into Chrome for Testing (branded Chrome ignores --load-extension), routes
// every host to a local HTTPS server that plays the AWS console and the sign-in pages, and drives the
// options page, the popup and the guard over the DevTools protocol. Needs Node 22+, openssl and network
// access the first time, to download Chrome for Testing. CHROME_BIN skips the download.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:https';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const CACHE = join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'aws-hop-e2e');

const AWS_CONFIG = `
[profile shop-prod]
aws_account_id = 111122223333

[profile shop-dev]
role_arn = arn:aws:iam::444455556666:role/Developer

[profile data-sso]
sso_start_url = https://example.awsapps.com/start
sso_account_id = 777788889999
sso_role_name = ReadOnly
env = test
`;

let failures = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name}\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
}

/* ---------- environment ---------- */

function chromeBinary() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const out = execFileSync('npx', ['--yes', '@puppeteer/browsers', 'install', 'chrome@stable', '--path', CACHE], { encoding: 'utf8' });
  const match = /^chrome@\S+ (.+)$/m.exec(out);
  if (!match) throw new Error(`Could not find the Chrome for Testing path in:\n${out}`);
  return match[1].trim();
}

function certificate(dir) {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=aws-hop-e2e',
    '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
  return { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) };
}

/** `?nav=<json>&delay=<ms>` defines ConsoleNavService late, `?dom=<id>` renders the header copy button. */
function consolePage(params) {
  const nav = params.get('nav');
  const dom = params.get('dom');
  const delay = Number(params.get('delay') ?? 0);
  return `<!DOCTYPE html><html><head><title>Console Home</title></head><body>
<header>${dom ? `<span>${dom}</span><button data-testid="awsc-copy-accountid">Copy</button>` : ''}</header>
<main>Mock console</main>
<script>${nav ? `setTimeout(() => { window.ConsoleNavService = { AccountInfo: ${nav} }; }, ${delay});` : ''}</script>
</body></html>`;
}

function startServer(tls) {
  const server = createServer(tls, (req, res) => {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    if (host.endsWith('.console.aws.amazon.com')) res.end(consolePage(new URL(req.url, 'https://local').searchParams));
    else res.end('<!DOCTYPE html><title>captured</title>');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function launchChrome(binary, profileDir, port) {
  const args = [
    '--headless=new', `--user-data-dir=${profileDir}`, '--remote-debugging-port=0',
    `--load-extension=${ROOT}`, `--disable-extensions-except=${ROOT}`,
    `--host-resolver-rules=MAP * 127.0.0.1:${port}, EXCLUDE localhost`, '--ignore-certificate-errors',
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  ];
  // GitHub's Ubuntu runners restrict the user namespaces Chrome's sandbox needs.
  if (process.env.CI) args.push('--no-sandbox');
  const chrome = spawn(binary, [...args, 'about:blank'], { stdio: 'ignore' });
  const portFile = join(profileDir, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i += 1) await sleep(100);
  const [debugPort, path] = readFileSync(portFile, 'utf8').trim().split('\n');
  return { chrome, url: `ws://127.0.0.1:${debugPort}${path}` };
}

/* ---------- DevTools protocol ---------- */

class Cdp {
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    return new Cdp(ws);
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.problems = [];
    ws.addEventListener('message', (event) => this.onMessage(JSON.parse(event.data)));
  }

  onMessage(message) {
    if (message.id) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      this.problems.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    } else if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
      const text = message.params.args.map((arg) => arg.value ?? arg.description).join(' ');
      // The popup calls window.close(), which a page opened as a plain tab may not do.
      if (!text.includes('Scripts may close only the windows')) this.problems.push(text);
    }
  }

  send(method, params = {}, sessionId = undefined) {
    const id = (this.nextId += 1);
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async open(url) {
    const { targetId } = await this.send('Target.createTarget', { url });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    await this.send('Runtime.enable', {}, sessionId);
    const page = {
      targetId,
      eval: async (expression) => {
        const { result, exceptionDetails } = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
        if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
        return result.value;
      },
      close: () => this.send('Target.closeTarget', { targetId }),
    };
    const prefix = url.split('#')[0];
    let seen = null;
    await waitFor(async () => {
      seen = await page.eval('({ href: location.href, ready: document.readyState })');
      return seen.href.startsWith(prefix) && seen.ready === 'complete';
    }, `load ${url}`).catch((error) => {
      throw new Error(`${error.message}; the tab is at ${JSON.stringify(seen)}`);
    });
    return page;
  }

  async pageUrls() {
    const { targetInfos } = await this.send('Target.getTargets');
    return targetInfos.filter((target) => target.type === 'page').map((target) => target.url);
  }
}

/** Polls until `fn` returns something truthy; evaluation errors during navigation count as "not yet". */
async function waitFor(fn, what, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

/* ---------- scenarios ---------- */

const GUARD = `(() => {
  const root = document.querySelector('aws-hop-guard')?.shadowRoot;
  if (!root) return null;
  return {
    label: root.querySelector('.label').textContent,
    frame: !root.querySelector('.frame').hidden,
    tooltip: root.querySelector('.pill').title,
    title: document.title,
  };
})()`;

async function guardOn(cdp, url, expectedLabel) {
  const page = await cdp.open(url);
  const guard = await waitFor(async () => {
    const state = await page.eval(GUARD);
    return state && (!expectedLabel || state.label === expectedLabel) ? state : null;
  }, `guard "${expectedLabel}" on ${url}`).catch(async (error) => {
    console.log(`  ✗ ${error.message}`);
    failures += 1;
    return page.eval(GUARD);
  });
  return { page, guard };
}

async function importAccounts(options) {
  return options.eval(`(async () => {
    document.getElementById('import-text').value = ${JSON.stringify(AWS_CONFIG)};
    document.getElementById('import-merge').click();
    const box = document.getElementById('import-result');
    for (let i = 0; i < 50 && box.hidden; i += 1) await new Promise((r) => setTimeout(r, 100));
    return {
      result: box.textContent,
      rows: [...document.querySelectorAll('.profile .name')].map((n) => n.textContent),
    };
  })()`);
}

/** Opens the popup fresh each time: after opening an account it closes itself, as the real popup does. */
async function popupOpens(cdp, base, query, expectedUrl) {
  const popup = await cdp.open(`${base}/popup/popup.html`);
  await waitFor(() => popup.eval(`document.querySelectorAll('.row').length || null`), 'popup rows');
  await popup.eval(`(() => {
    const search = document.getElementById('search');
    search.value = ${JSON.stringify(query)};
    search.dispatchEvent(new Event('input'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  })()`);
  const opened = await waitFor(async () => (await cdp.pageUrls()).find((url) => url === expectedUrl), `a tab at ${expectedUrl}`)
    .catch(async () => (await cdp.pageUrls()).join(' | '));
  check(`popup "${query}" + Enter opens ${expectedUrl}`, opened, expectedUrl);
}

/**
 * Asks Chrome which ID it gave the unpacked extension, which also waits until it has finished loading.
 * Opening chrome-extension:// URLs any earlier lands on an error page on a slow first start (CI).
 */
async function loadedExtension(cdp) {
  const page = await cdp.open('chrome://extensions/');
  const info = await waitFor(
    () => page.eval(`chrome.developerPrivate.getExtensionsInfo().then((list) => list.find((e) => e.name === 'AWS Hop') ?? null)`),
    'AWS Hop to appear in chrome://extensions',
    30000,
  );
  await page.close();
  return info;
}

async function run(cdp) {
  console.log('Extension');
  const extension = await loadedExtension(cdp);
  check('Chrome loads it with no manifest errors or install warnings', {
    state: extension.state,
    manifestErrors: extension.manifestErrors.map((e) => e.message),
    installWarnings: extension.installWarnings,
  }, { state: 'ENABLED', manifestErrors: [], installWarnings: [] });
  const base = `chrome-extension://${extension.id}/src`;

  console.log('Options page');
  const options = await cdp.open(`${base}/options/options.html`);
  check('loads as the extension page', await options.eval('document.title'), 'AWS Hop settings');
  const imported = await importAccounts(options);
  check('imports ~/.aws/config through the UI', imported, { result: 'Added 3, updated 0.', rows: ['shop-prod', 'shop-dev', 'data-sso'] });
  const stored = await options.eval(`chrome.storage.sync.get(null).then((items) => Object.keys(items).filter((k) => k.startsWith('profile:')).length)`);
  check('writes one sync item per account', stored, 3);

  console.log('Guard');
  const nav = encodeURIComponent(JSON.stringify({ loginDisplayNameAccount: '1111-2222-3333', loginDisplayNameUser: 'jane' }));
  const prod = await guardOn(cdp, `https://us-east-1.console.aws.amazon.com/console/home?nav=${nav}&delay=800`, 'PROD · shop-prod');
  check('reads ConsoleNavService from the main world, late', prod.guard, {
    label: 'PROD · shop-prod',
    frame: true,
    tooltip: 'AWS Hop: PROD · shop-prod (1111-2222-3333), detected from the console navigation. Click to minimize.',
    title: '[PROD] Console Home',
  });
  check('the bridge wrote only the account fields', await prod.page.eval(`document.documentElement.getAttribute('data-aws-hop-nav')`),
    JSON.stringify({ loginDisplayNameAccount: '1111-2222-3333', loginDisplayNameUser: 'jane' }));

  const dom = await guardOn(cdp, 'https://eu-west-1.console.aws.amazon.com/ec2/home?dom=4444-5555-6666', 'DEV · shop-dev');
  check('falls back to the page header', [dom.guard?.label, dom.guard?.frame, dom.guard?.title, dom.guard?.tooltip.includes('page header')],
    ['DEV · shop-dev', false, 'Console Home', true]);

  const host = await guardOn(cdp, 'https://777788889999-abcd1234.us-east-1.console.aws.amazon.com/console/home', 'TEST · data-sso');
  check('falls back to the multi-session host', [host.guard?.label, host.guard?.tooltip.includes('multi-session URL')], ['TEST · data-sso', true]);

  const unknown = await guardOn(cdp, 'https://999999999999-zzzz9999.us-east-1.console.aws.amazon.com/', 'Unregistered account');
  check('marks an unregistered account', unknown.guard?.label, 'Unregistered account');

  console.log('Messaging and live settings');
  const replies = await options.eval(`(async () => {
    const tabs = await chrome.tabs.query({});
    const replies = [];
    for (const tab of tabs) {
      try {
        const reply = await chrome.tabs.sendMessage(tab.id, { type: 'aws-hop:get-identity' });
        if (reply) replies.push(reply.identity.accounts[0] + ':' + reply.identity.source + ':' + (reply.profileId ? 'matched' : 'none'));
      } catch { /* not a console tab */ }
    }
    return replies.sort();
  })()`);
  check('every console tab answers GET_IDENTITY', replies, [
    '111122223333:nav:matched', '444455556666:dom:matched', '777788889999:host:matched', '999999999999:host:none',
  ]);

  await options.eval(`document.getElementById('setting-guardEnabled').click()`);
  const hidden = await waitFor(async () => {
    const [guard, title] = await prod.page.eval(`[!!document.querySelector('aws-hop-guard'), document.title]`);
    return !guard ? title : null;
  }, 'the guard to disappear').catch((error) => error.message);
  check('turning the guard off removes it and the title prefix in open tabs', hidden, 'Console Home');
  await options.eval(`document.getElementById('setting-guardEnabled').click()`);
  const back = await waitFor(() => prod.page.eval(GUARD), 'the guard to come back').catch(() => null);
  check('turning it back on restores it', back?.title, '[PROD] Console Home');

  console.log('Popup');
  const popup = await cdp.open(`${base}/popup/popup.html`);
  check('lists every account', await waitFor(() => popup.eval(`document.querySelectorAll('.row').length || null`), 'popup rows'), 3);
  await popupOpens(cdp, base, 'shop-dev', 'https://signin.aws.amazon.com/switchrole?account=444455556666&roleName=Developer&displayName=shop-dev&color=1d8102');
  check('closes itself after opening an account', (await cdp.pageUrls()).filter((url) => url.endsWith('/popup/popup.html')).length, 1);
  await popupOpens(cdp, base, 'data', 'https://example.awsapps.com/start/#/console?account_id=777788889999&role_name=ReadOnly');
  await popupOpens(cdp, base, 'shop-prod', 'https://111122223333.signin.aws.amazon.com/console');

  console.log('Errors');
  check('no page exceptions, console errors or guard start-up warnings', cdp.problems, []);
}

/* ---------- main ---------- */

const work = mkdtempSync(join(tmpdir(), 'aws-hop-e2e-'));
let chrome;
let server;
try {
  const binary = chromeBinary();
  server = await startServer(certificate(work));
  const launched = await launchChrome(binary, join(work, 'profile'), server.address().port);
  chrome = launched.chrome;
  const cdp = await Cdp.connect(launched.url);
  await run(cdp);
  cdp.ws.close();
} catch (error) {
  failures += 1;
  console.error(`\n${error.stack ?? error}`);
} finally {
  chrome?.kill();
  server?.close();
  await sleep(300);
  rmSync(work, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll end-to-end checks passed');
process.exit(failures ? 1 : 0);
