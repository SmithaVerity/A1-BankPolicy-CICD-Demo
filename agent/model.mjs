// Model access for the pipeline: an OpenAI-compatible chat completions API (default: OpenAI, gpt-4.1-mini).
// The key is a GitHub secret (MODEL_API_KEY), passed to this step only; it never goes into the model's input.
// MODEL and MODEL_ENDPOINT can be changed as repository variables without changing code.
// MODEL_MODE=stub returns agent/stub-spec.js instead of calling a model (offline build check only; never used in the demo).
import fs from 'node:fs';

export const MODEL = process.env.MODEL || 'gpt-4.1-mini';
const ENDPOINT = process.env.MODEL_ENDPOINT || 'https://api.openai.com/v1/chat/completions';

let stubCall = 0;

export async function callModel(messages) {
  if (process.env.MODEL_MODE === 'stub') {
    const files = (process.env.STUB_FILE || 'agent/stub-spec.js').split(',');
    const code = fs.readFileSync(files[Math.min(stubCall++, files.length - 1)], 'utf8');
    return { text: '```javascript\n' + code + '\n```', usage: { total_tokens: 0 }, model: 'stub' };
  }
  const key = process.env.MODEL_API_KEY;
  if (!key) throw new Error('MODEL_API_KEY is not set: add the OpenAI API key as a repository secret named MODEL_API_KEY.');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0 }),
  });
  const body = await res.text();
  const info = `HTTP ${res.status}, content-type ${res.headers.get('content-type') || 'none'}, request id ${res.headers.get('x-request-id') || 'none'}`;
  if (!res.ok) throw new Error(`Model call failed (${ENDPOINT}): ${info}\n${body.slice(0, 500)}`);
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Model service returned a reply that is not JSON (${info}). First 300 characters:\n${body.slice(0, 300)}`);
  }
  if (!data.choices?.[0]?.message?.content) {
    throw new Error(`Model reply has no answer text (${info}):\n${body.slice(0, 500)}`);
  }
  return { text: data.choices[0].message.content, usage: data.usage || {}, model: data.model || MODEL };
}
