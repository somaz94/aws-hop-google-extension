import { applyTranslations, richText } from '../i18n/dom.js';
import { resolveLanguage, setLanguage, t } from '../i18n/index.js';
import { formatAccountId } from '../lib/account.js';
import { buildProfileUrl, normalizeProfile, profileAccount, profileColor, validateProfile } from '../lib/profile.js';
import { createRecentStore } from '../lib/recent.js';
import { createStore } from '../lib/store.js';
import { SUGGESTED_TAGS } from '../lib/tag.js';
import { accountIdCommand, CLI_SHELLS, getShell, shellForPlatform } from '../importers/accountIdCommand.js';
import { exportProfiles } from '../importers/json.js';
import { droppedByReplace, importProfiles, mergeProfiles } from '../importers/index.js';
import { getProvider, listProviders } from '../providers/index.js';

const store = createStore();
const $ = (id) => document.getElementById(id);

const editor = $('editor');
const form = $('editor-form');
const providerFields = $('provider-fields');

let profiles = [];
let editingId = null;
let cliShell = shellForPlatform(null);
// The parsed import and the rows cleared in its preview, so both buttons import exactly what the preview shows.
let importDraft = null;

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
  const provider = getProvider(profile.provider);
  return [provider && t(provider.label), account && formatAccountId(account), profile.group].filter(Boolean).join(' · ');
}

function toolButton(label, action, { disabled = false, aria } = {}) {
  const button = element('button', '', label);
  button.type = 'button';
  button.dataset.action = action;
  button.disabled = disabled;
  if (aria) button.setAttribute('aria-label', aria);
  return button;
}

function inlineControls(profile) {
  const tag = element('input', 'tag-input');
  tag.value = profile.tag;
  tag.maxLength = 20;
  tag.placeholder = t('editor.tag');
  tag.setAttribute('list', 'tag-suggestions');
  tag.setAttribute('aria-label', t('options.tagOf', { name: profile.name }));
  tag.dataset.action = 'tag';

  const guardLabel = element('label', 'inline-check');
  const guarded = element('input');
  guarded.type = 'checkbox';
  guarded.checked = profile.guarded;
  guarded.dataset.action = 'guarded';
  guarded.setAttribute('aria-label', t('options.guardedOf', { name: profile.name }));
  guardLabel.append(guarded, ` ${t('options.guardedShort')}`);
  return [tag, guardLabel];
}

function renderList() {
  const list = $('profile-list');
  list.replaceChildren();
  profiles.forEach((profile, index) => {
    const row = element('li', profile.guarded ? 'profile guarded' : 'profile');
    row.dataset.id = profile.id;
    const dot = element('span', 'dot');
    dot.style.background = profileColor(profile);
    const main = element('div', 'main');
    main.append(element('div', 'name', profile.name), element('div', 'meta', metaLine(profile)));
    const tools = element('div', 'tools');
    tools.append(
      toolButton('↑', 'up', { disabled: index === 0, aria: t('options.moveUp') }),
      toolButton('↓', 'down', { disabled: index === profiles.length - 1, aria: t('options.moveDown') }),
      toolButton(t('options.edit'), 'edit'),
      toolButton(t('options.duplicate'), 'duplicate'),
      toolButton(t('options.delete'), 'delete'),
    );
    row.append(dot, main, ...inlineControls(profile), tools);
    list.append(row);
  });
  $('no-profiles').hidden = profiles.length > 0;
  renderTagSuggestions();
}

function renderTagSuggestions() {
  const tags = new Set([...profiles.map((profile) => profile.tag).filter(Boolean), ...SUGGESTED_TAGS]);
  $('tag-suggestions').replaceChildren(...[...tags].map((tag) => option(tag, '')));
}

async function reload() {
  profiles = await store.loadProfiles();
  renderList();
  renderImportPreview();
}

async function move(index, delta) {
  const ids = profiles.map((profile) => profile.id);
  const [id] = ids.splice(index, 1);
  ids.splice(index + delta, 0, id);
  await store.reorder(ids);
  await reload();
}

async function updateInline(profile, changes) {
  const next = normalizeProfile({ ...profile, ...changes });
  if (validateProfile(next).length) return renderList();
  await store.saveProfile(next);
  return reload();
}

const list = $('profile-list');

list.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.closest('.profile').dataset.id;
  const index = profiles.findIndex((profile) => profile.id === id);
  const profile = profiles[index];
  switch (button.dataset.action) {
    case 'up': return move(index, -1);
    case 'down': return move(index, 1);
    case 'edit': return openEditor(profile);
    case 'duplicate': return openEditor({ ...profile, id: null, name: t('options.copyName', { name: profile.name }) });
    case 'delete':
      if (confirm(t('options.confirmDelete', { name: profile.name }))) {
        await store.deleteProfile(id);
        await reload();
      }
      return undefined;
    default: return undefined;
  }
});

// Inline edits save on change (blur or Enter for the tag), so the list never needs a separate save button.
list.addEventListener('change', (event) => {
  const action = event.target.dataset.action;
  if (action !== 'tag' && action !== 'guarded') return;
  const profile = profiles.find((p) => p.id === event.target.closest('.profile').dataset.id);
  updateInline(profile, action === 'tag' ? { tag: event.target.value } : { guarded: event.target.checked });
});

list.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target.dataset.action === 'tag') event.target.blur();
});

/* ---------- editor ---------- */

function renderProviderFields(provider, values = {}) {
  providerFields.replaceChildren();
  $('provider-help').replaceChildren(richText(document, t(provider.description)));
  for (const field of provider.fields) {
    const label = element('label', 'field');
    const input = element('input');
    input.name = `field:${field.key}`;
    input.type = field.type ?? 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = t(field.placeholder ?? '');
    input.value = values[field.key] ?? '';
    const caption = field.required ? t(field.label) : t('editor.optional', { label: t(field.label) });
    label.append(element('span', '', caption), input);
    if (field.help) {
      const help = element('small', 'muted');
      help.append(richText(document, t(field.help)));
      label.append(help);
    }
    const error = element('small', 'error');
    error.dataset.errorFor = field.key;
    label.append(error);
    providerFields.append(label);
  }
}

function currentFieldValues() {
  const values = {};
  for (const [key, value] of new FormData(form)) {
    if (key.startsWith('field:')) values[key.slice('field:'.length)] = value;
  }
  return values;
}

function readForm() {
  const data = new FormData(form);
  return normalizeProfile({
    id: editingId,
    name: data.get('name'),
    provider: data.get('provider'),
    tag: data.get('tag'),
    guarded: form.elements.guarded.checked,
    color: form.elements.autoColor.checked ? null : data.get('color'),
    group: data.get('group'),
    fields: currentFieldValues(),
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
  form.elements.color.disabled = form.elements.autoColor.checked;
  if (form.elements.autoColor.checked) form.elements.color.value = profileColor(profile);
  $('url-preview').textContent = validateProfile(profile).length ? '—' : buildProfileUrl(profile);
}

function openEditor(profile = null) {
  editingId = profile?.id ?? null;
  $('editor-title').textContent = editingId ? t('editor.edit') : t('editor.add');
  form.reset();
  const provider = getProvider(profile?.provider) ?? listProviders()[0];
  form.elements.name.value = profile?.name ?? '';
  form.elements.provider.value = provider.id;
  form.elements.tag.value = profile?.tag ?? '';
  form.elements.group.value = profile?.group ?? '';
  form.elements.guarded.checked = Boolean(profile?.guarded);
  form.elements.autoColor.checked = !profile?.color;
  if (profile?.color) form.elements.color.value = profile.color;
  renderProviderFields(provider, profile?.fields);
  showErrors([]);
  refreshPreview();
  editor.showModal();
  form.elements.name.focus();
}

function fillProviderSelect() {
  const value = form.elements.provider.value;
  form.elements.provider.replaceChildren(...listProviders().map((provider) => option(provider.id, t(provider.label))));
  if (value) form.elements.provider.value = value;
}

form.elements.provider.addEventListener('change', () => {
  // Carry typed values over to the new method; `account` and `accountId` are the same thing to the user.
  const values = currentFieldValues();
  values.account ||= values.accountId;
  values.accountId ||= values.account;
  renderProviderFields(getProvider(form.elements.provider.value), values);
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
    showErrors([{ field: 'form', message: t('editor.saveFailed', { detail: error.message }) }]);
    return;
  }
  editor.close();
  await reload();
});

$('editor-cancel').addEventListener('click', () => editor.close());
$('add').addEventListener('click', () => openEditor());

/** `#add=<account>` comes from the popup's "Add this account" on an unregistered console tab. */
function openFromHash() {
  const match = /^#add=(.+)$/.exec(location.hash);
  if (!match) return;
  history.replaceState(null, '', location.pathname);
  openEditor({ provider: 'iam-user', fields: { account: decodeURIComponent(match[1]) } });
}

/* ---------- import / export ---------- */

function showImportResult(message, skipped = [], isError = false) {
  const box = $('import-result');
  box.replaceChildren(element('div', '', message));
  if (skipped.length) {
    const items = element('ul');
    for (const { name, reason } of skipped) items.append(element('li', '', `${name}: ${reason}`));
    box.append(element('div', 'muted', t('import.result.skipped', { count: skipped.length })), items);
  }
  box.classList.toggle('error', isError);
  box.hidden = false;
}

/** The parsed import for the current text; parsed again only when the text changed. Throws on a malformed file. */
function currentImport() {
  const text = $('import-text').value;
  if (importDraft?.text !== text) importDraft = { text, result: importProfiles(text), excluded: new Set() };
  return importDraft;
}

const isSelected = (draft) => (_, index) => !draft.excluded.has(index);

function previewStatus({ status, as }) {
  if (status === 'exists') return t('import.preview.exists', { name: as });
  return t(`import.preview.${status}`);
}

/** Lists what the text would import, against the current accounts, with a box per account to leave it out. */
function renderImportPreview() {
  const box = $('import-preview');
  if (!$('import-text').value.trim()) {
    importDraft = null;
    box.hidden = true;
    return;
  }
  let draft;
  try {
    draft = currentImport();
  } catch (error) {
    box.replaceChildren(element('div', 'error', error.message));
    box.hidden = false;
    return;
  }
  const { profiles: incoming, skipped } = draft.result;
  const selected = incoming.filter(isSelected(draft));
  box.replaceChildren(element('div', '', t('import.preview.heading', { selected: selected.length, count: incoming.length })));
  const list = element('ul', 'import-preview');
  mergeProfiles(profiles, incoming).outcomes.forEach((outcome, index) => {
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !draft.excluded.has(index);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) draft.excluded.delete(index);
      else draft.excluded.add(index);
      renderImportPreview();
    });
    const label = element('label', 'check');
    label.append(checkbox, element('span', 'name', outcome.profile.name), element('span', 'muted status', previewStatus(outcome)));
    list.append(element('li'));
    list.lastChild.append(label);
  });
  box.append(list);
  const dropped = droppedByReplace(profiles, selected);
  if (dropped.length) box.append(element('div', 'muted', t('import.preview.dropped', { names: dropped.map((profile) => profile.name).join(', ') })));
  if (skipped.length) {
    const items = element('ul');
    for (const { name, reason } of skipped) items.append(element('li', '', `${name}: ${reason}`));
    box.append(element('div', 'muted', t('import.result.skipped', { count: skipped.length })), items);
  }
  box.hidden = false;
}

/** The accounts the preview has selected, or null after showing why there is nothing to import. */
function selectedImport() {
  if (!$('import-text').value.trim()) {
    showImportResult(t('import.result.empty'), [], true);
    return null;
  }
  try {
    const draft = currentImport();
    const selected = draft.result.profiles.filter(isSelected(draft));
    if (draft.result.profiles.length && !selected.length) {
      showImportResult(t('import.result.nothingSelected'), [], true);
      return null;
    }
    return { profiles: selected, skipped: draft.result.skipped };
  } catch (error) {
    showImportResult(error.message, [], true);
    return null;
  }
}

async function applyImport(next, message, skipped) {
  try {
    await store.replaceAll(next);
  } catch (error) {
    showImportResult(t('editor.saveFailed', { detail: error.message }), skipped, true);
    return;
  }
  await reload();
  showImportResult(message, skipped);
}

$('import-merge').addEventListener('click', async () => {
  const result = selectedImport();
  if (!result) return;
  const merged = mergeProfiles(profiles, result.profiles);
  const message = t('import.result.merged', { added: merged.added, updated: merged.updated, existing: merged.existing.length });
  await applyImport(merged.profiles, message, [...result.skipped, ...merged.existing]);
});

$('import-replace').addEventListener('click', async () => {
  const result = selectedImport();
  if (!result) return;
  if (!confirm(t('import.confirmReplace', { current: profiles.length, incoming: result.profiles.length }))) return;
  await applyImport(result.profiles, t('import.result.replaced', { count: result.profiles.length }), result.skipped);
});

$('import-file').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (file) $('import-text').value = await file.text();
  event.target.value = '';
  $('import-result').hidden = true;
  renderImportPreview();
});

let previewTimer = null;
$('import-text').addEventListener('input', () => {
  $('import-result').hidden = true;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderImportPreview, 200);
});

$('cli-copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('cli-command').textContent);
  $('cli-copy').textContent = t('options.cliHelper.copied');
  setTimeout(() => { $('cli-copy').textContent = t('options.cliHelper.copy'); }, 1500);
});

$('cli-shells').addEventListener('click', (event) => {
  const id = event.target.closest('button')?.dataset.shell;
  if (!id) return;
  cliShell = getShell(id);
  renderCliHelper();
});

function renderCliHelper() {
  $('cli-shells').replaceChildren(...CLI_SHELLS.map((shell) => {
    const button = element('button', '', t(shell.label));
    button.type = 'button';
    button.dataset.shell = shell.id;
    button.setAttribute('aria-pressed', String(shell.id === cliShell.id));
    return button;
  }));
  $('cli-helper-step1').replaceChildren(richText(document, t('options.cliHelper.step1', { terminal: t(cliShell.terminal) })));
  $('cli-helper-step2').replaceChildren(richText(document, t(cliShell.clipboard ? 'options.cliHelper.step2.clipboard' : 'options.cliHelper.step2.print')));
  $('cli-helper-step3').replaceChildren(richText(document, t('options.cliHelper.step3', { button: t('options.merge') })));
  $('cli-command').textContent = accountIdCommand(cliShell.id);
}

$('export').addEventListener('click', () => {
  const blob = new Blob([exportProfiles(profiles)], { type: 'application/json' });
  const link = element('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'aws-hop-accounts.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

/* ---------- settings and language ---------- */

const SETTING_INPUTS = ['language', 'openIn', 'showRecent', 'confirmGuarded', 'guardEnabled', 'guardShowUnregistered', 'guardTitlePrefix', 'guardPosition'];

function applyLanguage(settings) {
  setLanguage(resolveLanguage(settings.language, chrome.i18n.getUILanguage()));
  applyTranslations(document);
  fillProviderSelect();
  renderCliHelper();
  renderList();
  // Skip reasons are worded when the text is parsed, so parse again in the new language.
  importDraft = null;
  renderImportPreview();
}

async function loadSettings() {
  const settings = await store.loadSettings();
  for (const key of SETTING_INPUTS) {
    const input = $(`setting-${key}`);
    if (input.type === 'checkbox') input.checked = settings[key];
    else input.value = settings[key];
  }
  applyLanguage(settings);
}

// One save at a time: each reloads the settings, and saving refreshes the inputs, so two quick changes could undo each other.
let settingsSaved = Promise.resolve();

for (const key of SETTING_INPUTS) {
  $(`setting-${key}`).addEventListener('change', () => {
    const input = $(`setting-${key}`);
    const value = input.type === 'checkbox' ? input.checked : input.value;
    const save = async () => {
      const settings = await store.loadSettings();
      settings[key] = value;
      await store.saveSettings(settings);
      // Turning the recent list off also forgets it, so nothing is kept for a feature that is off.
      if (key === 'showRecent' && !settings.showRecent) await createRecentStore().clear();
    };
    settingsSaved = settingsSaved.then(save, save);
  });
}

store.onChange(({ profiles: profilesChanged, settings }) => {
  if (profilesChanged) reload();
  if (settings) loadSettings();
});

async function init() {
  cliShell = shellForPlatform((await chrome.runtime.getPlatformInfo()).os);
  profiles = await store.loadProfiles();
  await loadSettings();
  $('cli-helper').open = profiles.length === 0;
  openFromHash();
}

init();
