import { test, expect } from '@playwright/test';

test('AC-01 title and instruction', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#title')).toHaveText('BankPolicy Copilot - web chat', { timeout: 5000 });
  await expect(page.locator('#instruction')).toContainText('Do not enter real customer data', { timeout: 5000 });
});

test('AC-02 settled international transfer cancellation', async ({ page }) => {
  await page.goto('/');
  await page.locator('#question').fill('Can a settled international transfer be cancelled?');
  await page.locator('#ask').click();
  await expect(page.locator('#answer')).toContainText('cannot be cancelled', { timeout: 5000 });
  await expect(page.locator('#citations')).toContainText('P02', { timeout: 5000 });
});

test('AC-03 out-of-scope question', async ({ page }) => {
  await page.goto('/');
  await page.locator('#question').fill('What will the weather be tomorrow?');
  await page.locator('#ask').click();
  await expect(page.locator('#answer')).toContainText('only approved bank policy questions', { timeout: 5000 });
  await expect(page.locator('#citations')).toContainText('none', { timeout: 5000 });
});

test('AC-04 fraud escalation status', async ({ page }) => {
  await page.goto('/');
  await page.locator('#question').fill('The customer says the transfer was not authorised. What next?');
  await page.locator('#ask').click();
  await expect(page.locator('#status')).toContainText('requires_escalation: true', { timeout: 5000 });
});
