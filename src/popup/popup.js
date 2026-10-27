import { formatAccountId } from '../lib/account.js';
import { readableTextColor } from '../lib/color.js';
import { getEnvironment } from '../lib/env.js';
import { identityFromHost } from '../lib/identity.js';
import { matchProfile } from '../lib/match.js';
import { MSG } from '../lib/messages.js';
import { buildProfileUrl, profileAccount, profileColor } from '../lib/profile.js';
import { filterProfiles, groupProfiles, moveSelection, resolveOpenTarget } from '../lib/search.js';
import { createStore } from '../lib/store.js';
import { getProvider } from '../providers/index.js';

const store = createStore();
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

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function metaLine(profile) {
  const env = getEnvironment(profile.env);
  const account = profileAccount(profile);
  return [env.label, getProvider(profile.provider)?.short, account && formatAccountId(account), profile.group]
    .filter(Boolean)
    .join(' · ');
}

function renderRow(profile, index) {
  const color = profileColor(profile);
  const env = getEnvironment(profile.env);
  const row = element('li', 'row');
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', String(index === selected));
  row.dataset.index = String(index);

  const dot = element('span', 'dot');
  dot.style.background = color;
  const main = element('span', 'main');
  main.append(element('span', 'name', profile.name), element('span', 'meta', metaLine(profile)));
  const badge = element('span', 'badge', env.short);
  badge.style.background = color;
  badge.style.color = readableTextColor(color);
  row.append(dot, main, badge);
  if (profile.id === currentProfileId) row.append(element('span', 'here', 'current'));
  return row;
}

function render() {
  const query = ui.search.value;
  // Grouped while browsing; a flat, ranked list while searching.
  const sections = query.trim() ? [{ group: '', profiles: filterProfiles(profiles, query) }] : groupProfiles(profiles);
  visible = sections.flatMap((section) => section.profiles);
  if (selected >= visible.length) selected = visible.length - 1;

  ui.list.replaceChildren();
  let index = 0;
  for (const section of sections) {
    if (section.group && sections.length > 1) ui.list.append(element('li', 'group', section.group));
    for (const profile of section.profiles) ui.list.append(renderRow(profile, index++));
  }
  ui.empty.hidden = profiles.length > 0;
  ui.noMatch.hidden = profiles.length === 0 || visible.length > 0;
  ui.list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function renderCurrent(identity) {
  if (!identity) return;
  const profile = profiles.find((p) => p.id === currentProfileId);
  const account = formatAccountId(identity.accounts[0]);
  ui.current.replaceChildren('This tab: ');
  if (profile) {
    ui.current.append(element('strong', '', `${getEnvironment(profile.env).short} · ${profile.name}`), ` (${account})`);
  } else {
    ui.current.append(element('strong', '', account), ' (not in your list)');
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
  const url = buildProfileUrl(profile);
  if (resolveOpenTarget(settings.openIn, invert) === 'current-tab') await chrome.tabs.update({ url });
  else await chrome.tabs.create({ url });
  window.close();
}

const inverted = (event) => event.shiftKey || event.metaKey || event.ctrlKey || event.button === 1;

ui.search.addEventListener('input', () => {
  selected = ui.search.value.trim() ? 0 : -1;
  render();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    selected = moveSelection(selected, event.key === 'ArrowDown' ? 1 : -1, visible.length);
    render();
  } else if (event.key === 'Enter' && visible.length) {
    event.preventDefault();
    open(visible[Math.max(selected, 0)], inverted(event));
  } else if (event.key === 'Escape' && ui.search.value) {
    event.preventDefault();
    ui.search.value = '';
    selected = -1;
    render();
  }
});

const onRowClick = (event) => {
  const row = event.target.closest('.row');
  if (row) open(visible[Number(row.dataset.index)], inverted(event));
};
ui.list.addEventListener('click', onRowClick);
ui.list.addEventListener('auxclick', (event) => {
  if (event.button === 1) onRowClick(event);
});

for (const id of ['open-options', 'add-first']) {
  $(id).addEventListener('click', () => chrome.runtime.openOptionsPage());
}

async function init() {
  [profiles, settings] = await Promise.all([store.loadProfiles(), store.loadSettings()]);
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
