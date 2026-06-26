/**
 * Playwright-based browser-level latency benchmark.
 *
 * Measures full page load times (including client-side rendering & hydration)
 * for various pages across the application.
 *
 * Usage:
 *   npx playwright test tools/benchmark/playwright/page-latency.spec.ts
 *
 * Requires:
 *   - Local deployment running (docker compose)
 *   - Test user (adminuser) already has an agent (run the guided tour e2e first)
 *     OR the test will navigate from the founding page
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Results file path
const RESULTS_DIR = path.resolve(process.cwd(), 'benchmark-results');
const RESULTS_FILE = path.join(RESULTS_DIR, 'page-latency-results.json');

interface PageTiming {
    page: string;
    label: string;
    loadTimeMs: number;
    ttiMs: number | null;
    domContentLoadedMs: number;
    firstPaintMs: number | null;
    timestamp: string;
    error?: string;
}

interface BenchmarkResults {
    startedAt: string;
    baseUrl: string;
    results: PageTiming[];
    summary: {
        totalPages: number;
        avgLoadTime: number;
        maxLoadTime: number;
        minLoadTime: number;
        p95LoadTime: number;
        failures: number;
    };
}

test.describe('Page Latency Benchmark', () => {
    // Increase timeouts for benchmark
    test.describe.configure({ timeout: 120000, retries: 0 });

    const results: PageTiming[] = [];
    const BASE_URL = process.env.BASE_URL || 'http://app.localhost:3000';

    test.afterAll(async () => {
        // Write results to file
        if (!fs.existsSync(RESULTS_DIR)) {
            fs.mkdirSync(RESULTS_DIR, { recursive: true });
        }

        const loadTimes = results.filter(r => r.error === undefined).map(r => r.loadTimeMs);
        const sorted = [...loadTimes].sort((a, b) => a - b);

        const summary: BenchmarkResults['summary'] = {
            totalPages: results.length,
            avgLoadTime: loadTimes.length > 0 ? loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length : 0,
            maxLoadTime: loadTimes.length > 0 ? Math.max(...loadTimes) : 0,
            minLoadTime: loadTimes.length > 0 ? Math.min(...loadTimes) : 0,
            p95LoadTime: sorted.length > 0 ? sorted[Math.ceil(sorted.length * 0.95) - 1] || sorted[sorted.length - 1] : 0,
            failures: results.filter(r => r.error !== undefined).length,
        };

        const output: BenchmarkResults = {
            startedAt: results[0]?.timestamp || new Date().toISOString(),
            baseUrl: BASE_URL,
            results,
            summary,
        };

        fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2));
        console.log(`\n========================================`);
        console.log(`Benchmark results written to: ${RESULTS_FILE}`);
        console.log(`Summary:`);
        console.log(`  Pages tested: ${summary.totalPages}`);
        console.log(`  Failures: ${summary.failures}`);
        console.log(`  Avg load time: ${summary.avgLoadTime.toFixed(0)}ms`);
        console.log(`  P95 load time: ${summary.p95LoadTime.toFixed(0)}ms`);
        console.log(`  Max load time: ${summary.maxLoadTime.toFixed(0)}ms`);
        console.log(`  Min load time: ${summary.minLoadTime.toFixed(0)}ms`);
        console.log(`========================================\n`);
    });

    /**
     * Measure page load time including network idle.
     */
    async function measurePage(page: import('@playwright/test').Page, url: string, label: string): Promise<PageTiming> {
        const timing: PageTiming = {
            page: url,
            label,
            loadTimeMs: 0,
            ttiMs: null,
            domContentLoadedMs: 0,
            firstPaintMs: null,
            timestamp: new Date().toISOString(),
        };

        try {
            const startTime = Date.now();

            await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
            timing.loadTimeMs = Date.now() - startTime;

            // Get performance metrics from the browser
            const perfTiming = await page.evaluate(() => {
                const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
                const paint = performance.getEntriesByType('paint');
                const firstPaint = paint.find(
                    (p) => p.name === 'first-paint' || p.name === 'first-contentful-paint'
                );

                return {
                    domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
                    firstPaintStart: firstPaint ? firstPaint.startTime : null,
                };
            }).catch(() => ({ domContentLoaded: 0, firstPaintStart: null }));

            timing.domContentLoadedMs = perfTiming.domContentLoaded || 0;
            timing.firstPaintMs = perfTiming.firstPaintStart !== null ? Math.round(perfTiming.firstPaintStart) : null;

            console.log(`  ✓ ${label}: ${timing.loadTimeMs}ms (DOM: ${timing.domContentLoadedMs}ms)`);
        } catch (err) {
            timing.error = err instanceof Error ? err.message : String(err);
            timing.loadTimeMs = Date.now() - parseInt(timing.timestamp);
            console.error(`  ✗ ${label}: FAILED - ${timing.error}`);
        }

        results.push(timing);
        return timing;
    }

    // ======================================================================
    // Light pages
    // ======================================================================
    test('Light pages', async ({ page }) => {
        // Home page (may redirect if authenticated)
        await measurePage(page, `${BASE_URL}/`, 'Home / Landing');

        // Imprint (static)
        await measurePage(page, `${BASE_URL}/imprint`, 'Imprint');

        // Simulation model (mostly static)
        await measurePage(page, `${BASE_URL}/simulation`, 'Simulation Model');
    });

    // ======================================================================
    // Planet pages
    // ======================================================================
    test('Planet pages', async ({ page }) => {
        // First discover planet ID from the page
        await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

        // Navigate to a known planet via the URL
        // We need to find a planet link from the page
        const planetLink = await page.locator('a[href*="/planets/"]').first().getAttribute('href').catch(() => null);
        let planetId = 'alpha-centauri';

        if (planetLink) {
            const match = planetLink.match(/\/planets\/([^/]+)/);
            if (match) {
                planetId = match[1];
            }
        }

        // Central bank page
        await measurePage(page, `${BASE_URL}/planets/${planetId}/central-bank`, 'Central Bank');

        // Demographics page
        await measurePage(page, `${BASE_URL}/planets/${planetId}/demographics`, 'Demographics');

        // Companies page
        await measurePage(page, `${BASE_URL}/planets/${planetId}/companies`, 'Companies');

        // Claims page
        await measurePage(page, `${BASE_URL}/planets/${planetId}/claims`, 'Claims');
    });

    // ======================================================================
    // Agent sub-pages
    // ======================================================================
    test('Agent sub-pages', async ({ page }) => {
        // We need an agent ID. Try to find one from the planet page.
        await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

        // Navigate to planets page and find an agent link
        // First, get planet ID
        const planetLink = await page.locator('a[href*="/planets/"]').first().getAttribute('href').catch(() => null);
        let planetId = 'alpha-centauri';
        let agentId: string | null = null;

        if (planetLink) {
            const match = planetLink.match(/\/planets\/([^/]+)/);
            if (match) {
                planetId = match[1];
            }
        }

        // Try to find an agent link
        const agentLink = await page
            .locator(`a[href*="/planets/${planetId}/agent/"]`)
            .first()
            .getAttribute('href')
            .catch(() => null);

        if (agentLink) {
            const match = agentLink.match(/\/agent\/([^/]+)/);
            if (match) {
                agentId = match[1];
            }
        }

        if (!agentId) {
            console.warn('No agent ID found on the page. Skipping agent sub-page tests.');
            return;
        }

        // Test each agent sub-page
        const agentPages = [
            { path: '', label: 'Agent Overview' },
            { path: '/financial', label: 'Agent Finances' },
            { path: '/workforce', label: 'Agent Workforce' },
            { path: '/production', label: 'Agent Production' },
            { path: '/storage', label: 'Agent Storage' },
            { path: '/market', label: 'Agent Market' },
            { path: '/ships', label: 'Agent Ships' },
        ];

        for (const agentPage of agentPages) {
            await measurePage(page, `${BASE_URL}/planets/${planetId}/agent/${agentId}${agentPage.path}`, agentPage.label);
        }
    });

    // ======================================================================
    // Account page
    // ======================================================================
    test('Account page', async ({ page }) => {
        await measurePage(page, `${BASE_URL}/account`, 'Account Settings');
    });
});