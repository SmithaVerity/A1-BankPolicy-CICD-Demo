// Test-writing agent for the CI/CD pipeline - GitHub Copilot version.
// Same job as generate-tests.mjs (OpenAI version), with GitHub Copilot CLI as the agent:
// reads one Jira story and the page's element ids, asks Copilot to write tests/generated/<KEY>.spec.js,
// and runs the guard checks. Two Copilot runs at most (write, then one repair).
// Usage: node agent/generate-tests-copilot.mjs <ISSUE-KEY>
//
// Limits enforced by code, not by instructions:
//   - Copilot may write one file only: tests/generated/<KEY>.spec.js (CLI permission rule)
//   - Copilot may not run any command, open any web address or use the GitHub tools (CLI rules)
//   - Copilot sees no secret except its own token (it is started with a cleaned environment)
//   - At most 2 Copilot runs, 6 minutes each (this script)
//   - The guard (check-spec.mjs) checks the file after every run, independently of Copilot
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { getStory, checkKey } from './jira.mjs';
import { acceptanceCriteria, runAllChecks } from './check-spec.mjs';

const MAX_COPILOT_RUNS = 2;            // one to write, one to repair; then stop
const RUN_TIME_LIMIT_MS = 6 * 60 * 1000; // per Copilot run
const MODEL = process.env.COPILOT_MODEL || 'auto';

// Rules 1-5 are copied word for word from generate-tests.mjs, so both agents get the same instructions.
// Only rule 6 differs: Copilot writes the file with its file tool instead of replying with a code block.
const rules = specPath => `You are a code assistant for the BankPolicy test team. You write Playwright tests in JavaScript (@playwright/test) for the BankPolicy Copilot web chat.
Rules:
1. Write one test per acceptance criterion, in order. Name each test with its id first, for example test('AC-01 title and instruction', ...). Write no other tests.
2. Open the page with await page.goto('/') (the address is set by the pipeline). Use page.locator('#id') with the element ids given. Never open any other address.
3. Use expect(...).toContainText / toHaveText with { timeout: 5000 } for anything that waits for an answer. Never use fixed waits (page.waitForTimeout).
4. Use every quoted value from an acceptance criterion exactly as written (questions to type and expected texts).
5. Never use test.fail, test.skip, test.fixme, test.only or any other way to mark a test as expected to fail or skipped: a test that finds a defect must fail. Never change an expected result.
6. Write the complete file to ${specPath} with your file tool. Write no other file and run no commands. When the file is written, reply with one line saying so.`;

function elementIds(html) {
  return [...html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g)]
    .filter(m => m[2] !== 'chat')
    .map(m => `${m[2]} (${m[1]})`);
}

function summary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}

// The permission rules given to Copilot CLI (shown in the log so viewers can see them).
function copilotArgs(prompt, specPath, sessionFile) {
  return [
    '-p', prompt,
    '--model', MODEL,
    '--no-ask-user',
    '--allow-tool=read',                    // may read files in the checkout (working directory only)
    `--allow-tool=write(${specPath})`,      // may write this one file only
    '--deny-tool=shell',                    // may not run any command
    '--deny-tool=memory',                   // may not store memories
    '--disable-builtin-mcps',               // no GitHub tools
    '--disallow-temp-dir',                  // no files outside the checkout
    '--output-format', 'json',              // machine-readable log (one JSON object per line)
    '--share', sessionFile,                 // session transcript, kept as a run artifact
  ];
}

// Copilot is started with only what it needs: no Jira, GitHub or other secrets.
function cleanEnv() {
  const keep = ['PATH', 'HOME', 'LANG', 'COPILOT_GITHUB_TOKEN'];
  const env = { NO_COLOR: '1', TERM: 'dumb' };
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  return env;
}

// Find the model name(s) Copilot reports in its JSON output. Auto picks the model, so we record it.
function modelsIn(jsonl) {
  const found = new Set();
  const visit = v => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (/^(model|modelId|model_id|modelName|selectedModel|resolvedModel)$/i.test(k) && typeof x === 'string' && x && x.toLowerCase() !== 'auto') found.add(x);
        else visit(x);
      }
    }
  };
  for (const line of jsonl.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try { visit(JSON.parse(t)); } catch { /* not JSON */ }
  }
  return [...found];
}

function runCopilot(key, run, prompt, specPath) {
  const sessionFile = `agent-out/copilot-session-${key}-run${run}.md`;
  const args = copilotArgs(prompt, specPath, sessionFile);
  console.log(`  copilot -p "<prompt: ${prompt.length} characters>" ${args.slice(2).map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
  const started = Date.now();
  const r = spawnSync('copilot', args, { env: cleanEnv(), encoding: 'utf8', timeout: RUN_TIME_LIMIT_MS, maxBuffer: 64 * 1024 * 1024 });
  const seconds = Math.round((Date.now() - started) / 1000);
  const out = (r.stdout || '') + (r.stderr ? `\n${r.stderr}` : '');
  fs.writeFileSync(`agent-out/copilot-output-${key}-run${run}.jsonl`, out);
  if (r.error) console.log(`  Copilot run stopped: ${r.error.code === 'ETIMEDOUT' ? 'time limit reached (6 minutes)' : r.error.message}`);
  else if (r.status !== 0) console.log(`  Copilot exited with code ${r.status}: ${(r.stderr || '').trim().split('\n').slice(-3).join(' | ')}`);
  const models = modelsIn(r.stdout || '');
  console.log(`  Copilot run ${run}: ${seconds} s; model ${models.length ? models.join(', ') : 'not reported'}`);
  return { seconds, models, exitCode: r.status ?? null };
}

async function main() {
  const key = checkKey(process.argv[2]);
  fs.mkdirSync('agent-out', { recursive: true });
  fs.mkdirSync('tests/generated', { recursive: true });

  console.log(`Step 1 - read story ${key} from Jira`);
  const story = await getStory(key);
  fs.writeFileSync(`agent-out/story-${key}.json`, JSON.stringify(story, null, 2));
  const acs = acceptanceCriteria(story.description);
  console.log(`  "${story.summary}" - ${acs.length} acceptance criteria: ${acs.map(a => a.id).join(', ')}`);
  if (acs.length === 0) throw new Error(`Story ${key} has no acceptance criteria lines (AC-01, AC-02, ...). Stopping.`);

  console.log('Step 2 - read the page element ids from app/index.html');
  const ids = elementIds(fs.readFileSync('app/index.html', 'utf8'));
  console.log(`  ${ids.join(', ')}`);

  const specPath = `tests/generated/${key}.spec.js`;
  if (fs.existsSync(specPath)) fs.rmSync(specPath); // start clean: Copilot writes the file from the story
  const task = `Write ${specPath} for Jira story ${key}.\nSummary: ${story.summary}\n\nStory text:\n${story.description}\n\nPage element ids: ${ids.join(', ')}.\nThe citations element contains the text "Citations:" followed by the policy ids, or "none".`;
  let prompt = `${rules(specPath)}\n\n${task}`;

  let runs = 0;
  let seconds = 0;
  const models = new Set();
  let result = { errors: ['not run'] };
  while (runs < MAX_COPILOT_RUNS) {
    runs += 1;
    console.log(`Step 3.${runs} - ask GitHub Copilot (model: ${MODEL}) to ${runs === 1 ? 'write' : 'repair'} the spec`);
    const r = runCopilot(key, runs, prompt, specPath);
    seconds += r.seconds;
    r.models.forEach(m => models.add(m));
    if (fs.existsSync(specPath)) console.log(`  ${specPath}: ${fs.readFileSync(specPath, 'utf8').split('\n').length} lines`);

    console.log('Step 4 - guard checks');
    result = runAllChecks(key);
    if (result.errors.length === 0) { console.log('  PASSED'); break; }
    console.log('  FAILED:\n  - ' + result.errors.join('\n  - '));
    prompt = `${rules(specPath)}\n\n${task}\n\nThe pipeline's guard check rejected ${specPath}:\n- ${result.errors.join('\n- ')}\nFix only these problems and write the complete file again.`;
  }

  const modelText = models.size ? [...models].join(', ') : 'not reported';
  const run = {
    key, summary: story.summary, agent: 'GitHub Copilot CLI', modelSetting: MODEL, model: modelText,
    copilotRuns: runs, seconds, acceptanceCriteria: acs.map(a => a.id), guardErrors: result.errors, spec: specPath,
  };
  fs.writeFileSync(`agent-out/run-${key}.json`, JSON.stringify(run, null, 2));
  summary([
    `## Test-writing agent (GitHub Copilot): ${key}`,
    `- Story: ${story.summary}`,
    `- Acceptance criteria: ${acs.map(a => a.id).join(', ')}`,
    `- Agent: GitHub Copilot CLI, model setting "${MODEL}", model used: ${modelText}`,
    `- Copilot runs: ${runs} (limit ${MAX_COPILOT_RUNS}), ${seconds} s in all`,
    `- Permission rules: may write ${specPath} only; no commands; no web; no GitHub tools; no secrets except its own token`,
    `- Guard check: ${result.errors.length ? 'FAILED - ' + result.errors.join('; ') : 'PASSED'}`,
  ]);
  if (result.errors.length) {
    console.error(`Stopping: the spec still fails the guard check after ${runs} Copilot runs. No pull request will be opened.`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
