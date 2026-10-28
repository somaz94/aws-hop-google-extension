import { applyTranslations, richText } from '../i18n/dom.js';
import { applyLanguageSetting, t } from '../i18n/index.js';
import { bulkEdit, keepSelected, moveBy, moveNextTo, selectionState, selectRange } from '../lib/listEdit.js';
import { buildProfileUrl, GROUP_MAX, NAME_MAX, normalizeProfile, profileColor, profileMeta, validateProfile } from '../lib/profile.js';
import { createRecentStore } from '../lib/recent.js';
import { filterProfiles } from '../lib/search.js';
import { serial } from '../lib/serial.js';
import { createStore, DEFAULT_SETTINGS, saveSetting } from '../lib/store.js';
import { SUGGESTED_TAGS, TAG_MAX } from '../lib/tag.js';
import { createThemer } from '../lib/theme.js';
import { accountIdCommand, CLI_SHELLS, getShell, shellForPlatform } from '../importers/accountIdCommand.js';
import { exportProfiles } from '../importers/json.js';
import { droppedByReplace, importProfiles, mergeProfiles } from '../importers/index.js';
import { getProvider, listProviders } from '../providers/index.js';

const store = createStore();
const themer = createThemer(document);
const $ = (id) => document.getElementById(id);

const editor = $('editor');
const form = $('editor-form');
const providerFields = $('provider-fields');

// The limits validateProfile enforces, so no input can hold more than a profile accepts.
for (const [input, max] of [[form.elements.name, NAME_MAX], [form.elements.tag, TAG_MAX], [form.elements.group, GROUP_MAX], [$('bulk-tag'), TAG_MAX], [$('bulk-group'), GROUP_MAX]]) {
  input.maxLength = max;
}

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

const list = $('profile-list');
let query = '';
// The rows on screen, in screen order; the selection never holds an id outside them.
let shown = [];
let selected = new Set();
let selectionAnchor = null;
let dragId = null;

const searching = () => Boolean(query.trim());
const shownIds = () => shown.map((profile) => profile.id);
const allIds = () => profiles.map((profile) => profile.id);

function metaLine(profile) {
  const provider = getProvider(profile.provider);
  return profileMeta(profile, provider && t(provider.label));
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
  tag.maxLength = TAG_MAX;
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

function profileRow(profile, index, reorderable) {
  const row = element('li', profile.guarded ? 'profile guarded' : 'profile');
  row.dataset.id = profile.id;
  const pick = element('input', 'pick');
  pick.type = 'checkbox';
  pick.dataset.action = 'select';
  pick.setAttribute('aria-label', t('options.selectOf', { name: profile.name }));
  // Mouse only: keyboard users reorder with the arrow buttons.
  const handle = element('span', reorderable ? 'handle' : 'handle off', '⠿');
  handle.title = t('options.dragHandle');
  handle.setAttribute('aria-hidden', 'true');
  const dot = element('span', 'dot');
  dot.style.background = profileColor(profile);
  const main = element('div', 'main');
  main.append(element('div', 'name', profile.name), element('div', 'meta', metaLine(profile)));
  const tools = element('div', 'tools');
  tools.append(
    toolButton('↑', 'up', { disabled: !reorderable || index === 0, aria: t('options.moveUp') }),
    toolButton('↓', 'down', { disabled: !reorderable || index === shown.length - 1, aria: t('options.moveDown') }),
    toolButton(t('options.edit'), 'edit'),
    toolButton(t('options.duplicate'), 'duplicate'),
    toolButton(t('options.delete'), 'delete'),
  );
  row.append(pick, handle, dot, main, ...inlineControls(profile), tools);
  return row;
}

// Search results are ranked rather than in the stored order, so moving a row there would land somewhere unexpected.
function renderList() {
  shown = filterProfiles(profiles, query);
  selected = keepSelected(selected, shownIds());
  const reorderable = !searching();
  list.replaceChildren(...shown.map((profile, index) => profileRow(profile, index, reorderable)));
  $('list-tools').hidden = profiles.length === 0;
  $('no-profiles').hidden = profiles.length > 0;
  $('no-match').hidden = profiles.length === 0 || shown.length > 0;
  $('reorder-hint').hidden = reorderable || shown.length < 2;
  renderSelection();
  renderSuggestions();
}

function renderSelection() {
  const state = selectionState(selected, shownIds());
  const all = $('select-all');
  all.checked = state === 'all';
  all.indeterminate = state === 'some';
  all.disabled = shown.length === 0;
  for (const row of list.children) {
    const on = selected.has(row.dataset.id);
    row.classList.toggle('selected', on);
    row.querySelector('[data-action="select"]').checked = on;
  }
  $('bulk-bar').hidden = selected.size === 0;
  $('bulk-count').textContent = t('options.bulk.count', { count: selected.size });
}

function renderSuggestions() {
  const tags = new Set([...profiles.map((profile) => profile.tag).filter(Boolean), ...SUGGESTED_TAGS]);
  $('tag-suggestions').replaceChildren(...[...tags].map((tag) => option(tag, '')));
  const groups = new Set(profiles.map((profile) => profile.group).filter(Boolean));
  $('group-suggestions').replaceChildren(...[...groups].map((group) => option(group, '')));
}

async function reload() {
  profiles = await store.loadProfiles();
  renderList();
  renderImportPreview();
}

async function reorder(ids) {
  await store.reorder(ids);
  await reload();
}

async function updateInline(profile, changes) {
  const next = normalizeProfile({ ...profile, ...changes });
  if (validateProfile(next).length) return renderList();
  await store.saveProfile(next);
  return reload();
}

function toggleSelected(box, range) {
  const id = box.closest('.profile').dataset.id;
  selected = selectRange(selected, shownIds(), range ? selectionAnchor : id, id, box.checked);
  selectionAnchor = id;
  renderSelection();
}

list.addEventListener('click', async (event) => {
  // A click event, not change, because only the click carries the Shift key.
  if (event.target.dataset.action === 'select') return toggleSelected(event.target, event.shiftKey);
  const button = event.target.closest('button[data-action]');
  if (!button) return undefined;
  const id = button.closest('.profile').dataset.id;
  const profile = profiles.find((other) => other.id === id);
  switch (button.dataset.action) {
    case 'up': return reorder(moveBy(allIds(), id, -1));
    case 'down': return reorder(moveBy(allIds(), id, 1));
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

$('list-search').addEventListener('input', (event) => {
  query = event.target.value;
  renderList();
});

$('select-all').addEventListener('change', (event) => {
  selected = event.target.checked ? new Set(shownIds()) : new Set();
  selectionAnchor = null;
  renderSelection();
});

/* ---------- drag to reorder ---------- */

// Rows become draggable only while the handle is held, so dragging inside the tag input still selects its text.
list.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('.handle');
  if (handle && !searching()) handle.closest('.profile').draggable = true;
});

document.addEventListener('pointerup', () => {
  if (!dragId) for (const row of list.querySelectorAll('[draggable="true"]')) row.draggable = false;
});

function clearDropMarks() {
  for (const row of list.querySelectorAll('.drop-before, .drop-after')) row.classList.remove('drop-before', 'drop-after');
}

function dropTarget(event) {
  const row = event.target.closest?.('.profile');
  if (!dragId || !row || row.dataset.id === dragId) return null;
  const { top, height } = row.getBoundingClientRect();
  return { id: row.dataset.id, row, after: event.clientY > top + height / 2 };
}

function endDrag() {
  dragId = null;
  clearDropMarks();
  for (const row of list.querySelectorAll('.dragging, [draggable="true"]')) {
    row.classList.remove('dragging');
    row.draggable = false;
  }
}

list.addEventListener('dragstart', (event) => {
  // A text drag out of the tag input starts on the input, not on the row.
  if (!event.target.matches?.('.profile') || searching()) return;
  dragId = event.target.dataset.id;
  event.target.classList.add('dragging');
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
});

list.addEventListener('dragover', (event) => {
  const target = dropTarget(event);
  clearDropMarks();
  if (!target) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  target.row.classList.add(target.after ? 'drop-after' : 'drop-before');
});

list.addEventListener('dragleave', (event) => {
  if (!list.contains(event.relatedTarget)) clearDropMarks();
});

list.addEventListener('drop', async (event) => {
  const target = dropTarget(event);
  const id = dragId;
  endDrag();
  if (!target) return;
  event.preventDefault();
  await reorder(moveNextTo(allIds(), id, target.id, target.after));
});

list.addEventListener('dragend', endDrag);

/* ---------- bulk edit ---------- */

const selectedProfiles = () => shown.filter((profile) => selected.has(profile.id));

// Each save loads the profiles afresh, so a second quick action cannot write back what the first changed.
const saveBulk = serial(async (ids, changes) => {
  const next = bulkEdit(await store.loadProfiles(), ids, changes);
  if (next.length) await store.saveProfiles(next);
  await reload();
});
const bulkSave = (changes) => saveBulk([...selected], changes);

$('bulk-set-tag').addEventListener('click', () => bulkSave({ tag: $('bulk-tag').value }));
$('bulk-set-group').addEventListener('click', () => bulkSave({ group: $('bulk-group').value }));
$('bulk-protect').addEventListener('click', () => bulkSave({ guarded: true }));
$('bulk-unprotect').addEventListener('click', () => bulkSave({ guarded: false }));

for (const [input, button] of [['bulk-tag', 'bulk-set-tag'], ['bulk-group', 'bulk-set-group']]) {
  $(input).addEventListener('keydown', (event) => {
    if (event.key === 'Enter') $(button).click();
  });
}

$('bulk-delete').addEventListener('click', async () => {
  const doomed = selectedProfiles();
  const names = doomed.map((profile) => profile.name).join(', ');
  if (!doomed.length || !confirm(t('options.bulk.confirmDelete', { count: doomed.length, names }))) return;
  await store.deleteProfiles(doomed.map((profile) => profile.id));
  await reload();
});

$('bulk-clear').addEventListener('click', () => {
  selected = new Set();
  selectionAnchor = null;
  renderSelection();
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

// Every setting has an input with the id setting-<key>.
const SETTING_INPUTS = Object.keys(DEFAULT_SETTINGS);

function applyLanguage(settings) {
  themer.apply(settings.theme);
  applyLanguageSetting(settings, chrome.i18n.getUILanguage());
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

const saveSettingInOrder = serial((key, value) => saveSetting(store, key, value, { recent: createRecentStore() }));

for (const key of SETTING_INPUTS) {
  $(`setting-${key}`).addEventListener('change', () => {
    const input = $(`setting-${key}`);
    saveSettingInOrder(key, input.type === 'checkbox' ? input.checked : input.value);
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
