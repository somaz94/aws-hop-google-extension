import { formatAccountId } from '../lib/account.js';
import { ENVIRONMENTS, getEnvironment, inferEnv } from '../lib/env.js';
import { buildProfileUrl, normalizeProfile, profileAccount, profileColor, validateProfile } from '../lib/profile.js';
import { createStore } from '../lib/store.js';
import { exportProfiles } from '../importers/json.js';
import { importProfiles, mergeProfiles } from '../importers/index.js';
import { getProvider, listProviders } from '../providers/index.js';

const store = createStore();
const $ = (id) => document.getElementById(id);

const editor = $('editor');
const form = $('editor-form');
const providerFields = $('provider-fields');

let profiles = [];
let editingId = null;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function option(value, label) {
  const node = element('option', '', label);
  node.value = value;
  return node;
}

/* ---------- account list ---------- */

function metaLine(profile) {
  const account = profileAccount(profile);
  return [getEnvironment(profile.env).label, getProvider(profile.provider)?.label, account && formatAccountId(account), profile.group]
    .filter(Boolean)
    .join(' · ');
}

function toolButton(label, action, disabled = false) {
  const button = element('button', '', label);
  button.type = 'button';
  button.dataset.action = action;
  button.disabled = disabled;
  return button;
}

function renderList() {
  const list = $('profile-list');
  list.replaceChildren();
  profiles.forEach((profile, index) => {
    const row = element('li', 'profile');
    row.dataset.id = profile.id;
    const dot = element('span', 'dot');
    dot.style.background = profileColor(profile);
    const main = element('div', 'main');
    main.append(element('div', 'name', profile.name), element('div', 'meta', metaLine(profile)));
    const tools = element('div', 'tools');
    tools.append(
      toolButton('↑', 'up', index === 0),
      toolButton('↓', 'down', index === profiles.length - 1),
      toolButton('Edit', 'edit'),
      toolButton('Duplicate', 'duplicate'),
      toolButton('Delete', 'delete'),
    );
    row.append(dot, main, tools);
    list.append(row);
  });
  $('no-profiles').hidden = profiles.length > 0;
}

async function reload() {
  profiles = await store.loadProfiles();
  renderList();
}

async function move(index, delta) {
  const ids = profiles.map((profile) => profile.id);
  const [id] = ids.splice(index, 1);
  ids.splice(index + delta, 0, id);
  await store.reorder(ids);
  await reload();
}

$('profile-list').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.closest('.profile').dataset.id;
  const index = profiles.findIndex((profile) => profile.id === id);
  const profile = profiles[index];
  switch (button.dataset.action) {
    case 'up': return move(index, -1);
    case 'down': return move(index, 1);
    case 'edit': return openEditor(profile);
    case 'duplicate': return openEditor({ ...profile, id: null, name: `${profile.name} copy` });
    case 'delete':
      if (confirm(`Delete "${profile.name}"?`)) {
        await store.deleteProfile(id);
        await reload();
      }
      return undefined;
    default: return undefined;
  }
});

/* ---------- editor ---------- */

function renderProviderFields(provider, values = {}) {
  providerFields.replaceChildren();
  $('provider-help').textContent = provider.description;
  for (const field of provider.fields) {
    const label = element('label', 'field');
    const input = element('input');
    input.name = `field:${field.key}`;
    input.type = field.type ?? 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = field.placeholder ?? '';
    input.value = values[field.key] ?? '';
    label.append(element('span', '', field.required ? field.label : `${field.label} (optional)`), input);
    if (field.help) label.append(element('small', 'muted', field.help));
    const error = element('small', 'error');
    error.dataset.errorFor = field.key;
    label.append(error);
    providerFields.append(label);
  }
}

function readForm() {
  const data = new FormData(form);
  const fields = {};
  for (const [key, value] of data) {
    if (key.startsWith('field:')) fields[key.slice('field:'.length)] = value;
  }
  return normalizeProfile({
    id: editingId,
    name: data.get('name'),
    provider: data.get('provider'),
    env: data.get('env'),
    color: form.elements.useEnvColor.checked ? null : data.get('color'),
    group: data.get('group'),
    fields,
  });
}

function showErrors(errors) {
  for (const node of form.querySelectorAll('[data-error-for]')) node.textContent = '';
  for (const { field, message } of errors) {
    const node = form.querySelector(`[data-error-for="${field}"]`);
    if (node && !node.textContent) node.textContent = message;
  }
}

function refreshPreview() {
  const profile = readForm();
  form.elements.color.disabled = form.elements.useEnvColor.checked;
  if (form.elements.useEnvColor.checked) form.elements.color.value = getEnvironment(profile.env).color;
  $('url-preview').textContent = validateProfile(profile).length ? '—' : buildProfileUrl(profile);
}

function openEditor(profile = null) {
  editingId = profile?.id ?? null;
  $('editor-title').textContent = editingId ? 'Edit account' : 'Add account';
  form.reset();
  const provider = getProvider(profile?.provider) ?? listProviders()[0];
  form.elements.name.value = profile?.name ?? '';
  form.elements.provider.value = provider.id;
  form.elements.env.value = profile?.env ?? 'other';
  form.elements.group.value = profile?.group ?? '';
  form.elements.useEnvColor.checked = !profile?.color;
  form.elements.color.value = profile?.color ?? getEnvironment(profile?.env).color;
  renderProviderFields(provider, profile?.fields);
  showErrors([]);
  refreshPreview();
  editor.showModal();
  form.elements.name.focus();
}

form.elements.provider.append(...listProviders().map((provider) => option(provider.id, provider.label)));
form.elements.env.append(...ENVIRONMENTS.map((env) => option(env.id, env.label)));

form.elements.provider.addEventListener('change', () => {
  // Carry typed values over to the new method; `account` and `accountId` are the same thing to the user.
  const values = {};
  for (const [key, value] of new FormData(form)) {
    if (key.startsWith('field:')) values[key.slice('field:'.length)] = value;
  }
  values.account ||= values.accountId;
  values.accountId ||= values.account;
  renderProviderFields(getProvider(form.elements.provider.value), values);
  refreshPreview();
});

form.elements.name.addEventListener('change', () => {
  if (!editingId && form.elements.env.value === 'other') form.elements.env.value = inferEnv(form.elements.name.value);
  refreshPreview();
});

form.addEventListener('input', refreshPreview);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profile = readForm();
  const errors = validateProfile(profile);
  showErrors(errors);
  if (errors.length) return;
  try {
    await store.saveProfile(profile);
  } catch (error) {
    // Sync storage rejects writes over its quota; keep the dialog open so nothing typed is lost.
    showErrors([{ field: 'form', message: `Could not save: ${error.message}` }]);
    return;
  }
  editor.close();
  await reload();
});

$('editor-cancel').addEventListener('click', () => editor.close());
$('add').addEventListener('click', () => openEditor());

/* ---------- import / export ---------- */

function showImportResult(message, skipped = [], isError = false) {
  const box = $('import-result');
  box.replaceChildren(element('div', '', message));
  if (skipped.length) {
    const list = element('ul');
    for (const { name, reason } of skipped) list.append(element('li', '', `${name}: ${reason}`));
    box.append(element('div', 'muted', `Skipped ${skipped.length}:`), list);
  }
  box.classList.toggle('error', isError);
  box.hidden = false;
}

function parseImport() {
  const text = $('import-text').value;
  if (!text.trim()) {
    showImportResult('Paste a file or load one first.', [], true);
    return null;
  }
  try {
    return importProfiles(text);
  } catch (error) {
    showImportResult(error.message, [], true);
    return null;
  }
}

async function applyImport(next, message, skipped) {
  try {
    await store.replaceAll(next);
  } catch (error) {
    showImportResult(`Could not save: ${error.message}`, skipped, true);
    return;
  }
  await reload();
  showImportResult(message, skipped);
}

$('import-merge').addEventListener('click', async () => {
  const result = parseImport();
  if (!result) return;
  const merged = mergeProfiles(profiles, result.profiles);
  await applyImport(merged.profiles, `Added ${merged.added}, updated ${merged.updated}.`, result.skipped);
});

$('import-replace').addEventListener('click', async () => {
  const result = parseImport();
  if (!result) return;
  if (!confirm(`Replace all ${profiles.length} accounts with the ${result.profiles.length} imported ones?`)) return;
  await applyImport(result.profiles, `Replaced with ${result.profiles.length} accounts.`, result.skipped);
});

$('import-file').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (file) $('import-text').value = await file.text();
  event.target.value = '';
});

$('export').addEventListener('click', () => {
  const blob = new Blob([exportProfiles(profiles)], { type: 'application/json' });
  const link = element('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'aws-hop-accounts.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

/* ---------- settings ---------- */

const SETTING_INPUTS = ['openIn', 'guardEnabled', 'guardShowUnregistered', 'guardTitlePrefix'];

async function loadSettings() {
  const settings = await store.loadSettings();
  for (const key of SETTING_INPUTS) {
    const input = $(`setting-${key}`);
    if (input.type === 'checkbox') input.checked = settings[key];
    else input.value = settings[key];
  }
}

for (const key of SETTING_INPUTS) {
  $(`setting-${key}`).addEventListener('change', async () => {
    const settings = await store.loadSettings();
    const input = $(`setting-${key}`);
    settings[key] = input.type === 'checkbox' ? input.checked : input.value;
    await store.saveSettings(settings);
  });
}

store.onChange(({ profiles: profilesChanged, settings }) => {
  if (profilesChanged) reload();
  if (settings) loadSettings();
});

reload();
loadSettings();
