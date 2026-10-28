const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** In-memory stand-in for chrome.storage.sync plus chrome.storage.onChanged. */
export function createFakeStorage(initial = {}, areaName = 'sync') {
  const data = clone(initial);
  const listeners = new Set();
  const emit = (changes) => {
    for (const listener of listeners) listener(changes, areaName);
  };
  const area = {
    async get(keys) {
      if (keys === null) return clone(data);
      const out = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (key in data) out[key] = clone(data[key]);
      }
      return out;
    },
    async set(items) {
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: data[key], newValue: clone(value) };
        data[key] = clone(value);
      }
      emit(changes);
    },
    async remove(keys) {
      const changes = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        changes[key] = { oldValue: data[key] };
        delete data[key];
      }
      emit(changes);
    },
  };
  const onChanged = {
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
  };
  return { area, onChanged, data, emit, listenerCount: () => listeners.size };
}

export function createFakeRuntime() {
  const listeners = new Set();
  const sent = [];
  return {
    onMessage: {
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener),
    },
    /** What the page sent to the extension; resolves like Chrome does when a listener exists. */
    sendMessage(message) {
      sent.push(message);
      return Promise.resolve();
    },
    sent,
    /** Delivers a message the way Chrome does and resolves with whatever the listener sent back. */
    send(message) {
      let reply;
      for (const listener of listeners) listener(message, {}, (response) => { reply = response; });
      return reply;
    },
    listenerCount: () => listeners.size,
  };
}
