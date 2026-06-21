import { test, expect } from '@playwright/test';
import authPath from './auth.path';

test.use({ storageState: authPath });

const STORAGE_KEY = 'polyecongame-tour';

test.describe('Guided Tour E2E', () => {
    test('completes the full guided tour end-to-end', async ({ page }) => {
        // ==================================================================
        // 1. Enable tour via localStorage and navigate to central bank
        // ==================================================================
        await page.evaluate((key: string) => {
            localStorage.setItem(
                key,
                JSON.stringify({ active: true, currentPageIndex: 0, completed: false }),
            );
        }, STORAGE_KEY);

        // Navigate to a planet's central-bank page to start the tour
        await page.goto('/planets/alpha-centauri/central-bank');
        await page.waitForLoadState('networkidle');

        // ==================================================================
        // 2. Central Bank (4 steps: Take Loan → Confirmation → Bank Overview → Navigate)
        // ==================================================================
        // Step 0: "Now take the loan" — blocking step with hideFooter=true
        // The tooltip has no Next button, only a Skip button. User must click the loan button.
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Now take the loan');

        // Click the actual starter loan button (not joyride's Next/skip)
        const loanButton = page.locator('[data-tour="starter-loan"]');
        await expect(loanButton).toBeVisible();
        await loanButton.click();

        // Wait for the loan request to succeed and the tour to auto-advance
        // to the confirmation step
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Loan taken successfully');

        // Step 1: Confirmation step — click Next
        await page.locator('button[data-action="primary"]').click();

        // Step 2: Central Bank Overview
        await page.waitForSelector('[role="alertdialog"]', { timeout: 10000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Central Bank Overview');
        await page.locator('button[data-action="primary"]').click();

        // Step 3: Navigate to Financial
        await page.waitForSelector('[role="alertdialog"]', { timeout: 10000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Next: Financial Overview');
        await page.locator('button[data-action="primary"]').click();

        // Wait for navigation to financial page
        await page.waitForURL(/\/planets\/[^/]+\/agent\/[^/]+\/financial/, { timeout: 20000 });
        await page.waitForLoadState('networkidle');

        // ==================================================================
        // 3. Financial (3 steps: Financial Overview → Loan Mgmt → Navigate)
        // ==================================================================
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Financial Overview');
        await page.locator('button[data-action="primary"]').click();

        await page.waitForSelector('[role="alertdialog"]', { timeout: 10000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Loan Management');
        await page.locator('button[data-action="primary"]').click();

        await page.waitForSelector('[role="alertdialog"]', { timeout: 10000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Next: Workforce');
        await page.locator('button[data-action="primary"]').click();

        await page.waitForURL(/\/planets\/[^/]+\/agent\/[^/]+\/workforce/, { timeout: 20000 });
        await page.waitForLoadState('networkidle');

        // ==================================================================
        // 4. Workforce (3 steps)
        // ==================================================================
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Wage Settings');
        await page.locator('button[data-action="primary"]').click();

        await page.waitForSelector('[role="alertdialog"]', { timeout: 10000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Worker Allocation');
        await page.locator('button[data-action="primary"]').click();

        await page.waitForSelector('[role="alertdialog"]', { timeout: 10000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Next: Land Claims');
        await page.locator('button[data-action="primary"]').click();

        await page.waitForURL(/\/planets\/[^/]+\/claims/, { timeout: 20000 });
        await page.waitForLoadState('networkidle');

        // ==================================================================
        // 5. Claims (2 steps)
        // ==================================================================
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Land Claims');
        await page.locator('button[data-action="primary"]').click();

        await page.waitForSelector('[role="alertdialog"]', { timeout: 10000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Next: Production');
        await page.locator('button[data-action="primary"]').click();

        await page.waitForURL(/\/planets\/[^/]+\/agent\/[^/]+\/production/, { timeout: 20000 });
        await page.waitForLoadState('networkidle');

        // ==================================================================
        // 6. Production (2 steps)
        // ==================================================================
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Production Facilities');
        await page.locator('button[data-action="primary"]').click();

        await page.waitForSelector('[role="alertdialog"]', { timeout: 10000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Next: Storage');
        await page.locator('button[data-action="primary"]').click();

        await page.waitForURL(/\/planets\/[^/]+\/agent\/[^/]+\/storage/, { timeout: 20000 });
        await page.waitForLoadState('networkidle');

        // ==================================================================
        // 7. Storage (2 steps)
        // ==================================================================
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Storage Overview');
        await page.locator('button[data-action="primary"]').click();

        await page.waitForSelector('[role="alertdialog"]', { timeout: 10000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Next: Market');
        await page.locator('button[data-action="primary"]').click();

        await page.waitForURL(/\/planets\/[^/]+\/agent\/[^/]+\/market/, { timeout: 20000 });
        await page.waitForLoadState('networkidle');

        // ==================================================================
        // 8. Market (2 steps)
        // ==================================================================
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Market Overview');
        await page.locator('button[data-action="primary"]').click();

        await page.waitForSelector('[role="alertdialog"]', { timeout: 10000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Next: Ships');
        await page.locator('button[data-action="primary"]').click();

        await page.waitForURL(/\/planets\/[^/]+\/agent\/[^/]+\/ships/, { timeout: 20000 });
        await page.waitForLoadState('networkidle');

        // ==================================================================
        // 9. Ships (2 steps — final page with completion)
        // ==================================================================
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Ship Management');
        await page.locator('button[data-action="primary"]').click();

        // Tour Complete — final step
        await page.waitForSelector('[role="alertdialog"]', { timeout: 10000 });
        await expect(page.locator('[role="alertdialog"]')).toContainText('Tour Complete');

        // Click primary (Finish) to complete the tour
        await page.locator('button[data-action="primary"]').click();

        // ==================================================================
        // 10. Verify tour is marked as completed in localStorage
        // ==================================================================
        const tourStorage = await page.evaluate((key: string) => {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        }, STORAGE_KEY);

        expect(tourStorage).not.toBeNull();
        expect(tourStorage?.active).toBe(false);
        expect(tourStorage?.completed).toBe(true);
    });

    test('skip button works and hides the tour', async ({ page }) => {
        await page.goto('/planets/alpha-centauri/central-bank');
        await page.waitForLoadState('networkidle');

        await page.evaluate((key: string) => {
            localStorage.setItem(
                key,
                JSON.stringify({ active: true, currentPageIndex: 0, completed: false }),
            );
        }, STORAGE_KEY);

        await page.reload();
        await page.waitForLoadState('networkidle');

        // Wait for the first tooltip
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toBeVisible();

        // Click skip
        await page.locator('button[data-action="skip"]').click();

        // Verify tour was skipped
        const tourStorage = await page.evaluate((key: string) => {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        }, STORAGE_KEY);

        expect(tourStorage?.active).toBe(false);
    });

    test('navigation guard blocks leaving the tour and leave-anyway ends the tour', async ({ page }) => {
        await page.goto('/planets/alpha-centauri/central-bank');
        await page.waitForLoadState('networkidle');

        await page.evaluate((key: string) => {
            localStorage.setItem(
                key,
                JSON.stringify({ active: true, currentPageIndex: 0, completed: false }),
            );
        }, STORAGE_KEY);

        await page.reload();
        await page.waitForLoadState('networkidle');

        // Wait for the first tooltip
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toBeVisible();

        // Try clicking a navigation link (e.g., sidebar link to claims)
        // The click should be intercepted and show a toast with "Leave anyway"
        const claimsLink = page.locator('a[href*="/claims"]').first();
        if (await claimsLink.isVisible()) {
            await claimsLink.click();

            // The toast with "Leave anyway" action should appear
            const toastAction = page.locator('button:has-text("Leave anyway")');
            await expect(toastAction).toBeVisible({ timeout: 5000 });

            // Click "Leave anyway" - this should end the tour and navigate
            await toastAction.click();

            // Verify tour ended in localStorage
            const tourStorage = await page.evaluate((key: string) => {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            }, STORAGE_KEY);

            expect(tourStorage?.active).toBe(false);
            expect(tourStorage?.completed).toBe(true);
        }
    });

    test('overlay click does not dismiss the tooltip', async ({ page }) => {
        await page.goto('/planets/alpha-centauri/central-bank');
        await page.waitForLoadState('networkidle');

        await page.evaluate((key: string) => {
            localStorage.setItem(
                key,
                JSON.stringify({ active: true, currentPageIndex: 0, completed: false }),
            );
        }, STORAGE_KEY);

        await page.reload();
        await page.waitForLoadState('networkidle');

        // Wait for the first tooltip
        await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
        await expect(page.locator('[role="alertdialog"]')).toBeVisible();

        // Click outside the tooltip (on the overlay area)
        const overlay = page.locator('[role="alertdialog"] ~ div').last();
        if (await overlay.isVisible()) {
            // Try clicking on the body (outside the tooltip) — should not dismiss
            await page.mouse.click(10, 10);
            await page.waitForTimeout(500);

            // Tooltip should still be visible
            await expect(page.locator('[role="alertdialog"]')).toBeVisible();
        }

        // Skip to clean up
        await page.locator('button[data-action="skip"]').click();
    });
});