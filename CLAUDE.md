# CLAUDE.md

<br/>

## Project

- Chrome extension (Manifest V3) for switching AWS console accounts, with an account guard on console pages
- Plain ES modules, no bundler, no runtime dependencies; npm is for Jest and ESLint only
- Architecture and the provider contract: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)

<br/>

## Invariants

- **Never store or request credentials.** No passwords, access keys, session tokens or cookies, in any provider
- **A sign-in method is one module in `src/providers/` plus one registry entry.** Nothing outside the providers branches on a provider id; importers only name one to map an external format onto it
- **Console detection order is navigation info, then page markup, then the multi-session host, never merged.** The host can name the source account after a Switch Role
- **Every module the guard imports must be in `web_accessible_resources`.** `tests/manifest.test.js` enforces it, and that the bridge and guard share `data-aws-hop-nav`
- **No fixed environments.** Accounts carry a free-form `tag`, a `group` and a `guarded` flag; red is reserved for the guarded frame and never enters the color palette
- **Every user-visible string goes through `t()`** with a key present in every catalog in `src/i18n/`; `tests/i18n.test.js` enforces key and placeholder parity
- Permissions stay `storage` and `activeTab` plus the console content-script match; any addition needs a README Permissions row and a store justification

<br/>

## Commands

`make help` lists every target. Before committing: `make lint` and `make test-cover` (the coverage threshold lives in `jest.config.js`). After touching `manifest.json`, `src/content/` or the extension pages, also `make e2e`, which loads the real extension in Chrome for Testing.
