#!/usr/bin/env node
// Loads the unpacked extension into Chrome for Testing (branded Chrome ignores --load-extension), routes
// every host to a local HTTPS server that plays the AWS console and the sign-in pages, and drives the
// options page, the popup and the guard over the DevTools protocol. Needs Node 22+, openssl and network
// access the first time, to download Chrome for Testing. AWS_HOP_E2E_CHROME skips the download; not
// CHROME_BIN, which GitHub's Ubuntu runners point at branded Chrome.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:https';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { colorFor } from '../../src/lib/tag.js';

const ROOT = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const CACHE = join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'aws-hop-e2e');

const AWS_CONFIG = `
[profile shop-prod]
aws_account_id = 111122223333
tag = prod

[profile terraform-shop-prod]
aws_account_id = 1111-2222-3333

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
  if (process.env.AWS_HOP_E2E_CHROME) return process.env.AWS_HOP_E2E_CHROME;
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

async function importAccounts(options, config) {
  return options.eval(`(async () => {
    const box = document.getElementById('import-result');
    box.hidden = true;
    document.getElementById('import-text').value = ${JSON.stringify(config)};
    document.getElementById('import-merge').click();
    for (let i = 0; i < 50 && box.hidden; i += 1) await new Promise((r) => setTimeout(r, 100));
    return {
      result: box.firstChild.textContent,
      skipped: [...box.querySelectorAll('li')].map((li) => li.textContent),
      rows: [...document.querySelectorAll('.profile .name')].map((n) => n.textContent),
    };
  })()`);
}

/** Changes a select on the options page the way a user would, firing its change event. */
const choose = (options, id, value) => options.eval(`(() => {
  const select = document.getElementById(${JSON.stringify(id)});
  select.value = ${JSON.stringify(value)};
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()`);

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
  const uiLanguage = await options.eval('chrome.i18n.getUILanguage()');
  const autoTitle = uiLanguage.toLowerCase().startsWith('ko') ? 'AWS Hop 설정' : 'AWS Hop settings';
  check(`follows the browser language (${uiLanguage}) by default`, await waitFor(() => options.eval('document.title === ' + JSON.stringify(autoTitle) + ' && document.title'), 'the translated title').catch(() => null), autoTitle);
  await choose(options, 'setting-language', 'en');
  check('switches to English from the settings', await waitFor(() => options.eval(`document.title === 'AWS Hop settings' && document.title`), 'English').catch(() => null), 'AWS Hop settings');
  check('opens the CLI helper while the list is empty', await options.eval(`document.getElementById('cli-helper').open && document.getElementById('cli-command').textContent.startsWith('for p in $(aws configure list-profiles)')`), true);
  const platform = await options.eval('chrome.runtime.getPlatformInfo().then((info) => info.os)');
  check(`picks the command for this platform (${platform})`, await options.eval(`document.querySelector('#cli-shells [aria-pressed="true"]').dataset.shell`), { mac: 'macos', win: 'windows' }[platform] ?? 'linux');
  await options.eval(`document.querySelector('#cli-shells [data-shell="windows"]').click()`);
  check('switches the command to PowerShell', await options.eval(`[document.getElementById('cli-helper-step1').textContent, document.getElementById('cli-command').textContent.split('\\n').at(-1)]`), [
    'Copy the command below and run it in PowerShell.',
    '} | Set-Clipboard',
  ]);

  const imported = await importAccounts(options, AWS_CONFIG);
  check('imports ~/.aws/config once per account', imported, {
    result: 'Added 3, updated 0, 0 already in the list.',
    skipped: ['terraform-shop-prod: signs in to the same place as shop-prod, which is imported instead'],
    rows: ['shop-prod', 'shop-dev', 'data-sso'],
  });
  const again = await importAccounts(options, AWS_CONFIG);
  check('importing the same config again updates in place', [again.result, again.rows.length], ['Added 0, updated 3, 0 already in the list.', 3]);
  const copy = await importAccounts(options, '[profile shop-prod-copy]\naws_account_id = 111122223333');
  check('a profile for an account already in the list is not added', [copy.result, copy.skipped, copy.rows.length], [
    'Added 0, updated 0, 1 already in the list.', ['shop-prod-copy: already in your list as shop-prod'], 3,
  ]);
  const stored = await options.eval(`chrome.storage.sync.get(null).then((items) => Object.values(items).filter((v) => v && v.fields).map((p) => [p.name, p.tag, p.guarded]))`);
  check('stores tags and protects production by name', stored.sort(), [['data-sso', 'test', false], ['shop-dev', '', false], ['shop-prod', 'prod', true]]);

  console.log('Guard');
  const nav = encodeURIComponent(JSON.stringify({ loginDisplayNameAccount: '1111-2222-3333', loginDisplayNameUser: 'jane' }));
  const prod = await guardOn(cdp, `https://us-east-1.console.aws.amazon.com/console/home?nav=${nav}&delay=800`, 'prod · shop-prod');
  check('reads ConsoleNavService from the main world, late', prod.guard, {
    label: 'prod · shop-prod',
    frame: true,
    tooltip: 'AWS Hop: prod · shop-prod (1111-2222-3333), detected from the console navigation. Click to minimize.',
    title: '[shop-prod] Console Home',
  });
  check('the bridge wrote only the account fields', await prod.page.eval(`document.documentElement.getAttribute('data-aws-hop-nav')`),
    JSON.stringify({ loginDisplayNameAccount: '1111-2222-3333', loginDisplayNameUser: 'jane' }));

  const dom = await guardOn(cdp, 'https://eu-west-1.console.aws.amazon.com/ec2/home?dom=4444-5555-6666', 'shop-dev');
  check('falls back to the page header', [dom.guard?.label, dom.guard?.frame, dom.guard?.title, dom.guard?.tooltip.includes('page header')],
    ['shop-dev', false, 'Console Home', true]);

  const host = await guardOn(cdp, 'https://777788889999-abcd1234.us-east-1.console.aws.amazon.com/console/home', 'test · data-sso');
  check('falls back to the multi-session host', [host.guard?.label, host.guard?.tooltip.includes('multi-session URL')], ['test · data-sso', true]);

  const unknown = await guardOn(cdp, 'https://999999999999-zzzz9999.us-east-1.console.aws.amazon.com/', 'Account not in your list');
  check('marks an account that is not in the list', unknown.guard?.label, 'Account not in your list');

  console.log('Messaging and live changes');
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

  await options.eval(`(() => {
    const input = document.querySelector('.profile:nth-child(2) [data-action="tag"]');
    input.value = 'qa';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const retagged = await waitFor(async () => ((await dom.page.eval(GUARD))?.label === 'qa · shop-dev' ? 'qa · shop-dev' : null), 'the new tag').catch(() => null);
  check('a tag typed into the list shows up in the open console tab', retagged, 'qa · shop-dev');

  await options.eval(`document.querySelector('.profile:nth-child(2) [data-action="guarded"]').click()`);
  const guardedNow = await waitFor(async () => {
    const state = await dom.page.eval(GUARD);
    return state?.frame ? state : null;
  }, 'the frame').catch(() => null);
  check('protecting an account from the list frames its console tab', [guardedNow?.frame, guardedNow?.title], [true, '[shop-dev] Console Home']);

  await options.eval(`document.getElementById('setting-guardEnabled').click()`);
  const hidden = await waitFor(async () => {
    const [guard, title] = await prod.page.eval(`[!!document.querySelector('aws-hop-guard'), document.title]`);
    return !guard ? title : null;
  }, 'the guard to disappear').catch((error) => error.message);
  check('turning the guard off removes it and the title prefix in open tabs', hidden, 'Console Home');
  await options.eval(`document.getElementById('setting-guardEnabled').click()`);
  const back = await waitFor(() => prod.page.eval(GUARD), 'the guard to come back').catch(() => null);
  check('turning it back on restores it', back?.title, '[shop-prod] Console Home');

  console.log('Add this account');
  const deepLink = await cdp.open(`${base}/options/options.html#add=999999999999`);
  const prefilled = await waitFor(() => deepLink.eval(`document.getElementById('editor').open && ({
    provider: document.querySelector('[name="provider"]').value,
    account: document.querySelector('[name="field:account"]').value,
    hash: location.hash,
  })`), 'the prefilled editor').catch(() => null);
  check('the popup\'s add link opens the editor with the account filled in', prefilled, { provider: 'iam-user', account: '999999999999', hash: '' });
  await deepLink.close();

  console.log('Popup');
  const popup = await cdp.open(`${base}/popup/popup.html`);
  check('lists every account', await waitFor(() => popup.eval(`document.querySelectorAll('.row').length || null`), 'popup rows'), 3);
  check('marks protected accounts', await popup.eval(`[...document.querySelectorAll('.row.guarded .name')].map((n) => n.textContent).sort()`), ['shop-dev', 'shop-prod']);
  const devColor = colorFor('shop').slice(1);
  await popupOpens(cdp, base, 'shop-dev', `https://signin.aws.amazon.com/switchrole?account=444455556666&roleName=Developer&displayName=shop-dev&color=${devColor}`);
  check('closes itself after opening an account', (await cdp.pageUrls()).filter((url) => url.endsWith('/popup/popup.html')).length, 1);
  await popupOpens(cdp, base, 'data', 'https://example.awsapps.com/start/#/console?account_id=777788889999&role_name=ReadOnly');
  await popupOpens(cdp, base, 'shop-prod', 'https://111122223333.signin.aws.amazon.com/console');

  console.log('Korean');
  await choose(options, 'setting-language', 'ko');
  check('the options page switches without a reload', await waitFor(() => options.eval(`document.querySelector('[data-i18n="options.accounts"]').textContent === '계정' && document.title`), 'Korean options').catch(() => null), 'AWS Hop 설정');
  const koGuard = await waitFor(async () => ((await unknown.page.eval(GUARD))?.label === '목록에 없는 계정' ? unknown.page.eval(GUARD) : null), 'the Korean guard').catch(() => null);
  check('open console tabs switch too', koGuard?.tooltip, 'AWS Hop: 목록에 없는 계정 (9999-9999-9999). 멀티 세션 URL에서 감지했습니다. 클릭하면 접힙니다.');
  const koPopup = await cdp.open(`${base}/popup/popup.html`);
  check('the popup opens in Korean', await waitFor(() => koPopup.eval(`document.getElementById('search').placeholder === '계정 검색' && document.documentElement.lang`), 'Korean popup').catch(() => null), 'ko');

  console.log('Errors');
  check('no page exceptions, console errors or guard start-up warnings', cdp.problems, []);
}

/* ---------- main ---------- */

const work = mkdtempSync(join(tmpdir(), 'aws-hop-e2e-'));
let chrome;
let server;
try {
  const binary = chromeBinary();
  console.log(`Browser: ${binary}`);
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
