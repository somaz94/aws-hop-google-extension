// Runs in the page's main world, where the console's own globals are visible, and hands the account
// info to the isolated-world guard through an attribute. Only these string fields cross over.
(() => {
  const ATTR = 'data-aws-hop-nav'; // must match NAV_ATTR in guard.js
  const FIELDS = ['loginDisplayNameAccount', 'loginDisplayNameUser', 'roleDisplayNameAccount', 'roleDisplayNameUser'];
  const INTERVAL_MS = 500;
  const MAX_TRIES = 30;

  const publish = () => {
    let info;
    try {
      info = window.ConsoleNavService && window.ConsoleNavService.AccountInfo;
    } catch {
      return false;
    }
    if (!info || typeof info !== 'object') return false;
    const picked = {};
    for (const key of FIELDS) {
      if (typeof info[key] === 'string') picked[key] = info[key];
    }
    document.documentElement.setAttribute(ATTR, JSON.stringify(picked));
    return true;
  };

  if (publish()) return;
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (publish() || tries >= MAX_TRIES) clearInterval(timer);
  }, INTERVAL_MS);
})();
