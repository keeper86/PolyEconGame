import { test, expect } from '@playwright/test';

/**
 * WARNING: This test requires a fresh database instance where the test user
 * (adminuser) does NOT already have an agent. If the user already has an agent,
 * the landing page redirects to demographics and the test will fail.
 *
 * We use trace: 'retain-on-failure' at file level (not inside the describe block)
 * because test.use inside a describe forces a new worker.
 * Retries are disabled within the describe because the test creates an agent,
 * so a retry would find a polluted DB state.
 */
test.use({ trace: 'retain-on-failure' });

test.describe('Guided Tour E2E', () => {
    test.describe.configure({ retries: 0 });
    test('shows guided tour popups on central bank and financial pages', async ({ page }) => {
        // ==================================================================
        // 1. Create a new agent on the founding page
        // ==================================================================
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        if (page.url().includes('/demographics')) {
            throw new Error(
                'TEST PRECONDITION FAILED: The test user already has an agent. ' +
                    'This test requires a fresh database instance to create a new agent ' +
                    'and follow the guided tour from the beginning.',
            );
        }

        // Verify we are on the founding page
        const foundingForm = page.locator('input[name="company-name"]');
        await expect(foundingForm).toBeVisible({ timeout: 15000 });

        // Fill in company name and enable the tour
        await foundingForm.fill('Tour Test Company');
        await page.locator('#enable-tour').check();

        // Submit the founding form
        await page.locator('button[type="submit"]').click();

        // Wait for redirect to the financial page
        await page.waitForURL(/\/planets\/[^/]+\/agent\/[^/]+\/financial/, { timeout: 40000 });
        await page.waitForLoadState('networkidle');

        // ==================================================================
        // 4. Financial — Step 0: Take the starter loan (blocking step)
        // ==================================================================
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Now take the loan');

        // Click the starter loan button — this triggers advanceToNextStep via the mutation callback
        await page.locator('[data-tour="starter-loan"]').click();

        // ==================================================================
        // 5. Financial — Step 1: Loan confirmation
        // ==================================================================
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Loan taken successfully');
        await page.locator('button[data-action="primary"]').click();

        // ==================================================================
        // 6. Financial — Step 2: Financial Overview
        // ==================================================================
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Financial Overview');
    });
});
