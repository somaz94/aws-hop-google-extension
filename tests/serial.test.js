import { describe, test, expect } from '@jest/globals';
import { serial } from '../src/lib/serial.js';

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
