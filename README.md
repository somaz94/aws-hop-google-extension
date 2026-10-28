# AWS Hop

A Chrome extension for hopping between AWS console accounts, with a guard on every console page that shows which account the tab is in and marks the ones you must be careful with.

It never stores a password, an access key or a session token. Every sign-in still happens on AWS's own pages; AWS Hop only knows where to send you.

<br/>

## Features

- **One popup for every account**: type to filter, arrow keys and Enter to open, accounts grouped by project, the ones you opened last at the top
- **Address bar**: type `aws`, a space and part of an account name to open it without the popup
- **Four sign-in methods**: IAM user sign-in, Switch Role, IAM Identity Center and any custom URL, each a self-contained module, so a new method is one file
- **Your own labels**: a free-form tag per account (`prod`, `qa`, a project name, whatever fits), a color shared by each project, and a protected flag for accounts where a mistake is costly
- **Account guard**: a colored stripe and label on every console page and a badge on the toolbar icon, plus a red frame and a tab-title prefix for protected accounts
- **Import** from `~/.aws/config` (one entry per account, however many profiles point at it), an [aws-extend-switch-roles](https://github.com/tilfinltd/aws-extend-switch-roles) configuration or a JSON export; accounts sync across your Chrome browsers
- **English and Korean**, following the browser language or chosen in the settings

<br/>

## Sign-in methods

| Method | Opens | What you still do |
|---|---|---|
| IAM user sign-in | `https://<account>.signin.aws.amazon.com/console` | Sign in; the account is filled in and the browser password manager fills the rest |
| Switch Role | `https://signin.aws.amazon.com/switchrole?account=…&roleName=…&displayName=…&color=…` | Click **Switch Role** once. You must already be signed in to a source account allowed to assume the role |
| IAM Identity Center (SSO) | `<access portal URL>/#/console?account_id=…&role_name=…` | Nothing while your portal session is alive. Works with both `*.awsapps.com` and dual-stack `*.app.aws` portals, and can land on a console page of your choice |
| Custom URL | The URL you enter, such as an IdP-initiated SAML link from Okta, Entra ID or Google Workspace | Whatever your IdP asks for |

AWS documents `account` and `roleName` for the Switch Role page; `displayName` and `color` are undocumented prefill parameters that AWS may ignore.

With the console's [multi-session support](https://docs.aws.amazon.com/awsconsolehelpdocs/latest/gsg/multisession.html) turned on you can stay signed in to up to five identities at once; keep opening accounts in a new tab, the default, to use it. Without help, every sign-in address lands on the console's session picker once two sessions are open, so AWS Hop remembers which session each account's console tab is in and opens that account straight in it. An account with no session yet still goes through its sign-in method, where you choose **Sign into new session**. The remembered sessions stay on this browser, survive an extension update or a browser restart, and are forgotten 12 hours after the account's console tab was last seen, which is no sooner than AWS ends the session itself.

AWS Hop does not choose a Region: none of these addresses carries one, so the console opens in the Region AWS picks for you. To pin it, set **Default Region** in the console's Unified Settings. For IAM Identity Center, a console page in the destination field, such as `https://ap-northeast-2.console.aws.amazon.com/ec2/home?region=ap-northeast-2`, also sets the Region.

<br/>

## Tags, groups and protected accounts

Environments differ from project to project, so AWS Hop does not impose any. Each account has:

| Setting | What it does |
|---|---|
| **Tag** | A short label on the popup badge and the console label, such as `prod`, `qa` or `dr`. Tags you have used before are suggested |
| **Group** | Lists related accounts together under one heading, usually a project |
| **Color** | Picked automatically from the group, or from the first word of the name without one, so `shop-prod` and `shop-dev` share a color. You can choose your own |
| **Protected** | Frames the console in red and prefixes the tab title with the account name. Turn it on for every account where a mistake is costly; there can be as many as you like, and the name prefix keeps their tabs apart |

The tag and the protected flag can be changed straight from the account list in the options. The list can be searched, and reordered by dragging a row by its handle or with its arrow buttons; reordering pauses while a search is active, because results are ranked. Tick several accounts, or Shift-click to tick every account up to one, to set their tag or group, protect or unprotect them, or delete them in one go. A delete can be undone for a few seconds afterwards.

<br/>

## Account guard

On every `*.console.aws.amazon.com` page, AWS Hop looks up the account you are in and draws:

- a stripe across the top and a label in the lower left (or lower right, in the settings), in the account's color (hover it to see where the account was detected from)
- an account menu when you click that label: type to filter, then Enter or a click opens the account the way the popup does, in its own session when one is open; **–** shrinks the label to a dot, and clicking the dot brings it back
- for protected accounts, a red frame around the whole page and the account name in front of the tab title, such as `[shop-prod] EC2`
- for accounts that are not in your list, a gray label (can be turned off). The popup then offers **Add**, which opens the add dialog with the account ID filled in
- a badge on the toolbar icon while that tab is active: the account's tag, or the start of its name without one, in its color, on red for protected accounts and `?` for accounts not in your list

The account is read from the first source that answers, in this order:

1. the console navigation's own account information
2. the account ID shown in the page header
3. the multi-session address (`<account-id>-<suffix>.<region>.console.aws.amazon.com`)

The first two are not public AWS interfaces. If AWS changes the console header, the guard falls back to the address, which only carries the account when multi-session is on; the selectors to update are in `src/lib/identity.js`. Sources are never mixed, because after a Switch Role the address can still name the source account.

When several of your accounts share an account ID (an IAM user and a role in the same account, say), the one whose role name matches the console wins.

<br/>

## Installation

### From Chrome Web Store
1. Visit [AWS Hop](https://chromewebstore.google.com/detail/aws-hop/ifdkceilmpdbnpongohnpbnkoipjapli)
2. Click **Add to Chrome**

### From Source

```bash
git clone https://github.com/somaz94/aws-hop-google-extension.git
```

1. Open `chrome://extensions/`
2. Turn on **Developer mode**
3. Click **Load unpacked** and select the cloned directory

<br/>

## Usage

1. Open the options page (the gear in the popup) and add your accounts, or import them
2. Give accounts a tag and a group if they help, and tick **Protected** on the ones where a mistake is costly
3. Open the popup with the toolbar icon or `Alt+Shift+A` (change it at `chrome://extensions/shortcuts`)
4. Type to filter, then press Enter or click

Once the list is longer than five accounts, the popup starts with the ones you opened most recently on this browser; turn it off in the settings, which also forgets the list. Another setting makes a protected account wait for a second Enter or click before it opens.

From the address bar, type `aws`, a space and part of a name, tag or account ID: Enter opens the first suggestion, or pick another. Alt+Enter always opens a new tab. With the second-Enter setting on, a protected account opens from the address bar only by its full name or by picking it from the suggestions.

The popup opens accounts in a new tab by default. Shift, Ctrl or Cmd with Enter or a click, or a middle click, opens in the other place; the default can be switched in the options. The language setting offers the browser language, English or Korean, and the theme setting the system appearance, light or dark.

<br/>

## Importing from `~/.aws/config`

Paste the file into the Import box, or load it. Each profile is mapped by what it contains:

| Profile has | Becomes |
|---|---|
| `sso_account_id` and `sso_role_name` (with `sso_start_url` or an `sso_session`) | IAM Identity Center |
| `role_arn` | Switch Role |
| `aws_account_id` | IAM user sign-in |

Three optional keys are read as well: `tag`, `group` and `color` (a hex color). `env`, the key's name before tags were free-form, is read as `tag`. A profile whose name or tag reads like production (`prod`, `live`) is marked protected.

Profiles that sign in to the same place are imported once. When `default`, `shop` and `terraform-shop` all point at one account, only `shop` comes in: any name wins over `default`, then the shortest. Profiles for accounts already in your list are not added again, and importing again never overwrites the tags, groups, colors and protection you set in AWS Hop.

Profiles that only hold access keys carry no account ID. The Import section has a command that looks every profile's account up with `aws sts get-caller-identity` and writes it in the import format: a shell loop for macOS and Linux, a PowerShell one for Windows, picked for your system and switchable. On macOS and Windows the result goes straight to the clipboard; paste it and merge.

```ini
[sso-session corp]
sso_start_url = https://example.awsapps.com/start
sso_region = us-east-1

[profile shop-prod]
sso_session = corp
sso_account_id = 111122223333
sso_role_name = AdministratorAccess
group = Shop

[profile shop-dev]
role_arn = arn:aws:iam::444455556666:role/Developer
source_profile = default
tag = dev
group = Shop
```

<br/>

## Moving from aws-extend-switch-roles

Paste the configuration from its Configure page into the Import box. It is told apart from `~/.aws/config` by the keys only that extension uses (`role_name`, `target_role_name`, `aws_account_alias`) or by profile sections without the `profile ` prefix.

| Profile | Becomes |
|---|---|
| A target role: `role_arn`, or `aws_account_id` with `role_name` | Switch Role, grouped under its `source_profile` |
| A target with `aws_account_id` only, whose base account sets `target_role_name` | Switch Role with that role |
| A base account (named by another profile's `source_profile`) | IAM user sign-in, heading its own group |

`color` is kept. `region`, `image` and `target_region` have no equivalent and are ignored. A base account with `role_name` signs in through a federated role whose method AWS Hop cannot tell, so it is skipped with a note; add it with the sign-in method you use.

<br/>

## Merge, replace and export

**Merge** adds new accounts and updates ones with the same name and sign-in method. **Replace** swaps the whole list. **Export** downloads every account, and the settings, as JSON.

As soon as you paste or load a file, a preview lists each account it holds as new, an update, or already in your list, and which accounts **Replace** would remove. Clear an account's box to leave it out; both buttons import only what stays selected. An AWS Hop export also offers to apply the settings saved in it.

<br/>

## Permissions

| Permission | Why |
|---|---|
| `storage` | Keeps your account list and settings in Chrome sync storage, and the recently opened accounts in local storage on this browser |
| `activeTab` | Reads the address of the current tab when you open the popup, to mark the account you are in |
| Access to `*.console.aws.amazon.com` | Runs the account guard on console pages |

AWS Hop makes no network requests and has no access to the AWS sign-in pages.

<br/>

## Privacy

AWS Hop stores only what you enter: account names, account IDs or aliases, role and permission set names, portal URLs, tags, groups and colors. It stores them in `chrome.storage.sync`, which Chrome syncs between the browsers you are signed in to, and sends them nowhere else. With multi-session support on, it also keeps the address of each account's open console session on that browser, for 12 hours after it last saw it. See [Privacy](docs/PRIVACY.md).

<br/>

## Documentation

- [Development](docs/DEVELOPMENT.md): local setup, architecture, translations, adding a sign-in method, publishing
- [Privacy](docs/PRIVACY.md): what is stored and where

<br/>

## License

[MIT](LICENSE)
