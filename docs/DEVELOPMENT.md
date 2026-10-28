# Development

<br/>

## Prerequisites

- Google Chrome (the minimum version is `minimum_chrome_version` in `manifest.json`)
- Node.js and npm, for the tests and the linter only; the extension itself has no build step and no runtime dependencies

<br/>

## Local development

```bash
make install     # dev dependencies (Jest, ESLint)
make test-cover  # unit tests; fails below the coverage threshold in jest.config.js
make e2e         # the real extension in Chrome for Testing, against a mock console
make lint
make help        # every target
```

Load the repository directory as an unpacked extension (`chrome://extensions/`, Developer mode, **Load unpacked**). After a change, click the reload button on the extension card. Popup and options changes show up the next time the page opens; content-script changes also need the console tab to be reloaded.

<br/>

## Architecture

Plain ES modules, loaded straight from `src/` with no bundler. Each directory has one role:

| Directory | Role |
|---|---|
| `src/providers/` | One module per sign-in method, plus the registry in `index.js` |
| `src/lib/` | The account model, tags and colors, storage, console account detection, matching, search and remembered console sessions. No UI and no Chrome API other than storage |
| `src/importers/` | Parsers that turn `~/.aws/config`, an aws-extend-switch-roles configuration or JSON into accounts, de-duplication and merging, and the account ID command for each terminal (one `CLI_SHELLS` entry per terminal) |
| `src/i18n/` | One message catalog per language, the lookup function and the DOM helper that fills `data-i18n` attributes |
| `_locales/` | Chrome's own catalogs, for the few manifest strings Chrome shows itself |
| `src/content/` | The account guard on console pages, and the account menu behind its label |
| `src/background/` | The service worker: each console tab's badge on the toolbar icon, and the `aws` address bar keyword |
| `src/popup/`, `src/options/` | The two extension pages; thin glue over `src/lib` |

A stored account has a fixed set of common fields (`name`, `provider`, `tag`, `guarded`, `color`, `group`) and a `fields` object whose keys are defined by its sign-in method. `normalizeProfile` drops keys the method does not declare, so nothing a method does not ask for is ever stored, and it reads the `env` field that older versions stored as a tag. The store normalizes every account it loads, so the pages never see an older shape.

Two profiles are the same account to the importer when `profileTarget` says they sign in to the same place: the sign-in method plus its fields, or what the method's `targetOf` keeps of them. Names, tags and colors never count.

Each account is a separate `chrome.storage.sync` item (`profile:<id>`) with the order kept in `profileOrder`. Sync storage limits a single item to 8 KB, so one array would cap the list at a few dozen accounts.

<br/>

### How the guard runs

Content scripts declared in the manifest cannot be ES modules, and the guard needs the console's own JavaScript globals, which an isolated content script cannot see. So it runs in three pieces:

1. `nav-bridge.js` runs in the page's **main** world, reads the console navigation's account info and writes a few string fields to the `data-aws-hop-nav` attribute on `<html>`
2. `loader.js` runs in the **isolated** world and imports `guard.js` from the extension through `chrome.runtime.getURL`
3. `guard.js` detects the account (`src/lib/identity.js`), matches it to an account (`src/lib/match.js`) and draws the guard in a shadow root (`banner.js`)

On a multi-session host the guard also reports which account the page belongs to (`MSG.SESSION_SEEN`, the account only); the worker takes the session's origin from `sender.url`, never from the message, and keeps it in `chrome.storage.session` for `openUrlFor` in the popup and the address bar.

Clicking the label opens `menu.js`, built on demand and removed on close so the account list is in the page only while it is shown; it stops key events so typing never triggers console shortcuts. A pick goes to the worker as `MSG.OPEN_PROFILE` (the account id and the modifier only), and `open.js` opens it with the same rules as the popup and the address bar.

The guard also sends its toolbar badge to the service worker (`MSG.SET_BADGE`) whenever what it shows changes, and an empty one on stop. The worker sets it for the sending tab only and clears it when the tab starts loading a new page; `tabs.onUpdated` reports that status without the `tabs` permission, so the badge adds none.

A content script's `import()` can only load extension files listed in `web_accessible_resources`, so every file `guard.js` imports, directly or through another module, must be listed there. `tests/manifest.test.js` walks the imports and fails if one is missing, and it also checks that the bridge and the guard agree on the attribute name.

<br/>

### When AWS changes the console

Detection relies on console internals that AWS does not document. If the guard stops recognising accounts:

- update `CONSOLE_SELECTORS` in `src/lib/identity.js` for the page header, or the field list in `src/content/nav-bridge.js` for the navigation info
- keep the order: navigation info, then page markup, then the multi-session host, and never merge them. The host names the signed-in session, which after a Switch Role is the source account

<br/>

## End-to-end test

`make e2e` (`tests/e2e/run.mjs`) checks what unit tests cannot: that Chrome accepts the manifest, that the main-world bridge and the module loader run on console pages, that `web_accessible_resources` lets the guard's imports load, and that the pages work against real `chrome.storage` and `chrome.tabs`.

- It downloads Chrome for Testing into `~/.cache/aws-hop-e2e` on the first run, because branded Chrome ignores `--load-extension`. Set `AWS_HOP_E2E_CHROME` to use a Chromium you already have (not `CHROME_BIN`, which GitHub's Ubuntu runners point at branded Chrome)
- Every host name resolves to a local HTTPS server with a throwaway certificate, so `*.console.aws.amazon.com` serves mock console pages and the sign-in URLs the popup opens never leave the machine
- The browser is driven over the DevTools protocol with Node's built-in `WebSocket`, so the test adds no dependency
- It needs Node 22 or later and `openssl`

The mock pages stand in for the console's navigation data and header markup, so a pass says the extension is wired correctly, not that AWS still renders its console the same way. That part is checked by hand on a real console; see the README's account guard section for what the label shows and how to read where an account was detected from.

<br/>

## Adding a sign-in method

1. Create `src/providers/<name>.js` exporting one object:

   | Key | Required | Purpose |
   |---|---|---|
   | `id` | yes | Stable identifier stored with every account; never rename it |
   | `label`, `description` | yes | Message keys (see Translations), shown in the options page |
   | `short` | yes | Two to five capital letters for the popup, the same in every language |
   | `fields` | yes | The inputs the options page renders, see below |
   | `example` | yes | Valid field values; the contract test builds a URL from them |
   | `buildUrl(fields, { name, color })` | yes | Returns the https URL to open |
   | `accountOf(fields)` | yes | The canonical account ID or alias, or `null`; the guard matches on it |
   | `normalize(fields)` | no | Cross-field clean-up after each field's own `normalize` |
   | `roleOf(fields, { name })` | no | Role names the console may show for this account, to break ties |
   | `targetOf(fields)` | no | The fields that decide where it signs in, when some are cosmetic (Switch Role drops the display name) |

   Each field is `{ key, label, required, placeholder?, help?, type?, normalize?(value), validate?(value) }`. `label` and `help` are message keys; `placeholder` is a key or literal example text. `validate` returns an error message, built with `t()`, or `null`, and only runs on non-empty values. Account inputs can reuse `accountRefField` and `accountIdField` from `src/providers/fields.js`.

2. Add it to the list in `src/providers/index.js`. The list order is the order of the options page dropdown.

3. Add its message keys to every catalog in `src/i18n/`.

4. Run `make test`. `tests/providers.contract.test.js` checks every registered method, including that its labels exist in every language, so the new one is covered there without new code; add method-specific cases to `tests/providers.test.js`.

<br/>

## Translations

Every piece of text the user sees comes from `t(key, params)` in `src/i18n/index.js`, which looks the key up in the current language's catalog (`src/i18n/<language>.js`) and falls back to English. Placeholders are written `{name}`; text in backticks is rendered as `<code>` by `richText`, never parsed as HTML.

- Static text in the HTML pages carries `data-i18n` (and `data-i18n-placeholder`, `-title`, `-aria-label` for attributes); `applyTranslations` fills it. The English text written inside the element is only a fallback
- The language is the `language` setting: `auto` follows `chrome.i18n.getUILanguage()`, anything without a catalog falls back to English. Every page and the guard switch as soon as the setting changes
- `tests/i18n.test.js` fails when a catalog is missing a key, or when a translation drops a placeholder or a code span
- To add a language, add a catalog with every key, register it in `CATALOGS`, add an option to the language select on the options page and add `_locales/<language>/messages.json`

Badge text such as provider `short` names stays the same in every language. Chrome, not `t()`, shows the manifest description and the shortcut name, so those come from `_locales/<language>/messages.json` through `__MSG_…__`; the extension name stays `AWS Hop` everywhere. `tests/manifest.test.js` checks that every language has the same keys, that the description fits the store's 132 characters, and that both `make package` and the release workflow ship `_locales/`.

<br/>

## Publishing to the Chrome Web Store

```bash
make bump-version VERSION=0.2.0
make package     # writes dist/aws-hop.zip
```

Upload the ZIP in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). The listing text, the Privacy tab answers (single purpose, one justification per permission, data usage) and the reviewer test instructions are in [DESCRIPTION.md](DESCRIPTION.md); keep them in step with the Permissions table in the README. Link [Privacy](PRIVACY.md) as the privacy policy.

<br/>

## Conventions

- Commit messages follow Conventional Commits, in English
- Code comments in English, only where the reason is not obvious from the code
- Never store or request credentials. A sign-in method that needs a secret belongs to the browser's password manager or the identity provider, not here
