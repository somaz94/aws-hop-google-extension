# Privacy

AWS Hop does not collect, transmit or sell any data.

<br/>

## What is stored

Only what you enter on the options page or import:

- account names, tags, groups, colors and which accounts are protected
- AWS account IDs or aliases
- IAM role names, IAM Identity Center permission set names and access portal URLs
- custom sign-in URLs
- your AWS Hop settings
- which of your accounts you opened most recently (up to five, by their AWS Hop entry), unless you turn the recent list off
- with the console's multi-session support, the address of the console session each of your accounts is open in (such as `https://111122223333-abcd1234.us-east-1.console.aws.amazon.com`), so the account opens straight in it

AWS Hop never asks for, reads or stores passwords, access keys, session tokens or cookies.

<br/>

## Where it is stored

In `chrome.storage.sync`, except the recently opened list, which stays in `chrome.storage.local` on that one browser and is deleted when you turn the recent list off, and the session addresses, which also stay in `chrome.storage.local` on that browser and are dropped 12 hours after the session was last seen. Chrome keeps it in your browser profile and, if you are signed in to Chrome with sync turned on, syncs it to your other browsers through your Google account. AWS Hop has no server and makes no network requests.

<br/>

## What the extension reads

On `*.console.aws.amazon.com` pages, the account guard reads the account ID, account alias and role name that the console shows for the current session, to decide which label to draw. That information stays in the page; it is not stored or sent anywhere. On a multi-session page, the guard tells the extension which of your accounts the page belongs to, and the extension keeps the page's address as described above. When you click the guard's label, your account names are drawn in a menu on the console page until you close it.

When you open the popup, it reads the address of the current tab to mark the account you are in.

<br/>

## Removing your data

Delete accounts on the options page. Export first if you want a copy.
