import { describe, test, expect } from '@jest/globals';
import { coalesce, serial } from '../src/lib/serial.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('serial', () => {
  test('runs calls one after another, in call order', async () => {
    const log = [];
    const run = serial(async (name, wait) => {
      log.push(`start ${name}`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      log.push(`end ${name}`);
      return name;
    });
    const results = await Promise.all([run('a', 20), run('b', 0)]);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b']);
    expect(results).toEqual(['a', 'b']);
  });

  test('a failed call rejects for its caller and the next call still runs', async () => {
    const run = serial(async (fail) => {
      await tick();
      if (fail) throw new Error('quota');
      return 'ok';
    });
    const first = run(true);
    const second = run(false);
    await expect(first).rejects.toThrow('quota');
    await expect(second).resolves.toBe('ok');
  });
});

describe('coalesce', () => {
  test('calls made during a run fold into one more run after it', async () => {
    let runs = 0;
    const reload = coalesce(async () => {
      runs += 1;
      await tick();
    });
    await Promise.all([reload(), reload(), reload(), reload()]);
    expect(runs).toBe(2);
    await reload();
    expect(runs).toBe(3);
  });

  test('a caller during a run waits for the run that starts after its call', async () => {
    const seen = [];
    let value = 'old';
    const reload = coalesce(async () => {
      const read = value;
      await tick();
      seen.push(read);
    });
    const first = reload();
    value = 'new';
    await reload();
    expect(seen).toEqual(['old', 'new']);
    await first;
  });

  test('a failed run rejects and the next call runs again', async () => {
    let fail = true;
    const reload = coalesce(async () => {
      await tick();
      if (fail) throw new Error('quota');
    });
    await expect(reload()).rejects.toThrow('quota');
    fail = false;
    await expect(reload()).resolves.toBeUndefined();
  });
});
