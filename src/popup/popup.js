import { applyTranslations } from '../i18n/dom.js';
import { resolveLanguage, setLanguage, t } from '../i18n/index.js';
import { formatAccountId } from '../lib/account.js';
import { readableTextColor } from '../lib/color.js';
import { identityFromHost } from '../lib/identity.js';
import { matchProfile } from '../lib/match.js';
import { MSG } from '../lib/messages.js';
import { profileAccount, profileColor } from '../lib/profile.js';
import { createRecentStore, recentProfiles } from '../lib/recent.js';
import { createSessionStore, openUrlFor } from '../lib/sessions.js';
import { moveSelection, needsConfirmation, popupSections, resolveOpenTarget } from '../lib/search.js';
import { createStore } from '../lib/store.js';
import { getProvider } from '../providers/index.js';

const store = createStore();
const recentStore = createRecentStore();
const sessionStore = createSessionStore();
const $ = (id) => document.getElementById(id);

const ui = {
  search: $('search'),
  list: $('list'),
  current: $('current'),
  empty: $('empty'),
  noMatch: $('no-match'),
};

let profiles = [];
let settings = null;
let visible = [];
let selected = -1;
let currentProfileId = null;
let recentIds = [];
let confirmingId = null;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function metaLine(profile) {
  const account = profileAccount(profile);
  return [getProvider(profile.provider)?.short, account && formatAccountId(account), profile.group].filter(Boolean).join(' · ');
}

function renderRow(profile, index) {
  const color = profileColor(profile);
  const confirming = profile.id === confirmingId;
  const row = element('li', ['row', profile.guarded && 'guarded', confirming && 'confirming'].filter(Boolean).join(' '));
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', String(index === selected));
  row.dataset.index = String(index);
  if (profile.guarded) row.title = t('popup.guarded');

  const dot = element('span', 'dot');
  dot.style.background = color;
  const main = element('span', 'main');
  main.append(element('span', 'name', profile.name), element('span', 'meta', confirming ? t('popup.confirmOpen') : metaLine(profile)));
  row.append(dot, main);
  if (profile.tag) {
    const badge = element('span', 'badge', profile.tag);
    badge.style.background = color;
    badge.style.color = readableTextColor(color);
    row.append(badge);
  }
  if (profile.id === currentProfileId) row.append(element('span', 'here', t('popup.current')));
  return row;
}

function divider() {
  const node = element('li', 'divider');
  node.setAttribute('role', 'presentation');
  return node;
}

function render() {
  const recent = settings.showRecent ? recentProfiles(profiles, recentIds) : [];
  const sections = popupSections(profiles, { query: ui.search.value, recent });
  visible = sections.flatMap((section) => section.profiles);
  if (selected >= visible.length) selected = visible.length - 1;

  ui.list.replaceChildren();
  let index = 0;
  sections.forEach((section, position) => {
    if (section.recent) ui.list.append(element('li', 'group', t('popup.recent')));
    else if (section.group && sections.length > 1) ui.list.append(element('li', 'group', section.group));
    // Without a heading, ungrouped accounts would read as part of the section above them.
    else if (position > 0) ui.list.append(divider());
    for (const profile of section.profiles) ui.list.append(renderRow(profile, index++));
  });
  ui.empty.hidden = profiles.length > 0;
  ui.noMatch.hidden = profiles.length === 0 || visible.length > 0;
  ui.list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function openOptions(hash = '') {
  chrome.tabs.create({ url: chrome.runtime.getURL(`src/options/options.html${hash}`) });
  window.close();
}

function renderCurrent(identity) {
  if (!identity) return;
  const profile = profiles.find((p) => p.id === currentProfileId);
  const account = formatAccountId(identity.accounts[0]);
  ui.current.replaceChildren(`${t('popup.thisTab')}: `);
  if (profile) {
    ui.current.append(element('strong', '', profile.tag ? `${profile.tag} · ${profile.name}` : profile.name), ` (${account})`);
  } else {
    ui.current.append(element('strong', '', account), ` (${t('popup.notInList')}) `);
    const add = element('button', 'link-btn', t('popup.addThis'));
    add.type = 'button';
    add.title = t('popup.addThisTitle');
    add.addEventListener('click', () => openOptions(`#add=${encodeURIComponent(identity.accounts[0])}`));
    ui.current.append(add);
  }
  ui.current.hidden = false;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** Asks the tab's guard first; falls back to the multi-session host when no guard runs there. */
async function detectCurrent(tab) {
  if (!tab?.id) return null;
  try {
    const reply = await chrome.tabs.sendMessage(tab.id, { type: MSG.GET_IDENTITY });
    if (reply?.identity) return reply;
  } catch {
    // No content script in this tab (not an AWS console page).
  }
  const identity = tab.url ? identityFromHost(new URL(tab.url).hostname) : null;
  return identity ? { identity, profileId: matchProfile(profiles, identity)?.id ?? null } : null;
}

async function open(profile, invert) {
  if (needsConfirmation(profile, settings, confirmingId)) {
    confirmingId = profile.id;
    render();
    return;
  }
  // Before the tab opens: a new active tab closes the popup and would cut the write short.
  if (settings.showRecent) await recentStore.record(profile.id);
  const url = await openUrlFor(profile, sessionStore);
  if (resolveOpenTarget(settings.openIn, invert) === 'current-tab') await chrome.tabs.update({ url });
  else await chrome.tabs.create({ url });
  window.close();
}

const inverted = (event) => event.shiftKey || event.metaKey || event.ctrlKey || event.button === 1;

ui.search.addEventListener('input', () => {
  confirmingId = null;
  selected = ui.search.value.trim() ? 0 : -1;
  render();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    confirmingId = null;
    selected = moveSelection(selected, event.key === 'ArrowDown' ? 1 : -1, visible.length);
    render();
  } else if (event.key === 'Enter' && visible.length && !(event.target instanceof HTMLButtonElement)) {
    event.preventDefault();
    open(visible[Math.max(selected, 0)], inverted(event));
  } else if (event.key === 'Escape' && confirmingId) {
    event.preventDefault();
    confirmingId = null;
    render();
  } else if (event.key === 'Escape' && ui.search.value) {
    event.preventDefault();
    ui.search.value = '';
    selected = -1;
    render();
  }
});

const onRowClick = (event) => {
  const row = event.target.closest('.row');
  if (!row) return;
  selected = Number(row.dataset.index);
  open(visible[selected], inverted(event));
};
ui.list.addEventListener('click', onRowClick);
ui.list.addEventListener('auxclick', (event) => {
  if (event.button === 1) onRowClick(event);
});

$('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('add-first').addEventListener('click', () => chrome.runtime.openOptionsPage());

async function init() {
  [profiles, settings, recentIds] = await Promise.all([store.loadProfiles(), store.loadSettings(), recentStore.load()]);
  setLanguage(resolveLanguage(settings.language, chrome.i18n.getUILanguage()));
  applyTranslations(document);
  render();
  ui.search.focus();
  const current = await detectCurrent(await activeTab());
  if (current) {
    currentProfileId = current.profileId;
    renderCurrent(current.identity);
    render();
  }
}

init();
