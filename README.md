# AWS Hop

A Chrome extension for hopping between AWS console accounts, with a production guard that shows which account the current tab is in.

It never stores a password, an access key or a session token. Every sign-in still happens on AWS's own pages; AWS Hop only knows where to send you.

<br/>

## Features

- **One popup for every account**: type to filter, arrow keys and Enter to open, groups for related accounts
- **Four sign-in methods**: IAM user sign-in, Switch Role, IAM Identity Center and any custom URL, each a self-contained module, so a new method is one file
- **Production guard**: a colored stripe, a label with the account and, for production, a frame around the page and a `[PROD]` tab title
- **Import** from `~/.aws/config` or a JSON export; accounts sync across your Chrome browsers

<br/>

## Sign-in methods

| Method | Opens | What you still do |
|---|---|---|
| IAM user sign-in | `https://<account>.signin.aws.amazon.com/console` | Sign in; the account is filled in and the browser password manager fills the rest |
| Switch Role | `https://signin.aws.amazon.com/switchrole?account=…&roleName=…&displayName=…&color=…` | Click **Switch Role** once. You must already be signed in to a source account allowed to assume the role |
| IAM Identity Center (SSO) | `<access portal URL>/#/console?account_id=…&role_name=…` | Nothing while your portal session is alive. Works with both `*.awsapps.com` and dual-stack `*.app.aws` portals, and can land on a console page of your choice |
| Custom URL | The URL you enter, such as an IdP-initiated SAML link from Okta, Entra ID or Google Workspace | Whatever your IdP asks for |

AWS documents `account` and `roleName` for the Switch Role page; `displayName` and `color` are undocumented prefill parameters that AWS may ignore.

With the console's [multi-session support](https://docs.aws.amazon.com/awsconsolehelpdocs/latest/gsg/multisession.html) turned on you can stay signed in to up to five identities at once; keep opening accounts in a new tab, the default, to use it.

<br/>

## Production guard

On every `*.console.aws.amazon.com` page, AWS Hop looks up the account you are in and draws:

- a stripe across the top and a label in the lower left, in the account's color (click the label to shrink it to a dot; hover it to see where the account was detected from)
- for accounts marked **Production**, a frame around the whole page and a `[PROD]` prefix on the tab title
- for accounts that are not in your list, a gray "Unregistered account" label (can be turned off)

The account is read from the first source that answers, in this order:

1. the console navigation's own account information
2. the account ID shown in the page header
3. the multi-session address (`<account-id>-<suffix>.<region>.console.aws.amazon.com`)

The first two are not public AWS interfaces. If AWS changes the console header, the guard falls back to the address, which only carries the account when multi-session is on; the selectors to update are in `src/lib/identity.js`. Sources are never mixed, because after a Switch Role the address can still name the source account.

When several of your accounts share an account ID (an IAM user and a role in the same account, say), the one whose role name matches the console wins.

<br/>

## Installation

AWS Hop is not on the Chrome Web Store yet. To install it from source:

```bash
git clone https://github.com/somaz94/aws-hop-google-extension.git
```

1. Open `chrome://extensions/`
2. Turn on **Developer mode**
3. Click **Load unpacked** and select the cloned directory

<br/>

## Usage

1. Open the options page (the gear in the popup) and add your accounts, or import them
2. Give each account an environment; the environment decides the default color and whether the production guard frames the page
3. Open the popup with the toolbar icon or `Alt+Shift+A` (change it at `chrome://extensions/shortcuts`)
4. Type to filter, then press Enter or click

The popup opens accounts in a new tab by default. Shift, Ctrl or Cmd with Enter or a click, or a middle click, opens in the other place; the default can be switched in the options.

<br/>

## Importing from `~/.aws/config`

Paste the file into the Import box, or load it. Each profile is mapped by what it contains:

| Profile has | Becomes |
|---|---|
| `sso_account_id` and `sso_role_name` (with `sso_start_url` or an `sso_session`) | IAM Identity Center |
| `role_arn` | Switch Role |
| `aws_account_id` | IAM user sign-in |

Two optional keys are read as well, `env` (`prod`, `stage`, `dev`, `test` or `other`) and `color` (a hex color). Without `env`, the environment is guessed from the profile name. Profiles that only hold access keys carry no account ID, so they are listed as skipped with the reason; add `aws_account_id` to such a profile to import it.

```ini
[sso-session corp]
sso_start_url = https://example.awsapps.com/start
sso_region = us-east-1

[profile shop-prod]
sso_session = corp
sso_account_id = 111122223333
sso_role_name = AdministratorAccess

[profile shop-dev]
role_arn = arn:aws:iam::444455556666:role/Developer
source_profile = default
env = dev
```

**Merge** updates accounts that have the same name and sign-in method and adds the rest. **Replace** swaps the whole list. **Export** downloads every account as JSON.

<br/>

## Permissions

| Permission | Why |
|---|---|
| `storage` | Keeps your account list and settings in Chrome sync storage |
| `activeTab` | Reads the address of the current tab when you open the popup, to mark the account you are in |
| Access to `*.console.aws.amazon.com` | Runs the production guard on console pages |

AWS Hop makes no network requests and has no access to the AWS sign-in pages.

<br/>

## Privacy

AWS Hop stores only what you enter: account names, account IDs or aliases, role and permission set names, portal URLs, colors and groups. It stores them in `chrome.storage.sync`, which Chrome syncs between the browsers you are signed in to, and sends them nowhere else. See [Privacy](docs/PRIVACY.md).

<br/>

## Documentation

- [Development](docs/DEVELOPMENT.md): local setup, architecture, adding a sign-in method, publishing
- [Privacy](docs/PRIVACY.md): what is stored and where

<br/>

## License

[MIT](LICENSE)
