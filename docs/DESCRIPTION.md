# Chrome Web Store Listing

The text pasted into the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) for AWS Hop. The item name and summary come from `name` and the `_locales` description, so they are not repeated here.

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
- The label sits in the lower left or lower right corner, your choice
- Accounts you have not added get a gray label, and the popup offers to add them
- Click the label to switch to another account right from the console page

Your accounts, your labels
- Free-form tags (prod, qa, a project name), a color per project and a protected flag
- A long list stays manageable in the options: search it, drag accounts into order, and change the tag, group or protection of many accounts at once
- Type to filter in the popup, then arrow keys and Enter; Alt+Shift+A opens it. Recently opened accounts come first, and protected accounts can be set to need a second Enter
- Or skip the popup: type aws and an account name in the address bar
- With the console's multi-session support, an account that is already signed in opens straight in its own session instead of the session picker
- Import from ~/.aws/config, one entry per account however many profiles point at it, from an aws-extend-switch-roles configuration, or from a JSON export, with a preview where you leave out the accounts you do not want
- A ready-to-copy command for macOS, Windows (PowerShell) and Linux that looks up the account ID of every AWS CLI profile
- Accounts sync across your Chrome browsers
- English and Korean, in a light or dark theme or following your system

Privacy
- Stores only the account names, account IDs, role names, portal URLs and labels you enter, in Chrome sync storage; the recently opened list and open console session addresses stay on the browser
- No network requests, no analytics, no server
- Open source: https://github.com/somaz94/aws-hop-google-extension

AWS Hop is not affiliated with or endorsed by Amazon Web Services.
```

### Category

Developer Tools

### Language

English is the default listing. The Korean listing uses [`store/listing-ko.txt`](../store/listing-ko.txt) as its description; that text is kept outside `docs/` because it is translated product copy, like `_locales/ko`, not documentation. Keep it in step with the English description above.

### Screenshots

Upload `store/screenshots/en/` to the default listing and `store/screenshots/ko/` as the Korean localized screenshots, in file order. `make store-screenshots` redraws both sets from the extension itself (the example accounts and the slide copy are in `hack/store-screenshots.mjs` and `hack/store-slide.html`); run it after a change to the popup or the options page.

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
Saves the user's account list (account names, account IDs or aliases, role names, portal URLs, tags, groups and colors) and settings in chrome.storage.sync, so the popup can list them and they sync between the user's own browsers. The IDs of the last five accounts opened from the popup are kept in chrome.storage.local on that browser only, to list them first; turning the setting off deletes them. With the console's multi-session support, the address of the console session each account is open in is kept in chrome.storage.local on that browser only, and ignored 12 hours after it was last seen, so the account opens straight in that session. No password, access key, session token or cookie is ever stored.
```

`activeTab`

```text
When the user opens the popup, it reads the address of the current tab and asks the AWS Hop script on that AWS console page which account the tab is in, to highlight that account in the list or offer to add it. Nothing is stored or sent.
```

Host permission (`https://*.console.aws.amazon.com/*`)

```text
The content script runs only on AWS console pages. It reads the account ID, account alias and role name that the console shows for the current session and draws a colored stripe and label, plus a red frame for accounts the user marked as protected, so the user can tell which account a tab is in before changing anything. That information stays in the page; it is not stored or sent anywhere. On a multi-session console page the script tells the extension which of the user's accounts the page belongs to, and the extension keeps that page's address on the browser as described under storage. When the user clicks the label, the script lists the user's own accounts in a menu on the page until it closes, and asks the extension to open the one picked.
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
