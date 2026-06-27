import { test as setup } from '@playwright/test';
import pathToAuthStorage from './auth.path';

setup('authenticate', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Login');
    await page.waitForLoadState('domcontentloaded');

    await page.fill('input[name="username"], input[id="username"]', 'adminuser');
    await page.fill('input[name="password"], input[id="password"]', 'adminpassword');
    await page.click('button[type="submit"], button:has-text("Sign"), button:has-text("Login")');

    // Wait for the redirect back to the app (Keycloak OAuth callback -> NextAuth -> app home)
    // This ensures the next-auth.session-token cookie gets set
    await page.waitForURL(/^http:\/\/localhost:3000\//, { timeout: 30000 });
    await page.waitForSelector('text=Population', { timeout: 30000 });

    await page.context().storageState({ path: pathToAuthStorage });
});
