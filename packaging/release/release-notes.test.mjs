import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseNotes } from './release-notes.mjs';

const changelog = `# Changelog

## [1.0.0] — 2026-09-30 — Reliability

### Added

- Custom AC/battery profiles.

### Known limitations

- Issues #7 and #8 need affected-hardware confirmation.

## [0.9.9] — 2026-08-08 — Older release

- Old notes.
`;

test('published notes include the exact release changes and known limitations', () => {
  const notes = releaseNotes(changelog, '1.0.0');
  assert.match(notes, /^## Reliability/);
  assert.match(notes, /Custom AC\/battery profiles/);
  assert.match(notes, /Issues #7 and #8 need affected-hardware confirmation/);
  assert.doesNotMatch(notes, /Older release|Old notes/);
});

test('publication rejects missing, invalid, undated and empty release notes', () => {
  assert.throws(() => releaseNotes(changelog, '1.0.1'), /no changelog entry/);
  assert.throws(() => releaseNotes(changelog, '../1.0.0'), /invalid release version/);
  assert.throws(() => releaseNotes(changelog.replace('2026-09-30', 'Unreleased'), '1.0.0'), /not dated/);
  assert.throws(() => releaseNotes('## [1.0.0] — 2026-09-30 — Empty\n', '1.0.0'), /empty/);
});
