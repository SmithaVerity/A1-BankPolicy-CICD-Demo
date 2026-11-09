// Jira access for the pipeline. Read one story; add one comment. Nothing else.
// JIRA_MODE=fixture reads jira/fixtures/<KEY>.json and writes comments to agent-out/ (offline rehearsal only).
import fs from 'node:fs';
import path from 'node:path';

const MODE = process.env.JIRA_MODE || 'live';

function auth() {
  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    throw new Error('Jira secrets missing: set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN (or JIRA_MODE=fixture for offline rehearsal).');
  }
  return {
    base: JIRA_BASE_URL.replace(/\/+$/, ''),
    header: 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64'),
  };
}

export async function getStory(key) {
  if (MODE === 'fixture') {
    const file = path.join('jira', 'fixtures', `${key}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { key: data.key, summary: data.fields.summary, description: data.fields.description || '' };
  }
  const { base, header } = auth();
  // REST API v2 returns the description as plain text (v3 returns a document tree).
  const res = await fetch(`${base}/rest/api/2/issue/${encodeURIComponent(key)}?fields=summary,description`, {
    headers: { Authorization: header, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Jira read of ${key} failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { key: data.key, summary: data.fields.summary, description: data.fields.description || '' };
}

export async function addComment(key, body) {
  if (MODE === 'fixture') {
    fs.mkdirSync('agent-out', { recursive: true });
    fs.appendFileSync(path.join('agent-out', `jira-comments-${key}.txt`), body + '\n---\n');
    console.log(`[fixture] Jira comment on ${key}:\n${body}`);
    return;
  }
  const { base, header } = auth();
  const res = await fetch(`${base}/rest/api/2/issue/${encodeURIComponent(key)}/comment`, {
    method: 'POST',
    headers: { Authorization: header, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`Jira comment on ${key} failed: HTTP ${res.status} ${await res.text()}`);
}

export function checkKey(key) {
  if (!/^[A-Z][A-Z0-9]+-\d+$/.test(key || '')) {
    throw new Error(`"${key}" is not a Jira issue key (expected something like BP-1).`);
  }
  return key;
}
