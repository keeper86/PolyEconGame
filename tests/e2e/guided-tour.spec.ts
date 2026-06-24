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

/**
 * Helper: navigate from the founding page to the central-bank tour page.
 * Reuses the shared founding flow to keep tests DRY.
 */
async function createAgentAndStartTour(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/demographics')) {
        throw new Error(
            'TEST PRECONDITION FAILED: The test user already has an agent. ' +
                'This test requires a fresh database instance to create a new agent ' +
                'and follow the guided tour from the beginning.',
        );
    }

    const foundingForm = page.locator('input[name="company-name"]');
    await expect(foundingForm).toBeVisible({ timeout: 15000 });

    await foundingForm.fill('Tour Test Company');
    await page.locator('#enable-tour').check();
    await page.locator('button[type="submit"]').click();

    await page.waitForURL(/\/planets\/[^/]+\/central-bank/, { timeout: 20000 });
    await page.waitForLoadState('networkidle');
}

test.describe('Guided Tour E2E', () => {
    test.describe.configure({ retries: 0 });

    test('shows guided tour popups on central bank and financial pages', async ({ page }) => {
        // ==================================================================
        // 1. Create a new agent on the founding page
        // ==================================================================
        await createAgentAndStartTour(page);

        // ==================================================================
        // 2. Central Bank — Step 0: Bank Overview
        // ==================================================================
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Central Bank Overview');
        await page.locator('button[data-action="primary"]').click();

        // ==================================================================
        // 3. Central Bank — Step 1: Navigate to Financial
        // ==================================================================
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Next: Financial Overview');
        await page.locator('button[data-action="primary"]').click();

        // Wait for redirect to the financial page
        await page.waitForURL(/\/planets\/[^/]+\/agent\/[^/]+\/financial/, { timeout: 20000 });
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

    // ── Close tour via the ✕ button ──────────────────────────────────────
    test('closing the tour via the close button ends the tour and persists to localStorage', async ({ page }) => {
        await createAgentAndStartTour(page);

        // Wait for the first tooltip (Central Bank Overview)
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Central Bank Overview');

        // Click the close (✕) button — it has aria-label="Close"
        await page.locator('button[aria-label="Close"]').click();

        // The tooltip should disappear
        await expect(page.locator('[role="alertdialog"]')).not.toBeVisible({ timeout: 5000 });

        // The tour should be marked as completed in localStorage
        const tourStorage = await page.evaluate(() => localStorage.getItem('polyecongame-tour'));
        expect(tourStorage).not.toBeNull();
        if (tourStorage) {
            const parsed = JSON.parse(tourStorage);
            expect(parsed.active).toBe(false);
            expect(parsed.completed).toBe(true);
        }
    });

    // ── Skip tour ────────────────────────────────────────────────────────
    test('skipping the tour via "Skip tour" button ends the tour', async ({ page }) => {
        await createAgentAndStartTour(page);

        // Wait for the first tooltip
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Central Bank Overview');

        // Click the "Skip tour" button
        await page.locator('button[data-action="skip"]').click();

        // The tooltip should disappear
        await expect(page.locator('[role="alertdialog"]')).not.toBeVisible({ timeout: 5000 });

        // The tour should be marked as completed in localStorage
        const tourStorage = await page.evaluate(() => localStorage.getItem('polyecongame-tour'));
        expect(tourStorage).not.toBeNull();
        if (tourStorage) {
            const parsed = JSON.parse(tourStorage);
            expect(parsed.active).toBe(false);
            expect(parsed.completed).toBe(true);
        }
    });
});
