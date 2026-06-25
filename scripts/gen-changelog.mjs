// gen-changelog.mjs
//
// generates app/src/data/changelog.json from git history — the on-site
// changelog (/changelog) reads it. each commit's message becomes a set of
// bullets and commits are grouped by the date they landed, newest-first.
//
// commit-message → bullets: two styles live in our history and both are
// supported —
//   1. one topic per line (recent commits)
//   2. a single line with "; "-separated topics (older commits)
// so we split the message on newlines first, then split each line again on
// "; ". every resulting fragment is one bullet. this is exactly the
// "bullet where the line spaces / separators were" behaviour we want.
//
// going forward this is the source of truth: write a normal multi-line (or
// "; "-separated) commit message and re-run this script before pushing. the
// current uncommitted commit isn't in `git log` yet, so the changelog is
// current as of the last commit — regenerate + commit alongside new work.
//
// usage:
//   node scripts/gen-changelog.mjs            # write changelog.json
//   node scripts/gen-changelog.mjs --dry-run  # print summary, write nothing

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, '../app/src/data/changelog.json');

// unique record/field markers that can't appear in a commit message.
const REC = '<<<CL-REC>>>';
const FLD = '<<<CL-FLD>>>';

// %h short-hash, %ad author date (short = YYYY-MM-DD), %B raw body.
const raw = execSync(
  `git log --no-merges --date=short --pretty=format:'${REC}%h${FLD}%ad${FLD}%B'`,
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);

// split one commit message into bullet fragments: lines first, then "; ".
function toBullets(body) {
  return body
    .split('\n')
    .flatMap(line => line.split(/;\s+/))
    .map(s => s.trim())
    .filter(Boolean);
}

const commits = raw
  .split(REC)
  .map(s => s.trim())
  .filter(Boolean)
  .map(chunk => {
    const [hash, date, ...rest] = chunk.split(FLD);
    const body = rest.join(FLD); // body can't contain FLD, but be safe
    return { hash: hash.trim(), date: date.trim(), bullets: toBullets(body) };
  })
  .filter(c => c.bullets.length > 0);

// group by date, newest-first (git log is already newest-first, so first
// occurrence of each date preserves that order). a day's commits merge into
// one entry — "what shipped that day".
const byDate = [];
const index = new Map();
for (const c of commits) {
  if (!index.has(c.date)) {
    const entry = { date: c.date, changes: [], hashes: [] };
    index.set(c.date, entry);
    byDate.push(entry);
  }
  const entry = index.get(c.date);
  entry.changes.push(...c.bullets);
  entry.hashes.push(c.hash);
}

const dryRun = process.argv.includes('--dry-run');
console.log(`parsed ${commits.length} commits → ${byDate.length} dated entries`);
console.log(`total bullets: ${byDate.reduce((n, e) => n + e.changes.length, 0)}`);
if (byDate[0]) console.log(`newest: ${byDate[0].date} (${byDate[0].changes.length} changes)`);

if (!dryRun) {
  writeFileSync(OUTPUT, JSON.stringify(byDate, null, 2));
  console.log(`wrote ${OUTPUT}`);
}
