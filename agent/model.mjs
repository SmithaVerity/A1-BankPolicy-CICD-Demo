// Model access for the pipeline: GitHub Models, authenticated with the workflow's own GITHUB_TOKEN
// (the workflow grants it the "models: read" permission). No API key is stored anywhere.
// MODEL_MODE=stub returns agent/stub-spec.js instead of calling a model (offline build check only; never used in the demo).
import fs from 'node:fs';

export const MODEL = process.env.MODEL || 'openai/gpt-4.1-mini';
const ENDPOINT = process.env.MODEL_ENDPOINT || 'https://models.github.ai/inference/chat/completions';

let stubCall = 0;

export async function callModel(messages) {
  if (process.env.MODEL_MODE === 'stub') {
    const files = (process.env.STUB_FILE || 'agent/stub-spec.js').split(',');
    const code = fs.readFileSync(files[Math.min(stubCall++, files.length - 1)], 'utf8');
    return { text: '```javascript\n' + code + '\n```', usage: { total_tokens: 0 }, model: 'stub' };
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set: the workflow must pass it and grant "models: read".');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0 }),
  });
  const body = await res.text();
  const info = `HTTP ${res.status}, content-type ${res.headers.get('content-type') || 'none'}, request id ${res.headers.get('x-request-id') || res.headers.get('x-github-request-id') || 'none'}`;
  if (!res.ok) throw new Error(`GitHub Models call failed: ${info}\n${body.slice(0, 500)}`);
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`GitHub Models returned a reply that is not JSON (${info}). First 300 characters:\n${body.slice(0, 300)}`);
  }
  if (!data.choices?.[0]?.message?.content) {
    throw new Error(`GitHub Models reply has no answer text (${info}):\n${body.slice(0, 500)}`);
  }
  return { text: data.choices[0].message.content, usage: data.usage || {}, model: data.model || MODEL };
}
