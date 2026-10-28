import { describe, test, expect } from '@jest/globals';
import { applyBadge } from '../src/background/badge.js';

function fakeAction({ fail = false } = {}) {
  const calls = [];
  const record = (name) => async (details) => {
    if (fail) throw new Error('No tab with id: 7.');
    calls.push([name, details]);
  };
  return {
    calls,
    setBadgeText: record('text'),
    setBadgeBackgroundColor: record('background'),
    setBadgeTextColor: record('color'),
  };
}

describe('applyBadge', () => {
  test('sets the text and both colors for one tab', async () => {
    const action = fakeAction();
    await applyBadge(action, 7, { text: 'prod', color: '#d13212', textColor: '#ffffff' });
    expect(action.calls).toEqual([
      ['text', { tabId: 7, text: 'prod' }],
      ['background', { tabId: 7, color: '#d13212' }],
      ['color', { tabId: 7, color: '#ffffff' }],
    ]);
  });

  test('clearing only empties the text', async () => {
    const action = fakeAction();
    await applyBadge(action, 7, null);
    expect(action.calls).toEqual([['text', { tabId: 7, text: '' }]]);
  });

  test('a tab that closed in the meantime is not an error', async () => {
    await expect(applyBadge(fakeAction({ fail: true }), 7, { text: '?', color: '#545b64', textColor: '#ffffff' })).resolves.toBeUndefined();
  });
});
