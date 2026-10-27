# Privacy

AWS Hop does not collect, transmit or sell any data.

<br/>

## What is stored

Only what you enter on the options page or import:

- account names, groups, environments and colors
- AWS account IDs or aliases
- IAM role names, IAM Identity Center permission set names and access portal URLs
- custom sign-in URLs
- your AWS Hop settings

AWS Hop never asks for, reads or stores passwords, access keys, session tokens or cookies.

<br/>

## Where it is stored

In `chrome.storage.sync`. Chrome keeps it in your browser profile and, if you are signed in to Chrome with sync turned on, syncs it to your other browsers through your Google account. AWS Hop has no server and makes no network requests.

<br/>

## What the extension reads

On `*.console.aws.amazon.com` pages, the production guard reads the account ID, account alias and role name that the console shows for the current session, to decide which label to draw. That information stays in the page; it is not stored or sent anywhere.

When you open the popup, it reads the address of the current tab to mark the account you are in.

<br/>

## Removing your data

Delete accounts on the options page. Export first if you want a copy.
