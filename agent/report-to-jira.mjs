// After the CI test run: posts PASS/FAIL, counts, failed tests and links on the Jira story.
// Usage: node agent/report-to-jira.mjs <ISSUE-KEY>   (reads test-results/results.json from the Playwright JSON reporter)
import fs from 'node:fs';
import { addComment, checkKey } from './jira.mjs';

const key = checkKey(process.argv[2]);
const file = 'test-results/results.json';

const tests = [];
const strip = s => s.replace(/\u001b\[[0-9;]*m/g, '');
function briefError(msg) {
  const lines = strip(msg).split('\n').map(l => l.trim());
  const pick = lines.filter(l => /^(Expected|Received)/.test(l)).slice(0, 2);
  return pick.length ? pick.join('; ') : lines[0];
}
function walk(suite) {
  for (const s of suite.suites || []) walk(s);
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      const last = t.results?.[t.results.length - 1];
      tests.push({ title: spec.title, status: last?.status || 'unknown', error: briefError(last?.error?.message || '') });
    }
  }
}

let lines;
if (!fs.existsSync(file)) {
  lines = [`CI run for ${key}: no test results were produced (the test step did not run). See the pipeline log.`];
} else {
  walk(JSON.parse(fs.readFileSync(file, 'utf8')));
  const passed = tests.filter(t => t.status === 'passed').length;
  const failed = tests.filter(t => ['failed', 'timedOut', 'interrupted'].includes(t.status));
  const skipped = tests.filter(t => t.status === 'skipped').length;
  lines = [
    `CI result for ${key}: ${failed.length ? 'FAIL' : 'PASS'}`,
    `Tests: ${tests.length} | passed ${passed} | failed ${failed.length} | skipped ${skipped}`,
    ...failed.map(t => `Failed: ${t.title} - ${t.error}`),
  ];
}
const pr = process.env.PR_URL ? `Pull request: ${process.env.PR_URL}` : '';
const run = process.env.RUN_URL ? `Pipeline run and Playwright report: ${process.env.RUN_URL}` : '';
lines.push(pr, run, 'Posted by the CI pipeline. A person reviews the pull request and decides whether to merge.');

await addComment(key, lines.filter(Boolean).join('\n'));
console.log(lines.filter(Boolean).join('\n'));
