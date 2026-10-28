import { t } from '../i18n/index.js';
import { $ } from './dom.js';

const UNDO_MS = 10000;

/** The bar that offers to bring back what was just deleted, for a few seconds. */
export function createUndo({ store, reload }) {
  let restore = null;
  let timer = null;

  function hide() {
    clearTimeout(timer);
    restore = null;
    $('undo-bar').hidden = true;
  }

  $('undo').addEventListener('click', async () => {
    const pending = restore;
    hide();
    if (!pending) return;
    await store.restoreProfiles(pending.profiles, pending.order);
    await reload();
  });

  return {
    /** Deletes `doomed` and offers to restore them to their places in `order`. */
    async deleteProfiles(doomed, order) {
      await store.deleteProfiles(doomed.map((profile) => profile.id));
      clearTimeout(timer);
      restore = { profiles: doomed, order };
      $('undo-text').textContent = t('options.undo.deleted', { names: doomed.map((profile) => profile.name).join(', ') });
      $('undo-bar').hidden = false;
      timer = setTimeout(hide, UNDO_MS);
      await reload();
    },
  };
}
