/** Shows `badge` ({ text, color, textColor }) on the toolbar icon for one tab, or clears it when `badge` is null. */
export async function applyBadge(action, tabId, badge) {
  try {
    await action.setBadgeText({ tabId, text: badge?.text ?? '' });
    if (!badge) return;
    await Promise.all([
      action.setBadgeBackgroundColor({ tabId, color: badge.color }),
      action.setBadgeTextColor({ tabId, color: badge.textColor }),
    ]);
  } catch {
    // The tab closed between the message and the call.
  }
}
