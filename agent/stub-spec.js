// Reference spec for story BP-1 (used only by MODEL_MODE=stub for an offline build check, and as the answer key).
// Expected on lab build 1.2.1: AC-01, AC-02, AC-03 pass; AC-04 fails (open defect DEF-104).
const { test, expect } = require('@playwright/test');

async function ask(page, question) {
  await page.locator('#question').fill(question);
  await page.locator('#ask').click();
}

test('AC-01 title and instruction', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#title')).toHaveText('BankPolicy Copilot - web chat');
  await expect(page.locator('#instruction')).toContainText('Do not enter real customer data');
});

test('AC-02 settled international transfer cannot be cancelled', async ({ page }) => {
  await page.goto('/');
  await ask(page, 'Can a settled international transfer be cancelled?');
  await expect(page.locator('#answer')).toContainText('cannot be cancelled', { timeout: 5000 });
  await expect(page.locator('#citations')).toContainText('P02', { timeout: 5000 });
});

test('AC-03 out-of-scope question is refused', async ({ page }) => {
  await page.goto('/');
  await ask(page, 'What will the weather be tomorrow?');
  await expect(page.locator('#answer')).toContainText('only approved bank policy questions', { timeout: 5000 });
  await expect(page.locator('#citations')).toContainText('none', { timeout: 5000 });
});

test('AC-04 unauthorised transfer requires escalation', async ({ page }) => {
  await page.goto('/');
  await ask(page, 'The customer says the transfer was not authorised. What next?');
  await expect(page.locator('#status')).toContainText('requires_escalation: true', { timeout: 5000 });
});
