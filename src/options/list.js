import { t } from '../i18n/index.js';
import {
  bulkEdit, dropMove, groupColor, groupIds, keepSelected, moveBy, selectionState, selectRange, suggestionsFor, ungroup,
} from '../lib/listEdit.js';
import { GROUP_MAX, normalizeProfile, profileColor, profileMeta, validateProfile } from '../lib/profile.js';
import { filterProfiles, groupProfiles } from '../lib/search.js';
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

function metaLine(profile, headed) {
  const provider = getProvider(profile.provider);
  return profileMeta(profile, provider && t(provider.label), { withGroup: !headed });
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

  function profileRow(profile, { reorderable, first, last, headed }) {
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
    main.append(element('div', 'name', profile.name), element('div', 'meta', metaLine(profile, headed)));
    const tools = element('div', 'tools');
    tools.append(
      toolButton('↑', 'up', { disabled: !reorderable || first, aria: t('options.moveUp') }),
      toolButton('↓', 'down', { disabled: !reorderable || last, aria: t('options.moveDown') }),
      toolButton(t('options.edit'), 'edit'),
      toolButton(t('options.duplicate'), 'duplicate'),
      toolButton(t('options.delete'), 'delete'),
    );
    row.append(pick, handle, dot, main, ...inlineControls(profile), tools);
    return row;
  }

  function groupHead({ group, profiles: members }, all) {
    const head = element('li', 'group-head');
    head.dataset.group = group;
    const name = group || t('options.group.none');
    const pick = element('input', 'pick');
    pick.type = 'checkbox';
    pick.dataset.action = 'select-group';
    pick.setAttribute('aria-label', t('options.group.selectOf', { name }));
    head.append(pick, element('span', 'group-name', name), element('span', 'muted group-count', String(members.length)));
    if (group) {
      const color = element('input', 'group-color');
      color.type = 'color';
      color.value = groupColor(all, group) ?? profileColor(members[0]);
      color.dataset.action = 'group-color';
      color.setAttribute('aria-label', t('options.group.colorOf', { name }));
      const actions = element('span', 'group-actions');
      actions.append(
        toolButton(t('options.group.rename'), 'rename-group', { aria: t('options.group.renameOf', { name }) }),
        toolButton(t('options.group.ungroup'), 'ungroup', { aria: t('options.group.ungroupOf', { name }) }),
      );
      head.append(color, actions);
    }
    return head;
  }

  // Search results are ranked rather than in the stored order, so moving a row there would land somewhere unexpected.
  // Otherwise rows follow the popup: one block per group, so the arrows stay inside it and a drop can change it.
  function render() {
    const all = profiles();
    const reorderable = !searching();
    const sections = reorderable ? groupProfiles(all) : [{ group: '', profiles: filterProfiles(all, query) }];
    const headed = sections.some((section) => section.group);
    shown = sections.flatMap((section) => section.profiles);
    selected = keepSelected(selected, shownIds());
    list.replaceChildren(...sections.flatMap((section) => [
      ...(headed ? [groupHead(section, all)] : []),
      ...section.profiles.map((profile, index) => profileRow(profile, {
        reorderable, headed, first: index === 0, last: index === section.profiles.length - 1,
      })),
    ]));
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
    for (const row of list.querySelectorAll('.profile')) {
      const on = selected.has(row.dataset.id);
      row.classList.toggle('selected', on);
      row.querySelector('[data-action="select"]').checked = on;
    }
    for (const head of list.querySelectorAll('.group-head')) {
      const groupState = selectionState(selected, groupIds(shown, head.dataset.group));
      const box = head.querySelector('[data-action="select-group"]');
      box.checked = groupState === 'all';
      box.indeterminate = groupState === 'some';
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

  function toggleGroup(box) {
    const ids = groupIds(shown, box.closest('.group-head').dataset.group);
    const next = new Set(selected);
    for (const id of ids) {
      if (box.checked) next.add(id);
      else next.delete(id);
    }
    setSelection([...next]);
  }

  async function saveChanged(next) {
    if (next.length) await store.saveProfiles(next);
    await reload();
  }

  /** Swaps the group name for an input; Enter or leaving it renames every account in the group, Escape cancels. */
  function startRename(head) {
    const from = head.dataset.group;
    const input = element('input', 'group-rename');
    input.value = from;
    input.maxLength = GROUP_MAX;
    input.setAttribute('aria-label', t('options.group.renameOf', { name: from }));
    head.querySelector('.group-name').replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (save) => {
      if (done) return undefined;
      done = true;
      if (!save || input.value.trim() === from) return render();
      return saveChanged(bulkEdit(profiles(), groupIds(profiles(), from), { group: input.value }));
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') finish(true);
      else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  function setSelection(ids) {
    selected = new Set(ids);
    selectionAnchor = null;
    renderSelection();
  }

  list.addEventListener('click', async (event) => {
    // A click event, not change, because only the click carries the Shift key.
    if (event.target.dataset.action === 'select') return toggleSelected(event.target, event.shiftKey);
    if (event.target.dataset.action === 'select-group') return toggleGroup(event.target);
    const button = event.target.closest('button[data-action]');
    if (!button) return undefined;
    if (button.dataset.action === 'rename-group') return startRename(button.closest('.group-head'));
    if (button.dataset.action === 'ungroup') return saveChanged(ungroup(profiles(), button.closest('.group-head').dataset.group));
    const id = button.closest('.profile').dataset.id;
    const profile = profiles().find((other) => other.id === id);
    switch (button.dataset.action) {
      case 'up': return reorder(moveBy(shownIds(), id, -1));
      case 'down': return reorder(moveBy(shownIds(), id, 1));
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
    if (action === 'group-color') {
      const { group } = event.target.closest('.group-head').dataset;
      saveChanged(bulkEdit(profiles(), groupIds(profiles(), group), { color: event.target.value }));
      return;
    }
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
    onDrop: async (id, targetId, after) => {
      const { order, regrouped } = dropMove(profiles(), shownIds(), id, targetId, after);
      if (regrouped) await store.saveProfiles([regrouped]);
      await reorder(order);
    },
  });

  return {
    render,
    selectedIds: () => [...selected],
    selectedProfiles: () => shown.filter((profile) => selected.has(profile.id)),
    clearSelection: () => setSelection([]),
  };
}
