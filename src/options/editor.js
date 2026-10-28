import { richText } from '../i18n/dom.js';
import { t } from '../i18n/index.js';
import { groupColor } from '../lib/listEdit.js';
import { accountFromHash } from '../lib/messages.js';
import {
  buildProfileUrl, fieldValues, FIELD_PREFIX, GROUP_MAX, NAME_MAX, normalizeProfile, profileColor, sameTargetAs, validateProfile,
} from '../lib/profile.js';
import { TAG_MAX } from '../lib/tag.js';
import { carryFields, draftForAccount, getProvider, listProviders } from '../providers/index.js';
import { $, element, option } from './dom.js';

/** The add and edit dialog. */
export function createEditor({ store, profiles, reload }) {
  const dialog = $('editor');
  const form = $('editor-form');
  const providerFields = $('provider-fields');
  let editingId = null;

  // The limits validateProfile enforces, so no input can hold more than a profile accepts.
  form.elements.name.maxLength = NAME_MAX;
  form.elements.tag.maxLength = TAG_MAX;
  form.elements.group.maxLength = GROUP_MAX;

  function renderProviderFields(provider, values = {}) {
    providerFields.replaceChildren();
    $('provider-help').replaceChildren(richText(document, t(provider.description)));
    for (const field of provider.fields) {
      const label = element('label', 'field');
      const input = element('input');
      input.name = `${FIELD_PREFIX}${field.key}`;
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

  const currentFieldValues = () => fieldValues(new FormData(form));

  function readForm() {
    const data = new FormData(form);
    return normalizeProfile({
      id: editingId,
      name: data.get('name'),
      provider: data.get('provider'),
      tag: data.get('tag'),
      guarded: form.elements.guarded.checked,
      // Automatic color follows a color chosen for the whole group, so a new member matches the others.
      color: form.elements.autoColor.checked ? groupColor(profiles(), String(data.get('group') ?? '').trim()) : data.get('color'),
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
    const valid = !validateProfile(profile).length;
    $('url-preview').textContent = valid ? buildProfileUrl(profile) : '—';
    // A warning, not an error: Duplicate starts from the same sign-in on purpose.
    const twin = valid ? sameTargetAs(profiles(), profile) : null;
    $('duplicate-note').hidden = !twin;
    $('duplicate-note').textContent = twin ? t('editor.duplicateOf', { name: twin.name }) : '';
  }

  function open(profile = null) {
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
    dialog.showModal();
    form.elements.name.focus();
  }

  function fillProviderSelect() {
    const value = form.elements.provider.value;
    form.elements.provider.replaceChildren(...listProviders().map((provider) => option(provider.id, t(provider.label))));
    if (value) form.elements.provider.value = value;
  }

  /** `#add=<account>` comes from the popup's "Add this account" on an unregistered console tab. */
  function openFromHash() {
    const account = accountFromHash(location.hash);
    if (account === null) return;
    history.replaceState(null, '', location.pathname);
    open(draftForAccount(account));
  }

  form.elements.provider.addEventListener('change', () => {
    renderProviderFields(getProvider(form.elements.provider.value), carryFields(currentFieldValues()));
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
    dialog.close();
    await reload();
  });

  $('editor-cancel').addEventListener('click', () => dialog.close());
  $('add').addEventListener('click', () => open());

  return { open, openFromHash, fillProviderSelect };
}
