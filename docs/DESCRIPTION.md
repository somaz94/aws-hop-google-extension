# Chrome Web Store Listing

The text pasted into the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) for AWS Hop. The item name and summary come from `name` and `description` in `manifest.json`, so they are not repeated here.

<br/>

## Store listing

### Description

```text
AWS Hop switches between your AWS console accounts in one click, and marks every console tab with the account it is in, so production never looks like a sandbox.

It never asks for a password, an access key or a session token. Every sign-in still happens on AWS's own pages; AWS Hop only knows where to send you.

Sign-in methods
- IAM user sign-in: opens your account's sign-in page with the account filled in
- Switch Role: opens the Switch Role page with the account, role, display name and color filled in
- IAM Identity Center (SSO): opens the console through your access portal, on both awsapps.com and app.aws portals
- Custom URL: any sign-in link, such as an IdP-initiated SAML link from Okta, Entra ID or Google Workspace

Account guard
- A colored stripe and label on every AWS console page, showing which account and role the tab is in
- Protected accounts get a red frame and their name in front of the tab title
- The toolbar icon shows the tab's tag as a badge, on red for protected accounts
- Accounts you have not added get a gray label, and the popup offers to add them

Your accounts, your labels
- Free-form tags (prod, qa, a project name), a color per project and a protected flag
- Type to filter in the popup, then arrow keys and Enter; Alt+Shift+A opens it. Recently opened accounts come first, and protected accounts can be set to need a second Enter
- Import from ~/.aws/config, one entry per account however many profiles point at it, from an aws-extend-switch-roles configuration, or from a JSON export
- A ready-to-copy command for macOS, Windows (PowerShell) and Linux that looks up the account ID of every AWS CLI profile
- Accounts sync across your Chrome browsers
- English and Korean

Privacy
- Stores only the account names, account IDs, role names, portal URLs and labels you enter, in Chrome sync storage; the recently opened list stays on the browser
- No network requests, no analytics, no server
- Open source: https://github.com/somaz94/aws-hop-google-extension

AWS Hop is not affiliated with or endorsed by Amazon Web Services.
```

### Category

Developer Tools

### Language

English

### Additional fields

| Field | Value |
|---|---|
| Homepage URL | `https://github.com/somaz94/aws-hop-google-extension` |
| Support URL | `https://github.com/somaz94/aws-hop-google-extension/issues` |
| Mature content | No |

<br/>

## Privacy practices

### Single purpose

```text
Switch between AWS console accounts and show which account each AWS console tab is signed in to.
```

### Permission justification

`storage`

```text
Saves the user's account list (account names, account IDs or aliases, role names, portal URLs, tags, groups and colors) and settings in chrome.storage.sync, so the popup can list them and they sync between the user's own browsers. The IDs of the last five accounts opened from the popup are kept in chrome.storage.local on that browser only, to list them first; turning the setting off deletes them. No password, access key, session token or cookie is ever stored.
```

`activeTab`

```text
When the user opens the popup, it reads the address of the current tab and asks the AWS Hop script on that AWS console page which account the tab is in, to highlight that account in the list or offer to add it. Nothing is stored or sent.
```

Host permission (`https://*.console.aws.amazon.com/*`)

```text
The content script runs only on AWS console pages. It reads the account ID, account alias and role name that the console shows for the current session and draws a colored stripe and label, plus a red frame for accounts the user marked as protected, so the user can tell which account a tab is in before changing anything. That information stays in the page; it is not stored or sent anywhere.
```

### Remote code

No. Every script ships in the package; the content script imports only modules bundled with the extension.

### Data usage

Check none of the data types, then certify all three statements (not sold to third parties, not used for purposes unrelated to the single purpose, not used for creditworthiness or lending).

### Privacy policy URL

`https://github.com/somaz94/aws-hop-google-extension/blob/main/docs/PRIVACY.md`

<br/>

## Test instructions

```text
No credentials are needed. The popup and the options page work without an AWS account: on the options page, add an account (for example IAM user sign-in with account ID 111122223333) and open it from the popup, which opens the AWS sign-in page for that account. The account guard appears on *.console.aws.amazon.com pages once you are signed in to any AWS account.
```
