// Test-writing agent for the CI/CD pipeline.
// Reads one Jira story and the page's element ids, asks the model for a Playwright spec,
// writes it to tests/generated/<KEY>.spec.js, and runs the guard checks. One repair call at most.
// Usage: node agent/generate-tests.mjs <ISSUE-KEY>
import fs from 'node:fs';
import { getStory, checkKey } from './jira.mjs';
import { callModel, MODEL } from './model.mjs';
import { acceptanceCriteria, runAllChecks } from './check-spec.mjs';

const MAX_MODEL_CALLS = 2; // one to write, one to repair; then stop

const RULES = `You are a code assistant for the BankPolicy test team. You write Playwright tests in JavaScript (@playwright/test) for the BankPolicy Copilot web chat.
Rules:
1. Write one test per acceptance criterion, in order. Name each test with its id first, for example test('AC-01 title and instruction', ...). Write no other tests.
2. Open the page with await page.goto('/') (the address is set by the pipeline). Use page.locator('#id') with the element ids given. Never open any other address.
3. Use expect(...).toContainText / toHaveText with { timeout: 5000 } for anything that waits for an answer. Never use fixed waits (page.waitForTimeout).
4. Use every quoted value from an acceptance criterion exactly as written (questions to type and expected texts).
5. Never use test.fail, test.skip, test.fixme, test.only or any other way to mark a test as expected to fail or skipped: a test that finds a defect must fail. Never change an expected result.
6. Reply with the complete file in one \`\`\`javascript code block and nothing else.`;

function elementIds(html) {
  return [...html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g)]
    .filter(m => m[2] !== 'chat')
    .map(m => `${m[2]} (${m[1]})`);
}

function extractCode(text) {
  const m = text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
  return (m ? m[1] : text).trim() + '\n';
}

function summary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
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

  const messages = [
    { role: 'system', content: RULES },
    { role: 'user', content: `Write tests/generated/${key}.spec.js for Jira story ${key}.\nSummary: ${story.summary}\n\nStory text:\n${story.description}\n\nPage element ids: ${ids.join(', ')}.\nThe citations element contains the text "Citations:" followed by the policy ids, or "none".` },
  ];

  const specPath = `tests/generated/${key}.spec.js`;
  let calls = 0;
  let result = { errors: ['not run'] };
  let usedModel = MODEL;
  while (calls < MAX_MODEL_CALLS) {
    calls += 1;
    console.log(`Step 3.${calls} - ask the model (${MODEL}) to ${calls === 1 ? 'write' : 'repair'} the spec`);
    const reply = await callModel(messages);
    usedModel = reply.model;
    const code = extractCode(reply.text);
    fs.writeFileSync(specPath, code);
    console.log(`  wrote ${specPath} (${code.split('\n').length} lines, ${reply.usage.total_tokens ?? '?'} tokens)`);

    console.log('Step 4 - guard checks');
    result = runAllChecks(key);
    if (result.errors.length === 0) { console.log('  PASSED'); break; }
    console.log('  FAILED:\n  - ' + result.errors.join('\n  - '));
    messages.push({ role: 'assistant', content: reply.text });
    messages.push({ role: 'user', content: `The pipeline's guard check rejected the file:\n- ${result.errors.join('\n- ')}\nFix only these problems and reply with the complete file.` });
  }

  const run = { key, summary: story.summary, model: usedModel, modelCalls: calls, acceptanceCriteria: acs.map(a => a.id), guardErrors: result.errors, spec: specPath };
  fs.writeFileSync(`agent-out/run-${key}.json`, JSON.stringify(run, null, 2));
  summary([
    `## Test-writing agent: ${key}`,
    `- Story: ${story.summary}`,
    `- Acceptance criteria: ${acs.map(a => a.id).join(', ')}`,
    `- Model: ${usedModel} (${calls} call${calls > 1 ? 's' : ''}, limit ${MAX_MODEL_CALLS})`,
    `- Guard check: ${result.errors.length ? 'FAILED - ' + result.errors.join('; ') : 'PASSED'}`,
  ]);
  if (result.errors.length) {
    console.error(`Stopping: the spec still fails the guard check after ${calls} model calls. No pull request will be opened.`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
