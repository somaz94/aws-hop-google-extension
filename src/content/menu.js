import { t } from '../i18n/index.js';
import { formatAccountId } from '../lib/account.js';
import { profileAccount, profileColor, profileLabel } from '../lib/profile.js';
import { filterProfiles, moveSelection, needsConfirmation } from '../lib/search.js';
import { FONT } from './banner.js';

const STYLE = `
.menu {
  position: fixed; bottom: 80px; left: 12px; z-index: 2147483647;
  width: 300px; max-height: 360px; display: flex; flex-direction: column;
  border-radius: 10px; overflow: hidden; background: #232f3e; color: #ffffff;
  font: 13px/1.4 ${FONT}; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}
.menu.right { left: auto; right: 12px; }
.head { display: flex; gap: 6px; padding: 8px; }
.search {
  flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid #5f6b7a; border-radius: 6px;
  background: #0f1b2a; color: inherit; font: inherit; outline: none;
}
.search:focus { border-color: #ff9900; }
.collapse { border: 0; border-radius: 6px; background: #3b4a5c; color: inherit; font: inherit; cursor: pointer; padding: 0 10px; }
.list { list-style: none; margin: 0; padding: 0 0 6px; overflow-y: auto; }
.row { display: flex; gap: 8px; align-items: center; padding: 6px 12px; cursor: pointer; }
.row.selected, .row:hover { background: #37475a; }
.dot { width: 10px; height: 10px; flex: none; border-radius: 50%; }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.meta { flex: none; font-size: 12px; opacity: 0.75; }
.row.confirming .meta { color: #ff8a80; opacity: 1; }
.empty { padding: 6px 12px 10px; opacity: 0.75; }
`;

const inverted = (event) => event.shiftKey || event.metaKey || event.ctrlKey || event.button === 1;

/** Recently opened accounts first, then the rest in the user's order; one ranked list while searching. */
export function menuProfiles(profiles, { query = '', recent = [] } = {}) {
  if (query.trim()) return filterProfiles(profiles, query);
  const first = new Set(recent.map((profile) => profile.id));
  return [...recent, ...profiles.filter((profile) => !first.has(profile.id))];
}

/**
 * The account switcher behind the guard label. It is built when opened and removed when closed, so the
 * account list is in the console page only while it is on screen, and keys typed into it never reach the console.
 */
export function createMenu(root, { onOpen, onCollapse }) {
  const doc = root.ownerDocument;
  let data = null;
  let query = '';
  let selected = -1;
  let confirmingId = null;
  let nodes = null;

  const visible = () => menuProfiles(data.profiles, { query, recent: data.recent });

  function renderList() {
    const profiles = visible();
    nodes.list.replaceChildren();
    if (!profiles.length) {
      nodes.list.append(Object.assign(doc.createElement('li'), { className: 'empty', textContent: t('popup.noMatch') }));
      return;
    }
    profiles.forEach((profile, index) => {
      const row = doc.createElement('li');
      row.className = ['row', index === selected && 'selected', profile.id === confirmingId && 'confirming'].filter(Boolean).join(' ');
      row.title = [profileLabel(profile), formatAccountId(profileAccount(profile) ?? '')].filter(Boolean).join(' · ');
      const dot = doc.createElement('span');
      dot.className = 'dot';
      dot.style.background = profileColor(profile);
      const name = Object.assign(doc.createElement('span'), { className: 'name', textContent: profileLabel(profile) });
      let meta = '';
      if (profile.id === confirmingId) meta = t('popup.confirmOpen');
      else if (profile.id === data.currentId) meta = t('popup.current');
      row.append(dot, name, Object.assign(doc.createElement('span'), { className: 'meta', textContent: meta }));
      row.addEventListener('click', (event) => activate(profile, inverted(event)));
      row.addEventListener('auxclick', (event) => {
        if (event.button === 1) activate(profile, true);
      });
      nodes.list.append(row);
    });
  }

  function activate(profile, invert) {
    if (needsConfirmation(profile, data.settings, confirmingId)) {
      confirmingId = profile.id;
      renderList();
      return;
    }
    onOpen(profile.id, invert);
    close();
  }

  function onKey(event) {
    event.stopPropagation();
    if (event.type !== 'keydown') return;
    const profiles = visible();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      confirmingId = null;
      selected = moveSelection(selected, event.key === 'ArrowDown' ? 1 : -1, profiles.length);
      renderList();
    } else if (event.key === 'Enter' && profiles.length) {
      event.preventDefault();
      activate(profiles[Math.max(selected, 0)], inverted(event));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (confirmingId) {
        confirmingId = null;
        renderList();
      } else close();
    }
  }

  function onOutside(event) {
    if (!event.composedPath().includes(root.host)) close();
  }

  function open(next) {
    data = next;
    query = '';
    selected = -1;
    confirmingId = null;
    const style = Object.assign(doc.createElement('style'), { textContent: STYLE });
    const box = doc.createElement('div');
    box.className = next.side === 'right' ? 'menu right' : 'menu';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', t('guard.menu.label'));
    const head = Object.assign(doc.createElement('div'), { className: 'head' });
    const search = Object.assign(doc.createElement('input'), { className: 'search', type: 'search', placeholder: t('popup.search') });
    search.addEventListener('input', () => {
      query = search.value;
      selected = query.trim() ? 0 : -1;
      confirmingId = null;
      renderList();
    });
    const collapse = Object.assign(doc.createElement('button'), { className: 'collapse', type: 'button', textContent: '–', title: t('guard.menu.collapse') });
    collapse.addEventListener('click', () => {
      close();
      onCollapse();
    });
    head.append(search, collapse);
    const list = Object.assign(doc.createElement('ul'), { className: 'list' });
    box.append(head, list);
    for (const type of ['keydown', 'keyup', 'keypress']) box.addEventListener(type, onKey);
    root.append(style, box);
    nodes = { style, box, list, search };
    renderList();
    doc.addEventListener('mousedown', onOutside, true);
    search.focus();
  }

  function close() {
    if (!nodes) return;
    doc.removeEventListener('mousedown', onOutside, true);
    nodes.style.remove();
    nodes.box.remove();
    nodes = null;
    data = null;
  }

  return {
    get isOpen() {
      return Boolean(nodes);
    },
    toggle(next) {
      if (nodes) close();
      else open(next);
    },
    /** Picks up account or setting changes while open, keeping what was typed. */
    refresh(next) {
      if (!nodes) return;
      data = next;
      nodes.box.classList.toggle('right', next.side === 'right');
      renderList();
    },
    close,
  };
}
