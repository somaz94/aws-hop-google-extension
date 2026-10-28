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
