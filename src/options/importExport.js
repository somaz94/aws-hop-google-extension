import { t } from '../i18n/index.js';
import { exportProfiles } from '../importers/json.js';
import { droppedByReplace, importProfiles, mergeProfiles, selectImported } from '../importers/index.js';
import { $, element } from './dom.js';

function skippedList(skipped) {
  const items = element('ul');
  for (const { name, reason } of skipped) items.append(element('li', '', `${name}: ${reason}`));
  return [element('div', 'muted', t('import.result.skipped', { count: skipped.length })), items];
}

function previewStatus({ status, as }) {
  if (status === 'exists') return t('import.preview.exists', { name: as });
  return t(`import.preview.${status}`);
}

/** The import box with its preview, the merge and replace buttons, and the export button. */
export function createImportExport({ store, profiles, reload }) {
  // The parsed import and the rows cleared in its preview, so both buttons import exactly what the preview shows.
  let draft = null;
  let previewTimer = null;

  function showResult(message, skipped = [], isError = false) {
    const box = $('import-result');
    box.replaceChildren(element('div', '', message));
    if (skipped.length) box.append(...skippedList(skipped));
    box.classList.toggle('error', isError);
    box.hidden = false;
  }

  /** The parsed import for the current text; parsed again only when the text changed. Throws on a malformed file. */
  function currentImport() {
    const text = $('import-text').value;
    if (draft?.text !== text) draft = { text, result: importProfiles(text), excluded: new Set() };
    return draft;
  }

  /** Lists what the text would import, against the current accounts, with a box per account to leave it out. */
  function renderPreview() {
    const box = $('import-preview');
    if (!$('import-text').value.trim()) {
      draft = null;
      box.hidden = true;
      return;
    }
    let current;
    try {
      current = currentImport();
    } catch (error) {
      box.replaceChildren(element('div', 'error', error.message));
      box.hidden = false;
      return;
    }
    const { profiles: incoming, skipped } = current.result;
    const picked = selectImported(current.result, current.excluded).profiles;
    box.replaceChildren(element('div', '', t('import.preview.heading', { selected: picked.length, count: incoming.length })));
    const rows = element('ul', 'import-preview');
    mergeProfiles(profiles(), incoming).outcomes.forEach((outcome, index) => {
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !current.excluded.has(index);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) current.excluded.delete(index);
        else current.excluded.add(index);
        renderPreview();
      });
      const label = element('label', 'check');
      label.append(checkbox, element('span', 'name', outcome.profile.name), element('span', 'muted status', previewStatus(outcome)));
      rows.append(element('li'));
      rows.lastChild.append(label);
    });
    box.append(rows);
    const dropped = droppedByReplace(profiles(), picked);
    if (dropped.length) box.append(element('div', 'muted', t('import.preview.dropped', { names: dropped.map((profile) => profile.name).join(', ') })));
    if (skipped.length) box.append(...skippedList(skipped));
    box.hidden = false;
  }

  /** The accounts the preview has selected, or null after showing why there is nothing to import. */
  function selectedImport() {
    if (!$('import-text').value.trim()) {
      showResult(t('import.result.empty'), [], true);
      return null;
    }
    try {
      const current = currentImport();
      const { profiles: picked, nothingSelected } = selectImported(current.result, current.excluded);
      if (nothingSelected) {
        showResult(t('import.result.nothingSelected'), [], true);
        return null;
      }
      return { profiles: picked, skipped: current.result.skipped };
    } catch (error) {
      showResult(error.message, [], true);
      return null;
    }
  }

  async function applyImport(next, message, skipped) {
    try {
      await store.replaceAll(next);
    } catch (error) {
      showResult(t('editor.saveFailed', { detail: error.message }), skipped, true);
      return;
    }
    await reload();
    showResult(message, skipped);
  }

  $('import-merge').addEventListener('click', async () => {
    const result = selectedImport();
    if (!result) return;
    const merged = mergeProfiles(profiles(), result.profiles);
    const message = t('import.result.merged', { added: merged.added, updated: merged.updated, existing: merged.existing.length });
    await applyImport(merged.profiles, message, [...result.skipped, ...merged.existing]);
  });

  $('import-replace').addEventListener('click', async () => {
    const result = selectedImport();
    if (!result) return;
    if (!confirm(t('import.confirmReplace', { current: profiles().length, incoming: result.profiles.length }))) return;
    await applyImport(result.profiles, t('import.result.replaced', { count: result.profiles.length }), result.skipped);
  });

  $('import-file').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    if (file) $('import-text').value = await file.text();
    event.target.value = '';
    $('import-result').hidden = true;
    renderPreview();
  });

  $('import-text').addEventListener('input', () => {
    $('import-result').hidden = true;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 200);
  });

  $('export').addEventListener('click', () => {
    const blob = new Blob([exportProfiles(profiles())], { type: 'application/json' });
    const link = element('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'aws-hop-accounts.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  return {
    renderPreview,
    /** Skip reasons are worded when the text is parsed, so a language change parses it again. */
    reparse() {
      draft = null;
      renderPreview();
    },
  };
}
