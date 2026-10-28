import { applyTranslations } from '../i18n/dom.js';
import { applyLanguageSetting } from '../i18n/index.js';
import { createRecentStore } from '../lib/recent.js';
import { serial } from '../lib/serial.js';
import { createStore, DEFAULT_SETTINGS, saveSetting } from '../lib/store.js';
import { createThemer } from '../lib/theme.js';
import { attachBulkBar } from './bulk.js';
import { createCliHelper } from './cliHelper.js';
import { $ } from './dom.js';
import { createEditor } from './editor.js';
import { createImportExport } from './importExport.js';
import { createAccountList } from './list.js';
import { createUndo } from './undo.js';

const store = createStore();
const themer = createThemer(document);
let profiles = [];
let settings = null;
const currentProfiles = () => profiles;

async function reload() {
  profiles = await store.loadProfiles();
  accounts.render();
  importExport.renderPreview();
}

const editor = createEditor({ store, profiles: currentProfiles, reload });
const undo = createUndo({ store, reload });
const accounts = createAccountList({ store, profiles: currentProfiles, reload, onEdit: editor.open, undo });
attachBulkBar({ store, reload, selection: accounts, undo, order: () => profiles.map((profile) => profile.id) });
const importExport = createImportExport({ store, profiles: currentProfiles, settings: () => settings, reload });
const cliHelper = createCliHelper();

// Every setting has an input with the id setting-<key>.
const SETTING_INPUTS = Object.keys(DEFAULT_SETTINGS);
const settingInput = (key) => $(`setting-${key}`);

function applySettings(next) {
  settings = next;
  themer.apply(settings.theme);
  applyLanguageSetting(settings, chrome.i18n.getUILanguage());
  applyTranslations(document);
  editor.fillProviderSelect();
  cliHelper.render();
  accounts.render();
  importExport.reparse();
}

async function loadSettings() {
  const loaded = await store.loadSettings();
  for (const key of SETTING_INPUTS) {
    const input = settingInput(key);
    if (input.type === 'checkbox') input.checked = loaded[key];
    else input.value = loaded[key];
  }
  applySettings(loaded);
}

const saveSettingInOrder = serial((key, value) => saveSetting(store, key, value, { recent: createRecentStore() }));

for (const key of SETTING_INPUTS) {
  settingInput(key).addEventListener('change', () => {
    const input = settingInput(key);
    saveSettingInOrder(key, input.type === 'checkbox' ? input.checked : input.value);
  });
}

store.onChange((changed) => {
  if (changed.profiles) reload();
  if (changed.settings) loadSettings();
});

async function init() {
  cliHelper.setPlatform((await chrome.runtime.getPlatformInfo()).os);
  profiles = await store.loadProfiles();
  await loadSettings();
  $('cli-helper').open = profiles.length === 0;
  editor.openFromHash();
}

init();
