// Guard step: checks the agent's spec file before anything is committed.
// The pipeline stops (no pull request) if any check fails.
// Usage: node agent/check-spec.mjs <ISSUE-KEY>   (reads agent-out/story-<KEY>.json and tests/generated/<KEY>.spec.js)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const norm = s => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

export function acceptanceCriteria(description) {
  const lines = norm(description).split(/\r?\n/).filter(l => /^\s*\*?\s*AC-\d+/.test(l));
  return lines.map(l => {
    const id = l.match(/AC-\d+/)[0];
    const quoted = [...l.matchAll(/"([^"]+)"/g)].map(m => m[1]);
    return { id, text: l.trim(), quoted };
  });
}

export function checkSpecText(spec, acs) {
  const errors = [];
  const text = norm(spec);

  // 1. Exactly one test per acceptance criterion, named after it; no other tests.
  const titles = [...text.matchAll(/\btest\(\s*(['"`])(.*?)\1/g)].map(m => m[2]);
  for (const ac of acs) {
    const n = titles.filter(t => t.startsWith(ac.id)).length;
    if (n !== 1) errors.push(`${ac.id}: expected exactly 1 test named "${ac.id} ...", found ${n}.`);
  }
  for (const t of titles) {
    if (!acs.some(ac => t.startsWith(ac.id))) errors.push(`Test "${t}" is not named after an acceptance criterion.`);
  }

  // 2. No way of hiding a failure, and no fixed waits.
  const forbidden = [
    [/\btest(\.describe)?\.(fail|skip|fixme|only)\b/, 'marks a test as expected to fail, skipped or only (a test that finds a defect must fail)'],
    [/\bwaitForTimeout\s*\(/, 'uses a fixed wait (waitForTimeout)'],
    [/\bpage\.pause\s*\(/, 'calls page.pause()'],
    [/\bnot\.toContainText\(\s*['"`]requires_escalation: true/, 'asserts that escalation is NOT required'],
  ];
  for (const [re, why] of forbidden) if (re.test(text)) errors.push(`The spec ${why}.`);

  // 3. Every quoted value in the acceptance criteria appears in the spec (expected results cannot be weakened).
  for (const ac of acs) {
    for (const q of ac.quoted) {
      if (!text.includes(q)) errors.push(`${ac.id}: the spec does not use the value "${q}" from the acceptance criterion.`);
    }
  }

  // 4. Only the application under test is opened.
  const urls = [...text.matchAll(/https?:\/\/[^\s'"`)]+/g)].map(m => m[0]);
  for (const u of urls) if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(u)) errors.push(`The spec opens an outside address: ${u}`);

  return errors;
}

function changedFilesOutsideGenerated() {
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' });
    return out.split('\n').filter(Boolean).map(l => l.slice(3))
      .filter(f => !f.startsWith('tests/generated/') && !f.startsWith('agent-out/'));
  } catch { return []; }
}

export function specLoads(specPath, expected) {
  try {
    const out = execFileSync('npx', ['playwright', 'test', specPath, '--list', '--project=chromium'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const m = out.match(/Total:\s*(\d+)\s+tests?/);
    const n = m ? Number(m[1]) : 0;
    return n === expected ? [] : [`Playwright lists ${n} tests in the spec; expected ${expected}.`];
  } catch (e) {
    return [`The spec does not load in Playwright: ${(e.stderr || e.stdout || e.message).toString().split('\n').slice(0, 8).join(' ')}`];
  }
}

export function runAllChecks(key) {
  const story = JSON.parse(fs.readFileSync(`agent-out/story-${key}.json`, 'utf8'));
  const acs = acceptanceCriteria(story.description);
  const specPath = `tests/generated/${key}.spec.js`;
  if (acs.length === 0) return { acs, errors: [`Story ${key} has no acceptance criteria lines (AC-01, AC-02, ...).`] };
  if (!fs.existsSync(specPath)) return { acs, errors: [`${specPath} was not written.`] };
  const errors = [...checkSpecText(fs.readFileSync(specPath, 'utf8'), acs)];
  const outside = changedFilesOutsideGenerated();
  if (outside.length) errors.push(`Files changed outside tests/generated/: ${outside.join(', ')}`);
  if (errors.length === 0) errors.push(...specLoads(specPath, acs.length));
  return { acs, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const key = process.argv[2];
  const { acs, errors } = runAllChecks(key);
  console.log(`Guard check for ${key}: ${acs.length} acceptance criteria (${acs.map(a => a.id).join(', ')})`);
  if (errors.length) {
    console.log('FAILED:\n- ' + errors.join('\n- '));
    process.exit(1);
  }
  console.log('PASSED: one test per acceptance criterion; no test.fail/skip/only; no fixed waits; every expected value used; nothing changed outside tests/generated/; spec loads.');
}
