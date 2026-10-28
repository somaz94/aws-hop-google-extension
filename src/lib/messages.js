export const MSG = Object.freeze({
  GET_IDENTITY: 'aws-hop:get-identity',
  SET_BADGE: 'aws-hop:set-badge',
  SESSION_SEEN: 'aws-hop:session-seen',
  OPEN_PROFILE: 'aws-hop:open-profile',
});

/** The options-page hash that opens the editor prefilled with `account`, for the popup's "Add this account". */
export const addAccountHash = (account) => `#add=${encodeURIComponent(account)}`;

/** The account an `#add=` hash carries, or null. */
export function accountFromHash(hash) {
  const match = /^#add=(.+)$/.exec(hash);
  return match ? decodeURIComponent(match[1]) : null;
}
