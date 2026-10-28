/**
 * Wraps an async function so its calls run one after another, each once the previous one has settled. Two quick
 * saves that each read, change and write the same storage would otherwise undo each other.
 */
export function serial(fn) {
  let last = Promise.resolve();
  return (...args) => {
    const run = () => fn(...args);
    last = last.then(run, run);
    return last;
  };
}

/**
 * Wraps an async function so calls made while it runs fold into a single run after it. A save reloads the page
 * and so does the storage change it causes; folded, the page reloads at most twice instead of once per call, and
 * every caller's promise settles after a run that started after its call.
 */
export function coalesce(fn) {
  let running = null;
  let again = false;
  async function loop() {
    try {
      do {
        again = false;
        await fn();
      } while (again);
    } finally {
      running = null;
    }
  }
  return () => {
    if (running) {
      again = true;
      return running;
    }
    running = loop();
    return running;
  };
}
