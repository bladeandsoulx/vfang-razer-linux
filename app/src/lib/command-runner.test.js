import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommandRunner } from './command-runner.js';

test('publishes pending state and reports a rejected command without throwing', async () => {
  const states = [];
  let rejectCommand;
  const runner = createCommandRunner((state) => states.push(state));
  const resultPromise = runner.run(
    () => new Promise((_, reject) => (rejectCommand = reject))
  );

  assert.deepEqual(states.at(-1), { busy: true, error: '' });
  rejectCommand(new Error('daemon offline'));

  assert.deepEqual(await resultPromise, { ok: false, error: 'daemon offline' });
  assert.deepEqual(states.at(-1), { busy: false, error: 'daemon offline' });
});

test('ignores duplicate commands while one command is pending', async () => {
  let finishCommand;
  let calls = 0;
  const runner = createCommandRunner();
  const first = runner.run(
    () =>
      new Promise((resolve) => {
        calls += 1;
        finishCommand = resolve;
      })
  );

  assert.deepEqual(await runner.run(async () => ++calls), {
    ok: false,
    skipped: true
  });
  finishCommand('confirmed');

  assert.deepEqual(await first, { ok: true, value: 'confirmed' });
  assert.equal(calls, 1);
});

test('clears a previous error when a new command begins and completes', async () => {
  const runner = createCommandRunner();
  await runner.run(() => {
    throw 'first failure';
  });

  assert.equal(runner.error, 'first failure');
  assert.deepEqual(await runner.run(async () => 42), { ok: true, value: 42 });
  assert.equal(runner.error, '');
});
