import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function releaseNotes(changelog, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('invalid release version');
  const headings = [...changelog.matchAll(/^## \[([^\]]+)\] — ([^\n]+)$/gm)];
  const index = headings.findIndex(match => match[1] === version);
  if (index < 0) throw new Error(`no changelog entry for ${version}`);
  const heading = headings[index];
  const metadata = heading[2].match(/^(\d{4}-\d{2}-\d{2}) — (.+)$/);
  if (!metadata) throw new Error(`changelog entry for ${version} is not dated for release`);
  const end = headings[index + 1]?.index ?? changelog.length;
  const body = changelog.slice(heading.index + heading[0].length, end).trim();
  if (!body) throw new Error(`empty changelog entry for ${version}`);
  return `## ${metadata[2]}\n\n${body}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changelog = fs.readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
  process.stdout.write(releaseNotes(changelog, process.argv[2] ?? ''));
}
