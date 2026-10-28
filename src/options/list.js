import { t } from '../i18n/index.js';
import { keepSelected, moveBy, moveNextTo, selectionState, selectRange, suggestionsFor } from '../lib/listEdit.js';
import { normalizeProfile, profileColor, profileMeta, validateProfile } from '../lib/profile.js';
import { filterProfiles } from '../lib/search.js';
import { SUGGESTED_TAGS, TAG_MAX } from '../lib/tag.js';
import { getProvider } from '../providers/index.js';
import { $, element, option } from './dom.js';
import { attachDrag } from './drag.js';

function toolButton(label, action, { disabled = false, aria } = {}) {
  const button = element('button', '', label);
  button.type = 'button';
  button.dataset.action = action;
  button.disabled = disabled;
  if (aria) button.setAttribute('aria-label', aria);
  return button;
}

function metaLine(profile) {
  const provider = getProvider(profile.provider);
  return profileMeta(profile, provider && t(provider.label));
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

/** The account list: search, selection, drag and arrow reordering, inline tag and protect edits, and the row buttons. */
export function createAccountList({ store, profiles, reload, onEdit, undo }) {
  const list = $('profile-list');
  let query = '';
  // The rows on screen, in screen order; the selection never holds an id outside them.
  let shown = [];
  let selected = new Set();
  let selectionAnchor = null;

  const searching = () => Boolean(query.trim());
  const shownIds = () => shown.map((profile) => profile.id);
  const allIds = () => profiles().map((profile) => profile.id);

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
  function render() {
    const all = profiles();
    shown = filterProfiles(all, query);
    selected = keepSelected(selected, shownIds());
    const reorderable = !searching();
    list.replaceChildren(...shown.map((profile, index) => profileRow(profile, index, reorderable)));
    $('list-tools').hidden = all.length === 0;
    $('no-profiles').hidden = all.length > 0;
    $('no-match').hidden = all.length === 0 || shown.length > 0;
    $('reorder-hint').hidden = reorderable || shown.length < 2;
    renderSelection();
    renderSuggestions(all);
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

  function renderSuggestions(all) {
    const { tags, groups } = suggestionsFor(all, SUGGESTED_TAGS);
    $('tag-suggestions').replaceChildren(...tags.map((tag) => option(tag, '')));
    $('group-suggestions').replaceChildren(...groups.map((group) => option(group, '')));
  }

  async function reorder(ids) {
    await store.reorder(ids);
    await reload();
  }

  async function updateInline(profile, changes) {
    const next = normalizeProfile({ ...profile, ...changes });
    if (validateProfile(next).length) return render();
    await store.saveProfile(next);
    return reload();
  }

  function toggleSelected(box, range) {
    const id = box.closest('.profile').dataset.id;
    selected = selectRange(selected, shownIds(), range ? selectionAnchor : id, id, box.checked);
    selectionAnchor = id;
    renderSelection();
  }

  function setSelection(ids) {
    selected = new Set(ids);
    selectionAnchor = null;
    renderSelection();
  }

  list.addEventListener('click', async (event) => {
    // A click event, not change, because only the click carries the Shift key.
    if (event.target.dataset.action === 'select') return toggleSelected(event.target, event.shiftKey);
    const button = event.target.closest('button[data-action]');
    if (!button) return undefined;
    const id = button.closest('.profile').dataset.id;
    const profile = profiles().find((other) => other.id === id);
    switch (button.dataset.action) {
      case 'up': return reorder(moveBy(allIds(), id, -1));
      case 'down': return reorder(moveBy(allIds(), id, 1));
      case 'edit': return onEdit(profile);
      case 'duplicate': return onEdit({ ...profile, id: null, name: t('options.copyName', { name: profile.name }) });
      case 'delete':
        if (confirm(t('options.confirmDelete', { name: profile.name }))) await undo.deleteProfiles([profile], allIds());
        return undefined;
      default: return undefined;
    }
  });

  // Inline edits save on change (blur or Enter for the tag), so the list never needs a separate save button.
  list.addEventListener('change', (event) => {
    const action = event.target.dataset.action;
    if (action !== 'tag' && action !== 'guarded') return;
    const profile = profiles().find((other) => other.id === event.target.closest('.profile').dataset.id);
    updateInline(profile, action === 'tag' ? { tag: event.target.value } : { guarded: event.target.checked });
  });

  list.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.dataset.action === 'tag') event.target.blur();
  });

  $('list-search').addEventListener('input', (event) => {
    query = event.target.value;
    render();
  });

  $('select-all').addEventListener('change', (event) => setSelection(event.target.checked ? shownIds() : []));

  attachDrag(list, {
    canDrag: () => !searching(),
    onDrop: (id, targetId, after) => reorder(moveNextTo(allIds(), id, targetId, after)),
  });

  return {
    render,
    selectedIds: () => [...selected],
    selectedProfiles: () => shown.filter((profile) => selected.has(profile.id)),
    clearSelection: () => setSelection([]),
  };
}
