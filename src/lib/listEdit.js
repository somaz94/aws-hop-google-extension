import { normalizeProfile } from './profile.js';

// The fields the options page can change on many accounts at once.
const BULK_FIELDS = Object.freeze(['tag', 'group', 'guarded', 'color']);

/** Moves `id` by `delta` places, stopping at either end. */
export function moveBy(ids, id, delta) {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const to = Math.min(Math.max(from + delta, 0), ids.length - 1);
  const next = ids.filter((other) => other !== id);
  next.splice(to, 0, id);
  return next;
}

/** Moves `id` to just before `targetId`, or just after it when `after` is set; unchanged when either is missing. */
export function moveNextTo(ids, id, targetId, after = false) {
  if (id === targetId || !ids.includes(id) || !ids.includes(targetId)) return [...ids];
  const next = ids.filter((other) => other !== id);
  next.splice(next.indexOf(targetId) + (after ? 1 : 0), 0, id);
  return next;
}

/** A copy of `selected` with every id from `anchor` to `target` in `ids` set to `checked`; only `target` when `anchor` is not listed. */
export function selectRange(selected, ids, anchor, target, checked) {
  const next = new Set(selected);
  const end = ids.indexOf(target);
  const start = ids.includes(anchor) ? ids.indexOf(anchor) : end;
  if (end < 0) return next;
  for (const id of ids.slice(Math.min(start, end), Math.max(start, end) + 1)) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** The selected ids that are still in `ids`, so hidden or deleted accounts never take part in a bulk action. */
export function keepSelected(selected, ids) {
  return new Set(ids.filter((id) => selected.has(id)));
}

/** 'all', 'some' or 'none' of `ids` selected, for a select-all checkbox. */
export function selectionState(selected, ids) {
  const count = ids.filter((id) => selected.has(id)).length;
  if (!count) return 'none';
  return count === ids.length ? 'all' : 'some';
}

/** The profiles in `ids` with the tag, group, guarded flag or color in `changes` applied, leaving out those it does not change. */
export function bulkEdit(profiles, ids, changes) {
  const patch = Object.fromEntries(BULK_FIELDS.filter((key) => Object.hasOwn(changes, key)).map((key) => [key, changes[key]]));
  const chosen = new Set(ids);
  const staying = profiles.filter((profile) => !chosen.has(profile.id));
  const group = Object.hasOwn(patch, 'group') && !Object.hasOwn(patch, 'color') ? String(patch.group ?? '').trim() : null;
  return profiles
    .filter((profile) => chosen.has(profile.id))
    .map((profile) => {
      const color = group !== null && group !== profile.group ? regroupedColor(staying, profile, group) : profile.color;
      return [profile, normalizeProfile({ ...profile, color, ...patch })];
    })
    .filter(([before, after]) => BULK_FIELDS.some((key) => before[key] !== after[key]))
    .map(([, after]) => after);
}

/** Tag and group values to suggest: the ones already in use first, then the built-in tags. */
export function suggestionsFor(profiles, builtInTags = []) {
  const tags = new Set([...profiles.map((profile) => profile.tag).filter(Boolean), ...builtInTags]);
  const groups = new Set(profiles.map((profile) => profile.group).filter(Boolean));
  return { tags: [...tags], groups: [...groups] };
}

/** The order after restoring deleted ids: their earlier places for every id in `current`, then ids added since. */
export function restoredOrder(previous, current) {
  const present = new Set(current);
  const before = new Set(previous);
  return [...previous.filter((id) => present.has(id)), ...current.filter((id) => !before.has(id))];
}

/** The ids of the accounts in `group`; an empty group name means the accounts in none. */
export function groupIds(profiles, group) {
  return profiles.filter((profile) => profile.group === group).map((profile) => profile.id);
}

/** The color every account in `group` shares when one was chosen for all of them, else null. */
export function groupColor(profiles, group) {
  if (!group) return null;
  const colors = new Set(profiles.filter((profile) => profile.group === group).map((profile) => profile.color));
  return colors.size === 1 ? [...colors][0] : null;
}

/**
 * The color a profile keeps when it moves into `group`, judged against the `others` that stay put: a color it only
 * had from its old group's shared color gives way to the new group's, and a color it was given itself stays.
 */
export function regroupedColor(others, profile, group) {
  const inherited = profile.color !== null && profile.color === groupColor(others, profile.group);
  const own = inherited ? null : profile.color;
  return own ?? groupColor(others, String(group ?? '').trim());
}

/** Where a dragged row lands: the new order, and its profile moved into the target row's group when that differs. */
export function dropMove(profiles, ids, id, targetId, after) {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const source = byId.get(id);
  const target = byId.get(targetId);
  const others = profiles.filter((profile) => profile.id !== id);
  const regrouped = source && target && source.group !== target.group
    ? normalizeProfile({ ...source, group: target.group, color: regroupedColor(others, source, target.group) })
    : null;
  return { order: moveNextTo(ids, id, targetId, after), regrouped };
}

/** Every account in `group` taken out of it; a color they only had from the group goes back to automatic. */
export function ungroup(profiles, group) {
  const shared = groupColor(profiles, group);
  return profiles
    .filter((profile) => profile.group === group)
    .map((profile) => normalizeProfile({ ...profile, group: '', color: profile.color === shared ? null : profile.color }));
}
