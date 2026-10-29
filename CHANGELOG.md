# Changelog

All notable changes to this project will be documented in this file.

## [v0.3.0](https://github.com/somaz94/aws-hop-google-extension/compare/v0.2.0...v0.3.0) (2026-10-29)

### Features

- add ungroup actions and carry group colors when accounts move ([f74fe6f](https://github.com/somaz94/aws-hop-google-extension/commit/f74fe6f5da5369e2c96e9174557207bd3223583a))
- mark accounts with a remembered console session in the popup ([0de2594](https://github.com/somaz94/aws-hop-google-extension/commit/0de25945941aa890f9f5d8465f3b28873b9c6c42))
- group the options account list with per-group edit actions ([1d7dc19](https://github.com/somaz94/aws-hop-google-extension/commit/1d7dc19e2c94b7371d25f74e36df35b27de0ec0a))
- offer to undo account deletes on the options page ([e375015](https://github.com/somaz94/aws-hop-google-extension/commit/e375015aab7e12f58dd5228a43fc4a95678751c3))
- include settings in the JSON export and offer them on import ([de1ba0d](https://github.com/somaz94/aws-hop-google-extension/commit/de1ba0d15b0e565921e39d441183a02251abb8f6))
- warn when an account signs in to the same place as another ([28c70ad](https://github.com/somaz94/aws-hop-google-extension/commit/28c70ad8d0761642b7c9b4d9a9a58a592cff5eb1))
- add a system, light or dark theme setting ([f04f926](https://github.com/somaz94/aws-hop-google-extension/commit/f04f926877b6a942901310c6cc3c64275c3e238b))
- add search, drag reorder and bulk edit to the account list ([8f2f6c5](https://github.com/somaz94/aws-hop-google-extension/commit/8f2f6c56d5d1550a77ca1bb5aa19adef9e6d8447))

### Bug Fixes

- drop the group from account rows under a group heading ([65f7b7e](https://github.com/somaz94/aws-hop-google-extension/commit/65f7b7e77cc82ca917d0d561a2c2162ca2ae6a6c))
- lay out the options bulk edit bar in rows by function ([14f1fa5](https://github.com/somaz94/aws-hop-google-extension/commit/14f1fa5072e9bd8ccb462581d7785d67a71ffdc4))

### Performance Improvements

- coalesce overlapping account list reloads on the options page ([af3396c](https://github.com/somaz94/aws-hop-google-extension/commit/af3396cc3b1a9919e7c407840d8331036429c677))

### Code Refactoring

- share picker keys and keep provider details in the providers ([af1212a](https://github.com/somaz94/aws-hop-google-extension/commit/af1212a89bf9089242b5edaeed5894d444a4e84b))
- split the options page into per-panel modules ([5ec19b1](https://github.com/somaz94/aws-hop-google-extension/commit/5ec19b132f67972c7b57b021bee4336ad6ef13f0))
- share open rules, serial queue and setting save helpers ([04cfb41](https://github.com/somaz94/aws-hop-google-extension/commit/04cfb41d87e43c3aa758075d3203089d5439a605))
- share account label, meta line and language setup helpers ([3ff573d](https://github.com/somaz94/aws-hop-google-extension/commit/3ff573da7b7fd271483983ef423ecfeaa1c2385e))

### Chores

- bump version to 0.3.0 ([82ea6cd](https://github.com/somaz94/aws-hop-google-extension/commit/82ea6cd9ca9b50abed6f7a3366e08b8d751de2bb))
- time out DevTools calls in the store screenshot script ([46aaef3](https://github.com/somaz94/aws-hop-google-extension/commit/46aaef368bf1cf3af93a5c2d025424780805a56a))
- add store screenshots, Korean listing and their generator ([a6fde01](https://github.com/somaz94/aws-hop-google-extension/commit/a6fde01abd0716de817ccdb280369e6fd0947b4d))

### Contributors

- somaz

<br/>

## [v0.2.0](https://github.com/somaz94/aws-hop-google-extension/compare/v0.1.0...v0.2.0) (2026-10-28)

### Features

- keep console sessions across updates and restarts for 12 hours ([fba8a3e](https://github.com/somaz94/aws-hop-google-extension/commit/fba8a3eb53076592c4ec0329bcfaa7d57ea728b1))
- switch accounts from a menu behind the console guard label ([27af4f9](https://github.com/somaz94/aws-hop-google-extension/commit/27af4f9cda1a794bbfaee118b1b1f83a7cb935b4))
- open accounts straight in their multi-session console session ([6f2cfef](https://github.com/somaz94/aws-hop-google-extension/commit/6f2cfefc0da29f5701f42b2a801f8583af1bcbe0))
- preview imported accounts and import only the selected ones ([cae5102](https://github.com/somaz94/aws-hop-google-extension/commit/cae5102e2cb750ec15e5c437efe7ab6ef9c1731b))
- add an aws omnibox keyword and a guard label position setting ([d2ad853](https://github.com/somaz94/aws-hop-google-extension/commit/d2ad853129ee7271816a8622454ad003756bd0db))
- show the tab's account as a badge on the toolbar icon ([4dadbd3](https://github.com/somaz94/aws-hop-google-extension/commit/4dadbd360d8ffda0939f8f76ce66349313290cdb))
- localize the extension description and shortcut name ([f8bf55e](https://github.com/somaz94/aws-hop-google-extension/commit/f8bf55ed198a19c290414f26d4e6ece4cc25d29f))
- list recent accounts first and optionally confirm protected ones ([7041a81](https://github.com/somaz94/aws-hop-google-extension/commit/7041a8139ef47bda0d524312dd276ea1e21cfd90))
- import aws-extend-switch-roles configurations ([f58003f](https://github.com/somaz94/aws-hop-google-extension/commit/f58003fde88dc84c7076058c68c826a569ca97e2))

### Bug Fixes

- keep both settings when two are changed back to back ([dd48695](https://github.com/somaz94/aws-hop-google-extension/commit/dd48695a6f34a7707299993cac4c2cf35f27b81f))
- shorten the Korean extension description to a noun phrase ([1de5002](https://github.com/somaz94/aws-hop-google-extension/commit/1de50027d52e27c3ca4cdc563bf06c647737c0df))
- say Prod accounts in the Korean store summary ([934fb9e](https://github.com/somaz94/aws-hop-google-extension/commit/934fb9eccc2907253f5fe755a171ba5d735fabf9))

### Documentation

- link the Chrome Web Store listing and explain Region selection ([438bc5a](https://github.com/somaz94/aws-hop-google-extension/commit/438bc5a19be5c81e074b776024505f5822ffcdb8))
- add the Chrome Web Store listing text ([891246a](https://github.com/somaz94/aws-hop-google-extension/commit/891246a6695599bbfe95816648182b6147a7b53c))

### Tests

- time out unanswered DevTools calls and use a mock keychain ([c40528a](https://github.com/somaz94/aws-hop-google-extension/commit/c40528a3c1ec14518ddc7fcc1a20c5fcf4ce7642))
- wait for the options page to load before checking the CLI helper ([8308d2c](https://github.com/somaz94/aws-hop-google-extension/commit/8308d2c6b6e1d3df8763c281195f106e020211cc))

### Continuous Integration

- move the release action to its Node 24 major ([47e7af5](https://github.com/somaz94/aws-hop-google-extension/commit/47e7af5455688ce8af5c95e21fe936fc8ef12dd1))

### Chores

- bump version to 0.2.0 ([093ce48](https://github.com/somaz94/aws-hop-google-extension/commit/093ce48c3346926c1910a3ad3fca1554803064e3))

### Contributors

- somaz

<br/>

## [v0.1.0](https://github.com/somaz94/aws-hop-google-extension/releases/tag/v0.1.0) (2026-10-27)

### Features

- offer the account ID command for macOS, Windows and Linux ([e9b9697](https://github.com/somaz94/aws-hop-google-extension/commit/e9b96971311c39e6f244a34f319a16cdcc474d68))
- add tags, protected accounts, Korean UI and duplicate-free import ([4f5ff04](https://github.com/somaz94/aws-hop-google-extension/commit/4f5ff041bdd338600f05c30af0f71a1c93c7e319))
- add AWS Hop extension with four sign-in methods and a production guard ([f69f1f5](https://github.com/somaz94/aws-hop-google-extension/commit/f69f1f597ede8cbea08b8f77bb8f11d901cd13c6))

### Bug Fixes

- restructure import help, wrap Korean by word and apply Korean review fixes ([e00885c](https://github.com/somaz94/aws-hop-google-extension/commit/e00885cbb146b6b8b8febb76d4959d8559343543))

### Tests

- stop the e2e run from using the runner's branded Chrome ([f76e0f9](https://github.com/somaz94/aws-hop-google-extension/commit/f76e0f975268c662f028ee5cc154ffc228e54f4d))
- ask Chrome for the extension ID in the e2e run instead of deriving it ([cf0ecc6](https://github.com/somaz94/aws-hop-google-extension/commit/cf0ecc6e71cc58b6472995d538c76baf2b26e513))

### Continuous Integration

- back up the repository to GitLab ([fb27d0b](https://github.com/somaz94/aws-hop-google-extension/commit/fb27d0b8077a6fd5a36e65e60b8818c804c75927))
- add test, release and repository automation workflows ([774b816](https://github.com/somaz94/aws-hop-google-extension/commit/774b81679654de0bde15013254f9ac79aa4790b6))

### Contributors

- somaz

<br/>

