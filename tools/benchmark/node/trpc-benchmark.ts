#!/usr/bin/env tsx
/**
 * Node.js tRPC benchmark using the real @trpc/client.
 *
 * Unlike k6 (where Goja closure scoping bugs cause intermittent auth/param failures),
 * this uses the exact same createTRPCProxyClient as the frontend, with real V8 JS.
 *
 * Usage:
 *   npx tsx tools/benchmark/node/trpc-benchmark.ts                    # all scenarios
 *   npx tsx tools/benchmark/node/trpc-benchmark.ts --scenario=light   # single scenario
 *   npx tsx tools/benchmark/node/trpc-benchmark.ts --vu=20            # 20 virtual users
 *   npx tsx tools/benchmark/node/trpc-benchmark.ts --duration=30      # 30 seconds
 *   npx tsx tools/benchmark/node/trpc-benchmark.ts --concurrency=10   # max 10 concurrent requests
 *   npx tsx tools/benchmark/node/trpc-benchmark.ts --verbose          # per-procedure breakdown table
 *   npx tsx tools/benchmark/node/trpc-benchmark.ts --ci               # exit with code 1 on threshold breach
 *   npx tsx tools/benchmark/node/trpc-benchmark.ts --ramp --vu=20 --duration=60  # step-load ramp test
 *
 * Auth methods (tried in order):
 *   1. K6_SESSION_COOKIES env var (JSON object of cookie name → value)
 *   2. playwright/.auth/auth.json (Playwright storage state)
 *   3. Programmatic OAuth flow via Keycloak (auto login)
 */

import { createTRPCProxyClient, httpLink } from '@trpc/client';
import type { AppRouter } from '../../src/server/router';
import fs from 'fs';
import path from 'path';

// =============================================================================
// Configuration
// =============================================================================

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const TEST_USER = process.env.TEST_USER || 'adminuser';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'adminpassword';
const DEFAULT_PLANET_ID = 'earth';

// =============================================================================
// Thresholds (matching README) — used in --ci mode
// =============================================================================

const DEFAULT_THRESHOLDS = {
    light: { minSuccessRate: 0.95, maxP95Ms: 500 },
    medium: { minSuccessRate: 0.95, maxP95Ms: 2000 },
    heavy: { minSuccessRate: 0.90, maxP95Ms: 5000 },
    mixed: { minSuccessRate: 0.92, maxP95Ms: 4000 },
} as const;

// =============================================================================
// Types
// =============================================================================

interface BenchmarkResult {
    scenario: string;
    procedure: string;
    success: boolean;
    durationMs: number;
    status: number | string;
    error?: string;
}

interface PerProcStats {
    count: number;
    avg: number;
    p95: number;
    min: number;
    max: number;
    successes: number;
    failures: number;
}

// =============================================================================
// Concurrency limiter — simple semaphore
// =============================================================================

class Semaphore {
    private max: number;
    private running = 0;
    private queue: (() => void)[] = [];

    constructor(max: number) {
        this.max = max;
    }

    async acquire(): Promise<void> {
        if (this.running < this.max) {
            this.running++;
            return;
        }
        return new Promise(resolve => {
            this.queue.push(() => {
                this.running++;
                resolve();
            });
        });
    }

    release(): void {
        this.running--;
        if (this.queue.length > 0) {
            const next = this.queue.shift()!;
            next();
        }
    }

    async run<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }
}

// =============================================================================
// Retry helper
// =============================================================================

async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 1): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (e: any) {
            if (attempt < maxRetries) {
                const msg = e.message || String(e);
                // Only retry on transport-level errors (connection drops, empty responses)
                // Do NOT retry on HTTP errors (4xx, 5xx) or validation errors
                const isTransient = (
                    msg.includes('Unexpected end of JSON input') ||
                    msg.includes('fetch failed') ||
                    msg.includes('network error') ||
                    msg.includes('socket hang up') ||
                    msg.includes('ECONNRESET') ||
                    msg.includes('ETIMEDOUT') ||
                    msg.includes('Premature close')
                );
                if (isTransient) {
                    await new Promise(r => setTimeout(r, 100));
                    continue;
                }
            }
            throw e;
        }
    }
    throw new Error('unreachable');
}

// =============================================================================
// Auth
// =============================================================================

async function resolveCookiesAsync(): Promise<Record<string, string>> {
    const cookieEnv = process.env.K6_SESSION_COOKIES;
    if (cookieEnv) {
        try {
            const cookies = JSON.parse(cookieEnv);
            console.log(`[auth] Loaded ${Object.keys(cookies).length} cookies from K6_SESSION_COOKIES`);
            return cookies;
        } catch (e) {
            console.error(`[auth] Failed to parse K6_SESSION_COOKIES: ${e}`);
        }
    }

    const storagePath = process.env.PLAYWRIGHT_STORAGE || path.resolve('playwright/.auth/auth.json');
    if (fs.existsSync(storagePath)) {
        try {
            const storage = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
            const cookies: Record<string, string> = {};
            for (const c of storage.cookies || []) {
                if (
                    c.name.startsWith('next-auth.session-token') ||
                    c.name === 'next-auth.csrf-token' ||
                    c.name === 'next-auth.callback-url'
                ) {
                    cookies[c.name] = decodeURIComponent(c.value);
                }
            }
            if (Object.keys(cookies).length > 0) {
                console.log(`[auth] Loaded ${Object.keys(cookies).length} cookies from Playwright storage`);
                return cookies;
            }
        } catch (e) {
            console.error(`[auth] Failed to read Playwright storage: ${e}`);
        }
    }

    console.log('[auth] Attempting OAuth flow...');
    return oauthLoginAsync();
}

async function oauthLoginAsync(): Promise<Record<string, string>> {
    const cookieJar = new Map<string, string>();

    async function fetchWithCookies(url: string, options: RequestInit = {}): Promise<Response> {
        const cookieParts: string[] = [];
        for (const [name, value] of cookieJar) {
            cookieParts.push(`${name}=${value}`);
        }
        const headers = new Headers(options.headers);
        if (cookieParts.length > 0) {
            headers.set('Cookie', cookieParts.join('; '));
        }
        const res = await fetch(url, { ...options, headers, redirect: 'manual' });

        const setCookie = res.headers.get('set-cookie');
        if (setCookie) {
            const cookies = setCookie.split(/, (?=[a-zA-Z])/);
            for (const c of cookies) {
                const [cookiePair] = c.split(';');
                const eqIdx = cookiePair.indexOf('=');
                if (eqIdx > 0) {
                    cookieJar.set(cookiePair.substring(0, eqIdx).trim(), cookiePair.substring(eqIdx + 1).trim());
                }
            }
        }
        return res;
    }

    const csrfRes = await fetchWithCookies(`${BASE_URL}/api/auth/csrf`);
    const csrfBody = await csrfRes.json();
    const csrfToken = csrfBody.csrfToken;

    const signinRes = await fetchWithCookies(`${BASE_URL}/api/auth/signin/keycloak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `csrfToken=${encodeURIComponent(csrfToken)}&callbackUrl=${encodeURIComponent(BASE_URL)}&json=true`,
    });
    const signinBody = await signinRes.json();
    const authzUrl = signinBody.url;

    const formRes = await fetchWithCookies(authzUrl);
    const html = await formRes.text();

    const actionMatch = html.match(/<form[^>]+action\s*=\s*"([^"]+)"/i);
    if (!actionMatch) throw new Error('Could not find login form action in Keycloak response');
    const formAction = actionMatch[1];
    const loginUrl = formAction.startsWith('http') ? formAction : `${KEYCLOAK_URL}${formAction.startsWith('/') ? '' : '/'}${formAction}`;

    const formData: Record<string, string> = {};
    const inputRegex = /<input[^>]+type\s*=\s*"hidden"[^>]+name\s*=\s*"([^"]+)"[^>]+value\s*=\s*"([^"]*)"[^>]*>/gi;
    let m;
    while ((m = inputRegex.exec(html)) !== null) {
        formData[m[1]] = m[2];
    }
    formData.username = TEST_USER;
    formData.password = TEST_PASSWORD;

    const loginPayload = Object.entries(formData)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    const loginRes = await fetchWithCookies(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: loginPayload,
    });
    if (loginRes.status !== 302 && loginRes.status !== 303) {
        throw new Error(`Keycloak login failed (HTTP ${loginRes.status})`);
    }

    let location = loginRes.headers.get('location');
    for (let i = 0; i < 10 && location; i++) {
        const callbackUrl = location.startsWith('http') ? location : `${BASE_URL}${location.startsWith('/') ? '' : '/'}${location}`;
        const res = await fetchWithCookies(callbackUrl);
        location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
        if (!location) break;
    }

    const cookies: Record<string, string> = {};
    for (const [name, value] of cookieJar) {
        if (
            name.startsWith('next-auth.session-token') ||
            name === 'next-auth.csrf-token' ||
            name === 'next-auth.callback-url'
        ) {
            cookies[name] = value;
        }
    }
    if (!cookies['next-auth.session-token']) {
        throw new Error('No next-auth.session-token cookie was set after OAuth callback');
    }
    console.log(`[auth] OAuth login successful (${Object.keys(cookies).length} cookies)`);
    return cookies;
}

// =============================================================================
// tRPC client — uses httpLink (NOT httpBatchLink) so each query is a separate
// HTTP request with accurate per-procedure timing, and load spreads naturally.
// =============================================================================

function createBenchmarkClient(cookies: Record<string, string>) {
    const cookieHeader = Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');

    return createTRPCProxyClient<AppRouter>({
        links: [
            httpLink({
                url: `${BASE_URL}/api/trpc`,
                headers: { Cookie: cookieHeader },
            }),
        ],
    });
}

// =============================================================================
// Data discovery
// =============================================================================

interface TestData {
    primaryPlanet: string;
    planets: string[];
    agentId: string | null;
}

async function discoverTestData(client: ReturnType<typeof createBenchmarkClient>): Promise<TestData> {
    const tick = await client.simulation.getCurrentTick.query();
    console.log(`[discovery] Current tick: ${tick.tick}`);

    const planetSummaries = await client.simulation.getLatestPlanetSummaries.query();
    const planets = planetSummaries.planets.map(p => p.planetId);
    console.log(`[discovery] Discovered ${planets.length} planets: ${planets.slice(0, 5).join(', ')}...`);
    const primaryPlanet = planets[0] || DEFAULT_PLANET_ID;

    let agentId: string | null = null;
    try {
        const agentSummaries = await client.simulation.getAgentListSummaries.query({
            planetId: primaryPlanet,
            showAll: false,
        });
        if (agentSummaries.agents.length > 0) {
            agentId = agentSummaries.agents[0].agentId;
            console.log(`[discovery] Found agent: ${agentId}`);
        }
    } catch {
        console.log(`[discovery] No agents found on ${primaryPlanet}`);
    }

    if (!agentId) {
        console.log(`[discovery] Creating test agent on ${primaryPlanet}...`);
        try {
            const result = await client.createAgent.mutate({
                agentName: 'benchmark-agent',
                planetId: primaryPlanet,
            });
            agentId = result.agentId;
            console.log(`[discovery] Created agent: ${agentId}`);
        } catch (e: any) {
            console.error(`[discovery] Failed to create agent: ${e.message}`);
        }
    }

    return { primaryPlanet, planets, agentId };
}

// =============================================================================
// Scenario runners (wrap each query call with semaphore + retry)
// =============================================================================

type Client = ReturnType<typeof createBenchmarkClient>;

function record(start: number, scenario: string, procedure: string, success: boolean, results: BenchmarkResult[], status: number | string, error?: string) {
    results.push({ scenario, procedure, success, durationMs: performance.now() - start, status, error });
}

/**
 * Run a measured operation inside the semaphore.
 * The timer starts AFTER acquiring the semaphore slot, so queue wait time
 * does NOT inflate latency measurements.
 */
async function runMeasured<T>(
    sem: Semaphore,
    scenario: string,
    procedure: string,
    results: BenchmarkResult[],
    fn: () => Promise<T>,
    successStatus: number | string = 200
): Promise<void> {
    let start = 0;
    try {
        await sem.run(async () => {
            start = performance.now();
            return withRetry(() => fn(), procedure);
        });
        record(start, scenario, procedure, true, results, successStatus);
    } catch (e: any) {
        record(start, scenario, procedure, false, results, e.data?.httpStatus || 'error', e.message);
    }
}

// =============================================================================
// Mixed scenario — weighted distribution that simulates real user traffic
// =============================================================================

interface MixedOp {
    name: string;
    weight: number;
    run: (client: Client, td: TestData, sem: Semaphore) => Promise<void>;
}

function createMixedOperations(client: Client, td: TestData, sem: Semaphore, results: BenchmarkResult[]): MixedOp[] {
    const ops: MixedOp[] = [
        // Light operations (40% of traffic)
        { name: 'health', weight: 10, run: async () => { await runMeasured(sem, 'mixed', 'health', results, () => client.health.query()); } },
        { name: 'getCurrentTick', weight: 10, run: async () => { await runMeasured(sem, 'mixed', 'getCurrentTick', results, () => client.simulation.getCurrentTick.query()); } },
        { name: 'getLatestPlanetSummaries', weight: 10, run: async () => { await runMeasured(sem, 'mixed', 'getLatestPlanetSummaries', results, () => client.simulation.getLatestPlanetSummaries.query()); } },
        { name: 'getLatestAgents', weight: 10, run: async () => { await runMeasured(sem, 'mixed', 'getLatestAgents', results, () => client.simulation.getLatestAgents.query()); } },

        // Medium operations (35% of traffic)
        { name: 'getPlanetDetail', weight: 5, run: async () => { await runMeasured(sem, 'mixed', 'getPlanetDetail', results, () => client.simulation.getPlanetDetail.query({ planetId: td.primaryPlanet })); } },
        { name: 'getPlanetEconomy', weight: 5, run: async () => { await runMeasured(sem, 'mixed', 'getPlanetEconomy', results, () => client.simulation.getPlanetEconomy.query({ planetId: td.primaryPlanet })); } },
        { name: 'getPlanetDemographics', weight: 5, run: async () => { await runMeasured(sem, 'mixed', 'getPlanetDemographics', results, () => client.simulation.getPlanetDemographics.query({ planetId: td.primaryPlanet })); } },
        { name: 'getPlanetMarketOverview', weight: 5, run: async () => { await runMeasured(sem, 'mixed', 'getPlanetMarketOverview', results, () => client.simulation.getPlanetMarketOverview.query({ planetId: td.primaryPlanet, average: false })); } },
        { name: 'getPlanetClaims', weight: 3, run: async () => { await runMeasured(sem, 'mixed', 'getPlanetClaims', results, () => client.simulation.getPlanetClaims.query({ planetId: td.primaryPlanet })); } },
        { name: 'getTickerEvents', weight: 3, run: async () => { await runMeasured(sem, 'mixed', 'getTickerEvents', results, () => client.simulation.getTickerEvents.query()); } },
        ...(td.agentId ? [
            { name: 'getAgentListSummaries', weight: 3, run: async () => { await runMeasured(sem, 'mixed', 'getAgentListSummaries', results, () => client.simulation.getAgentListSummaries.query({ planetId: td.primaryPlanet, showAll: false })); } },
            { name: 'getAgentOverview', weight: 3, run: async () => { await runMeasured(sem, 'mixed', 'getAgentOverview', results, () => client.simulation.getAgentOverview.query({ agentId: td.agentId! })); } },
            { name: 'getAgentPlanetDetail', weight: 2, run: async () => { await runMeasured(sem, 'mixed', 'getAgentPlanetDetail', results, () => client.simulation.getAgentPlanetDetail.query({ agentId: td.agentId!, planetId: td.primaryPlanet })); } },
            { name: 'getAgentFinancials', weight: 2, run: async () => { await runMeasured(sem, 'mixed', 'getAgentFinancials', results, () => client.simulation.getAgentFinancials.query({ agentId: td.agentId!, planetId: td.primaryPlanet })); } },
            { name: 'getAgentClaims', weight: 2, run: async () => { await runMeasured(sem, 'mixed', 'getAgentClaims', results, () => client.simulation.getAgentClaims.query({ agentId: td.agentId!, planetId: td.primaryPlanet })); } },
        ] as MixedOp[] : []),

        // Heavy operations (25% of traffic)
        { name: 'getPlanetDemographicsFull', weight: 3, run: async () => { await runMeasured(sem, 'mixed', 'getPlanetDemographicsFull', results, () => client.simulation.getPlanetDemographicsFull.query({ planetId: td.primaryPlanet, groupMode: 'occupation', activeSkills: ['novice', 'professional', 'expert'] })); } },
        { name: 'getPlanetBufferHistory', weight: 3, run: async () => { await runMeasured(sem, 'mixed', 'getPlanetBufferHistory', results, () => client.simulation.getPlanetBufferHistory.query({ planetId: td.primaryPlanet, granularity: 'monthly', limit: 100 })); } },
        { name: 'getProductPriceHistory(Produce)', weight: 3, run: async () => { await runMeasured(sem, 'mixed', 'getProductPriceHistory(Produce)', results, () => client.simulation.getProductPriceHistory.query({ planetId: td.primaryPlanet, productName: 'Produce', granularity: 'monthly', limit: 100 })); } },
        { name: 'getArbitrageForResources', weight: 3, run: async () => { await runMeasured(sem, 'mixed', 'getArbitrageForResources', results, () => client.simulation.getArbitrageForResources.query({ resourceNames: ['Produce', 'Iron Ore', 'Steel', 'Machinery', 'Chemical'] })); } },
        ...(td.agentId ? [
            { name: 'getAgentHistory', weight: 2, run: async () => { await runMeasured(sem, 'mixed', 'getAgentHistory', results, () => client.simulation.getAgentHistory.query({ agentId: td.agentId!, planetId: td.primaryPlanet, granularity: 'monthly', limit: 100 })); } },
            { name: 'getAgentFinancialHistory', weight: 2, run: async () => { await runMeasured(sem, 'mixed', 'getAgentFinancialHistory', results, () => client.simulation.getAgentFinancialHistory.query({ agentId: td.agentId!, planetId: td.primaryPlanet, granularity: 'monthly', limit: 26 })); } },
            { name: 'getLoanConditions', weight: 2, run: async () => { await runMeasured(sem, 'mixed', 'getLoanConditions', results, () => client.simulation.getLoanConditions.query({ agentId: td.agentId!, planetId: td.primaryPlanet })); } },
            { name: 'getAgentDetail', weight: 2, run: async () => { await runMeasured(sem, 'mixed', 'getAgentDetail', results, () => client.simulation.getAgentDetail.query({ agentId: td.agentId! })); } },
        ] as MixedOp[] : []),
    ];
    return ops;
}

/**
 * Sample N operations from a weighted distribution without replacement.
 * This ensures each VU iteration runs a diverse set of operations.
 */
function sampleWeighted(ops: MixedOp[], count: number): MixedOp[] {
    if (ops.length <= count) return ops;
    const totalWeight = ops.reduce((s, o) => s + o.weight, 0);
    const selected: MixedOp[] = [];
    const available = [...ops];
    for (let i = 0; i < count; i++) {
        const availWeight = available.reduce((s, o) => s + o.weight, 0);
        let pick = Math.random() * availWeight;
        for (let j = 0; j < available.length; j++) {
            pick -= available[j].weight;
            if (pick <= 0) {
                selected.push(available[j]);
                available.splice(j, 1);
                break;
            }
        }
    }
    return selected;
}

// =============================================================================
// Scenario runners
// =============================================================================

async function runLight(client: Client, td: TestData, sem: Semaphore, results: BenchmarkResult[]) {
    const queries: [string, () => Promise<any>][] = [
        ['health', () => client.health.query()],
        ['simulation.getCurrentTick', () => client.simulation.getCurrentTick.query()],
        ['simulation.getLatestPlanetSummaries', () => client.simulation.getLatestPlanetSummaries.query()],
        ['simulation.getLatestAgents', () => client.simulation.getLatestAgents.query()],
    ];
    for (const [name, fn] of queries) {
        await runMeasured(sem, 'light', name, results, fn);
    }
}

async function runMedium(client: Client, td: TestData, sem: Semaphore, results: BenchmarkResult[]) {
    const queries: [string, () => Promise<any>][] = [
        ['simulation.getPlanetDetail', () => client.simulation.getPlanetDetail.query({ planetId: td.primaryPlanet })],
        ['simulation.getPlanetEconomy', () => client.simulation.getPlanetEconomy.query({ planetId: td.primaryPlanet })],
        ['simulation.getPlanetDemographics', () => client.simulation.getPlanetDemographics.query({ planetId: td.primaryPlanet })],
        ['simulation.getPlanetMarketOverview', () => client.simulation.getPlanetMarketOverview.query({ planetId: td.primaryPlanet, average: false })],
        ['simulation.getPlanetClaims', () => client.simulation.getPlanetClaims.query({ planetId: td.primaryPlanet })],
        ['simulation.getPlanetPopulationHistory', () => client.simulation.getPlanetPopulationHistory.query({ planetId: td.primaryPlanet, granularity: 'monthly', limit: 12 })],
        ['simulation.getPlanetEconomyHistory', () => client.simulation.getPlanetEconomyHistory.query({ planetId: td.primaryPlanet, granularity: 'monthly', limit: 12 })],
        ['simulation.getTickerEvents', () => client.simulation.getTickerEvents.query()],
    ];
    if (td.agentId) {
        queries.push(
            ['simulation.getAgentListSummaries', () => client.simulation.getAgentListSummaries.query({ planetId: td.primaryPlanet, showAll: false })],
            ['simulation.getAgentOverview', () => client.simulation.getAgentOverview.query({ agentId: td.agentId! })],
            ['simulation.getAgentPlanetDetail', () => client.simulation.getAgentPlanetDetail.query({ agentId: td.agentId!, planetId: td.primaryPlanet })],
            ['simulation.getAgentFinancials', () => client.simulation.getAgentFinancials.query({ agentId: td.agentId!, planetId: td.primaryPlanet })],
            ['simulation.getAgentClaims', () => client.simulation.getAgentClaims.query({ agentId: td.agentId!, planetId: td.primaryPlanet })],
        );
    }
    for (const [name, fn] of queries) {
        await runMeasured(sem, 'medium', name, results, fn);
    }
}

async function runHeavy(client: Client, td: TestData, sem: Semaphore, results: BenchmarkResult[]) {
    const queries: [string, () => Promise<any>][] = [
        ['getPlanetDemographicsFull(occupation)', () => client.simulation.getPlanetDemographicsFull.query({ planetId: td.primaryPlanet, groupMode: 'occupation', activeSkills: ['novice', 'professional', 'expert'] })],
        ['getPlanetDemographicsFull(education)', () => client.simulation.getPlanetDemographicsFull.query({ planetId: td.primaryPlanet, groupMode: 'education', activeSkills: ['novice', 'professional', 'expert'] })],
        ['getPlanetBufferHistory', () => client.simulation.getPlanetBufferHistory.query({ planetId: td.primaryPlanet, granularity: 'monthly', limit: 100 })],
        ...(['Produce', 'Iron Ore', 'Steel', 'Machinery'] as const).map(p => [`getProductPriceHistory(${p})`, () => client.simulation.getProductPriceHistory.query({ planetId: td.primaryPlanet, productName: p, granularity: 'monthly', limit: 100 })] as [string, () => Promise<any>]),        
    ];
    if (td.agentId) {
        queries.push(
            ['getAgentHistory', () => client.simulation.getAgentHistory.query({ agentId: td.agentId!, planetId: td.primaryPlanet, granularity: 'monthly', limit: 100 })],
            ['getAgentFinancialHistory', () => client.simulation.getAgentFinancialHistory.query({ agentId: td.agentId!, planetId: td.primaryPlanet, granularity: 'monthly', limit: 26 })],
            ['getLoanConditions', () => client.simulation.getLoanConditions.query({ agentId: td.agentId!, planetId: td.primaryPlanet })],
            ['getAgentDetail', () => client.simulation.getAgentDetail.query({ agentId: td.agentId! })],
        );
    }
    for (const [name, fn] of queries) {
        await runMeasured(sem, 'heavy', name, results, fn);
    }
}

// =============================================================================
// Per-procedure results (for --verbose)
// =============================================================================

function computePerProcedureStats(results: BenchmarkResult[]): Map<string, PerProcStats> {
    const map = new Map<string, { durations: number[]; successes: number; failures: number }>();
    for (const r of results) {
        let bucket = map.get(r.procedure);
        if (!bucket) {
            bucket = { durations: [], successes: 0, failures: 0 };
            map.set(r.procedure, bucket);
        }
        bucket.durations.push(r.durationMs);
        if (r.success) bucket.successes++;
        else bucket.failures++;
    }

    const out = new Map<string, PerProcStats>();
    for (const [name, bucket] of map) {
        const sorted = [...bucket.durations].sort((a, b) => a - b);
        const n = sorted.length;
        out.set(name, {
            count: n,
            avg: n > 0 ? sorted.reduce((a, b) => a + b, 0) / n : 0,
            p95: n > 0 ? sorted[Math.ceil(n * 0.95) - 1] || sorted[n - 1] : 0,
            min: sorted[0] || 0,
            max: sorted[n - 1] || 0,
            successes: bucket.successes,
            failures: bucket.failures,
        });
    }
    return out;
}

function printPerProcedureTable(results: BenchmarkResult[]) {
    const stats = computePerProcedureStats(results);
    const sorted = [...stats.entries()].sort((a, b) => b[1].avg - a[1].avg);

    console.log('\n=== PER-PROCEDURE RANKING (sorted by avg descending) ===');
    console.log('  Procedure'.padEnd(55) + 'Count   Avg(ms)  P95(ms)  Min(ms)  Max(ms)  OK/Total');
    console.log('  ' + '-'.repeat(105));
    for (const [name, s] of sorted) {
        const label = name.length > 52 ? name.substring(0, 49) + '...' : name;
        const okRatio = `${s.successes}/${s.count}`;
        console.log(`  ${label.padEnd(54)} ${String(s.count).padStart(5)} ${String(Math.round(s.avg)).padStart(8)} ${String(Math.round(s.p95)).padStart(8)} ${String(Math.round(s.min)).padStart(7)} ${String(Math.round(s.max)).padStart(7)}  ${okRatio}`);
    }
    console.log('');
}

// =============================================================================
// Threshold checking (for --ci)
// =============================================================================

interface ThresholdViolation {
    procedure: string;
    metric: string;
    actual: number;
    threshold: number;
}

function checkThresholds(results: BenchmarkResult[], scenario: string): ThresholdViolation[] {
    const stats = computePerProcedureStats(results);
    const thresholds = DEFAULT_THRESHOLDS[scenario as keyof typeof DEFAULT_THRESHOLDS] || DEFAULT_THRESHOLDS.mixed;
    const violations: ThresholdViolation[] = [];

    for (const [name, s] of stats) {
        const successRate = s.count > 0 ? s.successes / s.count : 0;
        if (successRate < thresholds.minSuccessRate) {
            violations.push({
                procedure: name,
                metric: 'success rate',
                actual: successRate,
                threshold: thresholds.minSuccessRate,
            });
        }
        if (s.p95 > thresholds.maxP95Ms) {
            violations.push({
                procedure: name,
                metric: 'P95 latency',
                actual: s.p95,
                threshold: thresholds.maxP95Ms,
            });
        }
    }
    return violations;
}

function printCiResult(allResults: BenchmarkResult[]): boolean {
    let passed = true;
    const byScenario: Record<string, BenchmarkResult[]> = {};
    for (const r of allResults) { (byScenario[r.scenario] ??= []).push(r); }

    for (const [scenario, results] of Object.entries(byScenario)) {
        const violations = checkThresholds(results, scenario);
        if (violations.length === 0) {
            console.log(`  ✓ ${scenario}: all thresholds passed`);
        } else {
            passed = false;
            console.log(`  ✗ ${scenario}: ${violations.length} threshold violation(s)`);
            for (const v of violations) {
                const actualFormatted = v.metric === 'success rate'
                    ? `${(v.actual * 100).toFixed(1)}%`
                    : `${Math.round(v.actual)}ms`;
                const thresholdFormatted = v.metric === 'success rate'
                    ? `${(v.threshold * 100).toFixed(0)}%`
                    : `${Math.round(v.threshold)}ms`;
                console.log(`       ${v.procedure}: ${v.metric} ${actualFormatted} (threshold: ${thresholdFormatted})`);
            }
        }
    }
    return passed;
}

// =============================================================================
// Summary printers
// =============================================================================

function printSummary(results: BenchmarkResult[], label: string) {
    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);
    const durs = successes.map(r => r.durationMs).sort((a, b) => a - b);
    const avg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
    const p95 = durs.length ? durs[Math.ceil(durs.length * 0.95) - 1] || durs[durs.length - 1] : 0;
    const throughput = durs.length > 0 ? (results.length / (durs[durs.length - 1] / 1000)).toFixed(1) : 'N/A';

    console.log(`\n=== ${label} ===`);
    console.log(`  Requests: ${results.length} | OK: ${successes.length} | FAIL: ${failures.length} | Throughput: ${throughput} req/s`);
    console.log(`  Avg: ${avg.toFixed(0)}ms | P95: ${p95.toFixed(0)}ms | Min: ${durs[0]?.toFixed(0) || 0}ms | Max: ${durs[durs.length - 1]?.toFixed(0) || 0}ms`);
    console.log(`  Success rate: ${results.length ? (successes.length / results.length * 100).toFixed(1) : 0}%`);
    if (failures.length) {
        console.log('  Failures:');
        for (const f of failures.slice(0, 10)) console.log(`    ${f.procedure}: ${(f.error || '').substring(0, 100)}`);
    }
}

// =============================================================================
// Ramp test — gradually increase VUs and report per-step metrics
// =============================================================================

interface RampStepMetrics {
    vuCount: number;
    durationMs: number;
    totalRequests: number;
    successes: number;
    failures: number;
    avgLatency: number;
    p95Latency: number;
    throughput: number; // req/s
}

async function runRampBenchmark(
    client: Client,
    td: TestData,
    sem: Semaphore,
    maxVUs: number,
    durationSec: number,
    allResults: BenchmarkResult[],
) {
    const steps = Math.min(maxVUs, 10); // max 10 steps
    const vuPerStep = Math.floor(maxVUs / steps);
    const stepDurationSec = Math.max(Math.floor(durationSec / steps), 5);
    const stepResults: RampStepMetrics[] = [];

    console.log(`\n[ramp] Starting ramp test: ${steps} steps, ${stepDurationSec}s per step, ${vuPerStep} VU per step`);

    for (let step = 0; step < steps; step++) {
        const currentVUs = (step + 1) * vuPerStep;
        const stepStart = performance.now();
        let stepCount = 0;
        const stepEnd = Date.now() + stepDurationSec * 1000;

        console.log(`\n[ramp] Step ${step + 1}/${steps}: ${currentVUs} VUs for ${stepDurationSec}s`);

        while (Date.now() < stepEnd) {
            const batch: Promise<void>[] = [];

            // Run one iteration with current VU count
            for (let vu = 0; vu < currentVUs; vu++) {
                if (vu > 0) await new Promise(r => setTimeout(r, 10));
                batch.push((async () => {
                    const r: BenchmarkResult[] = [];
                    // Mixed traffic per VU per ramp step
                    const mixedOps = createMixedOperations(client, td, sem, r);
                    const sampled = sampleWeighted(mixedOps, 4);
                    await Promise.all(sampled.map(op => op.run(client, td, sem)));
                    allResults.push(...r);
                })());
            }
            await Promise.all(batch);
            stepCount += currentVUs;
            if (Date.now() >= stepEnd) break;
            await new Promise(r => setTimeout(r, 100));
        }

        const stepElapsed = performance.now() - stepStart;
        const successes = allResults.filter(r => r.success).length;
        const stepResultsSlice = allResults.slice(-stepCount);
        const durs = stepResultsSlice.filter(r => r.success).map(r => r.durationMs).sort((a, b) => a - b);
        const avg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
        const p95 = durs.length ? durs[Math.ceil(durs.length * 0.95) - 1] || durs[durs.length - 1] : 0;

        stepResults.push({
            vuCount: currentVUs,
            durationMs: stepElapsed,
            totalRequests: stepResultsSlice.length,
            successes: durs.length,
            failures: stepResultsSlice.length - durs.length,
            avgLatency: avg,
            p95Latency: p95,
            throughput: stepElapsed > 0 ? (stepResultsSlice.length / (stepElapsed / 1000)) : 0,
        });

        console.log(`  → ${stepResultsSlice.length} requests | Avg: ${avg.toFixed(0)}ms | P95: ${p95.toFixed(0)}ms | Throughput: ${(stepElapsed > 0 ? (stepResultsSlice.length / (stepElapsed / 1000)) : 0).toFixed(1)} req/s`);
    }

    // Print ramp summary table
    console.log('\n=== RAMP TEST SUMMARY ===');
    console.log('  VUs     Duration   Requests  Throughput  Avg(ms)  P95(ms)  Failures');
    console.log('  ' + '-'.repeat(75));
    for (const s of stepResults) {
        console.log(`  ${String(s.vuCount).padStart(4)}   ${(s.durationMs / 1000).toFixed(1)}s    ${String(s.totalRequests).padStart(8)}    ${s.throughput.toFixed(1).padStart(8)}  ${String(Math.round(s.avgLatency)).padStart(7)}  ${String(Math.round(s.p95Latency)).padStart(7)}   ${s.failures}/${s.totalRequests}`);
    }
    console.log('');
}

// =============================================================================
// Main
// =============================================================================

async function main() {
    const args = process.argv.slice(2);
    const scenario = args.find(a => a.startsWith('--scenario='))?.split('=')[1] || 'all';
    const vuCount = parseInt(args.find(a => a.startsWith('--vu='))?.split('=')[1] || '1', 10);
    const durationSec = parseInt(args.find(a => a.startsWith('--duration='))?.split('=')[1] || '0', 10);
    const concurrency = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '10', 10);
    const verbose = args.includes('--verbose');
    const ci = args.includes('--ci');
    const ramp = args.includes('--ramp');
    const baseline = args.includes('--baseline');
    const valid = ['light', 'medium', 'heavy', 'mixed', 'all'];

    if (!valid.includes(scenario)) {
        console.error(`Invalid scenario: "${scenario}". Valid: ${valid.join(', ')}`);
        process.exit(1);
    }

    const sem = new Semaphore(concurrency);

    console.log(`PolyEconGame tRPC Benchmark | URL: ${BASE_URL} | Scenario: ${scenario} | VUs: ${vuCount}${durationSec ? ` | Duration: ${durationSec}s` : ' | Single run'} | Concurrency: ${concurrency}${ramp ? ' | RAMP' : ''}${ci ? ' | CI' : ''}${verbose ? ' | VERBOSE' : ''}${baseline ? ' | BASELINE' : ''}`);

    const cookies = await resolveCookiesAsync();
    if (!Object.keys(cookies).length) { console.error('No auth cookies'); process.exit(1); }

    const client = createBenchmarkClient(cookies);

    // Verify
    try {
        await client.health.query();
        const { tick } = await client.simulation.getCurrentTick.query();
        console.log(`[verify] Connectivity OK (tick: ${tick})`);
    } catch (e: any) { console.error(`[verify] FAILED: ${e.message}`); process.exit(1); }

    const td = await discoverTestData(client);
    console.log(`[data] Planet: ${td.primaryPlanet} | Agent: ${td.agentId || 'none'}`);

    const allResults: BenchmarkResult[] = [];

    // =============================================================================
    // BASELINE MODE — hit health endpoint only to establish a latency baseline
    // =============================================================================
    if (baseline) {
        console.log('\n[baseline] Running health endpoint baseline (100 calls)...');
        for (let i = 0; i < 100; i++) {
            await runMeasured(sem, 'baseline', 'health', allResults, () => client.health.query());
        }
        const durs = allResults.filter(r => r.success).map(r => r.durationMs).sort((a, b) => a - b);
        const avg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
        const p95 = durs.length ? durs[Math.ceil(durs.length * 0.95) - 1] || durs[durs.length - 1] : 0;
        console.log(`[baseline] Health endpoint: ${allResults.length} requests, Avg: ${avg.toFixed(1)}ms, P95: ${p95.toFixed(1)}ms`);
        return;
    }

    // =============================================================================
    // RAMP MODE
    // =============================================================================
    if (ramp) {
        if (!durationSec) {
            console.error('--ramp requires --duration=N');
            process.exit(1);
        }
        await runRampBenchmark(client, td, sem, vuCount, durationSec, allResults);

        const outDir = path.resolve('tools/benchmark/results');
        fs.mkdirSync(outDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        fs.writeFileSync(path.join(outDir, `node-ramp-${ts}.json`), JSON.stringify({
            timestamp: new Date().toISOString(),
            scenario: 'ramp',
            baseUrl: BASE_URL,
            maxVirtualUsers: vuCount,
            concurrency,
            totalRequests: allResults.length,
            successes: allResults.filter(r => r.success).length,
            failures: allResults.filter(r => !r.success).length,
            results: allResults,
        }, null, 2));
        console.log(`\nResults → tools/benchmark/results/node-ramp-${ts}.json`);
        return;
    }

    // =============================================================================
    // STANDARD MODE (single run or timed)
    // =============================================================================
    const endTime = durationSec ? Date.now() + durationSec * 1000 : 0;
    const iterations = durationSec ? Infinity : 1;
    let iterCount = 0;

    while (iterCount < iterations && (!endTime || Date.now() < endTime)) {
        iterCount++;
        const batch: Promise<void>[] = [];

        for (let vu = 0; vu < vuCount; vu++) {
            // Stagger VU launches by 50ms to avoid thundering-herd startup spike
            if (vu > 0) await new Promise(r => setTimeout(r, 50));

            batch.push((async () => {
                const r: BenchmarkResult[] = [];

                if (scenario === 'all' || scenario === 'light') {
                    await runLight(client, td, sem, r);
                }
                if (scenario === 'all' || scenario === 'medium') {
                    await runMedium(client, td, sem, r);
                }
                if (scenario === 'all' || scenario === 'heavy') {
                    await runHeavy(client, td, sem, r);
                }

                // MIXED / "all" scenario: run a balanced sample of mixed operations
                if (scenario === 'all' || scenario === 'mixed') {
                    const mixedOps = createMixedOperations(client, td, sem, r);
                    // Run 6 sampled operations per VU iteration for balanced sampling
                    const sampled = sampleWeighted(mixedOps, 6);
                    await Promise.all(sampled.map(op => op.run(client, td, sem)));
                }

                allResults.push(...r);
            })());
        }

        await Promise.all(batch);
        if (endTime) await new Promise(r => setTimeout(r, 100));
    }

    // =============================================================================
    // Output
    // =============================================================================

    if (scenario === 'all') {
        const byScenario: Record<string, BenchmarkResult[]> = {};
        for (const r of allResults) { (byScenario[r.scenario] ??= []).push(r); }
        for (const [s, rr] of Object.entries(byScenario)) printSummary(rr, s.toUpperCase());
    } else {
        printSummary(allResults, scenario.toUpperCase());
    }

    // Per-procedure table
    if (verbose) {
        printPerProcedureTable(allResults);
    }

    // CI threshold check
    let ciPassed = true;
    if (ci) {
        console.log('\n=== CI THRESHOLD CHECK ===');
        ciPassed = printCiResult(allResults);
        console.log(ciPassed ? '  ✓ ALL THRESHOLDS PASSED' : '  ✗ SOME THRESHOLDS FAILED');
        console.log('');
    }

    const outDir = path.resolve('tools/benchmark/results');
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outFile = `node-${scenario}${ramp ? '-ramp' : ''}-${ts}.json`;
    fs.writeFileSync(path.join(outDir, outFile), JSON.stringify({
        timestamp: new Date().toISOString(),
        scenario,
        baseUrl: BASE_URL,
        virtualUsers: vuCount,
        concurrency,
        totalRequests: allResults.length,
        successes: allResults.filter(r => r.success).length,
        failures: allResults.filter(r => !r.success).length,
        results: allResults,
    }, null, 2));
    console.log(`\nResults → tools/benchmark/results/${outFile}`);

    if (ci && !ciPassed) {
        process.exit(1);
    }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });