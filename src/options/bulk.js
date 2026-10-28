import { t } from '../i18n/index.js';
import { bulkEdit } from '../lib/listEdit.js';
import { GROUP_MAX } from '../lib/profile.js';
import { serial } from '../lib/serial.js';
import { TAG_MAX } from '../lib/tag.js';
import { $ } from './dom.js';

/** The bar that changes the tag, group or protection of every selected account at once, or deletes them. */
export function attachBulkBar({ store, reload, selection, undo, order }) {
  $('bulk-tag').maxLength = TAG_MAX;
  $('bulk-group').maxLength = GROUP_MAX;

  // Each save loads the profiles afresh, so a second quick action cannot write back what the first changed.
  const saveBulk = serial(async (ids, changes) => {
    const next = bulkEdit(await store.loadProfiles(), ids, changes);
    if (next.length) await store.saveProfiles(next);
    await reload();
  });
  const bulkSave = (changes) => saveBulk(selection.selectedIds(), changes);

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
    const doomed = selection.selectedProfiles();
    const names = doomed.map((profile) => profile.name).join(', ');
    if (!doomed.length || !confirm(t('options.bulk.confirmDelete', { count: doomed.length, names }))) return;
    await undo.deleteProfiles(doomed, order());
  });

  $('bulk-clear').addEventListener('click', () => selection.clearSelection());
}
