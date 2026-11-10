# A1 demo: a test-writing agent deployed in a CI/CD pipeline

Verity Software / ITB — A1 Agentic AI for QE. All content is fictional (BankPolicy Copilot lab build 1.2.1).

## What happens

| Step | What happens | Where |
|---|---|---|
| 1 | Jira story **BP-1** is moved to **Ready for Test** | Jira |
| 2 | A Jira Automation rule sends a web request to GitHub; **Generate tests (agent)** starts | `.github/workflows/generate-tests.yml` |
| 3 | The agent reads BP-1 and the page's element ids, and asks the model (OpenAI, gpt-4.1-mini) for one Playwright test per acceptance criterion | `agent/generate-tests.mjs` |
| 4 | The **guard check** rejects the file if it hides a failure (`test.fail`, `skip`, `only`), uses fixed waits, drops an expected value from the story, opens another site, or changes anything outside `tests/generated/` | `agent/check-spec.mjs` |
| 5 | The tests go on branch `agent/BP-1` and a pull request is opened | GitHub |
| 6 | **CI** starts the BankPolicy web chat and runs the tests; the HTML report is kept | `.github/workflows/ci.yml` |
| 7 | The result is posted on BP-1 in Jira | `agent/report-to-jira.mjs` |
| 8 | A person reviews the pull request and decides. The agent cannot merge | Branch protection on `main` |

Expected result on lab build 1.2.1: AC-01, AC-02, AC-03 pass; **AC-04 fails** (open defect DEF-104: an unauthorised transfer is not escalated). A pipeline that passes AC-04 is wrong.

## What the agent may and may not do

| Allowed | Not allowed |
|---|---|
| Read one Jira story | Change the story or its status |
| Read `app/index.html` for element ids | Change the application, the workflows or any file outside `tests/generated/` |
| Two model calls at most (write, then one repair) | Change an expected result so that a test passes |
| Open a pull request | Merge, approve or close a pull request |

## Repository contents

| Path | What it is |
|---|---|
| `app/` | BankPolicy Copilot web chat (fixed answers, no model) and a small server |
| `agent/` | The agents (OpenAI: `generate-tests.mjs`; GitHub Copilot: `generate-tests-copilot.mjs`), the guard check, Jira access, model access, Jira reporting |
| `jira/BP-1_story.md` | Text to paste into Jira for story BP-1 |
| `jira/fixtures/BP-1.json` | The same story for offline rehearsal (`JIRA_MODE=fixture`) |
| `tests/generated/` | Where the agent writes its tests |
| `agent/stub-spec.js` | Reference spec (answer key); used only by the offline build check |

## Secrets and variables (Settings → Secrets and variables → Actions)

| Name | Kind | Value |
|---|---|---|
| `JIRA_BASE_URL` | Secret | e.g. `https://your-site.atlassian.net` |
| `JIRA_EMAIL` | Secret | Email of the Jira account |
| `JIRA_API_TOKEN` | Secret | Jira API token |
| `MODEL_API_KEY` | Secret | OpenAI API key (used only by the agent step) |
| `COPILOT_GITHUB_TOKEN` | Secret | Copilot version only: fine-grained token of a Copilot-licensed account with the account permission "Copilot Requests" (given only to Copilot) |
| `BOT_PAT` | Secret | Fine-grained personal access token, this repository only: Contents and Pull requests read/write |
| `MODEL` | Variable (optional) | Default `gpt-4.1-mini` |
| `MODEL_ENDPOINT` | Variable (optional) | Default `https://api.openai.com/v1/chat/completions` (any OpenAI-compatible chat completions address) |
| `JIRA_MODE` | Variable (optional) | `fixture` to run without Jira |

## Run it on your computer (optional)

```bash
npm ci
npx playwright install chromium
JIRA_MODE=fixture MODEL_MODE=stub node agent/generate-tests.mjs BP-1   # offline build check with the reference spec
npx playwright test                                                     # 3 passed, 1 failed (AC-04)
```

## GitHub Copilot version (second agent, same pipeline)

The same pipeline can run with **GitHub Copilot CLI** as the test-writing agent instead of the OpenAI model. Only the agent differs; the story, the instructions (rules 1–5), the guard check, the pull request, CI, Jira comments and branch protection are the same.

| Item | OpenAI version | GitHub Copilot version |
|---|---|---|
| Workflow | `.github/workflows/generate-tests.yml` — **Generate tests (agent)** | `.github/workflows/generate-tests-copilot.yml` — **Generate tests (Copilot agent)** |
| Start | Jira rule or Run workflow | Run workflow only (type the story key, for example BP-2) |
| Agent | `agent/generate-tests.mjs` calls the OpenAI model (gpt-4.1-mini) | `agent/generate-tests-copilot.mjs` runs GitHub Copilot CLI (`copilot -p`, model setting `auto`) |
| Limit on the agent | 2 model calls at most | 2 Copilot runs at most, 6 minutes each |
| Branch | `agent/<KEY>` | `agent-copilot/<KEY>` |
| Secret | `MODEL_API_KEY` | `COPILOT_GITHUB_TOKEN` (fine-grained token of a Copilot-licensed account, permission "Copilot Requests") |

What Copilot is allowed to do — enforced by the Copilot CLI permission rules and the script, not by instructions:

| Allowed | Not allowed |
|---|---|
| Read files in the repository checkout | Read files outside it |
| Write `tests/generated/<KEY>.spec.js` | Write any other file |
| — | Run any command (git, npm, gh, …) |
| — | Open web addresses or use GitHub tools |
| — | See the Jira token, `BOT_PAT` or any other secret (Copilot is started with only its own token) |

The guard check (`agent/check-spec.mjs`) runs after every Copilot run, exactly as for the OpenAI version. The Copilot session transcript is kept as a run artifact (**copilot-session-&lt;KEY&gt;**). On Copilot Free the model is chosen by Copilot (Auto); the model used is shown in the run summary, the pull request and the Jira comment.
