# Benchmark Scripts

Scripts for load testing and latency benchmarking the PolyEconGame local deployment.

## Prerequisites

1. **Local deployment running**:
   ```bash
   docker compose -f docker-compose.local.yaml up --build -d
   ```

2. **Node dependencies installed**:
   ```bash
   npm install
   ```

3. **Playwright auth state** (optional, enables cookie-based auth):
   ```bash
   npx playwright test tests/e2e/auth.setup.ts
   ```

## Authentication

The benchmark scripts handle authentication automatically — no manual setup required.

Three authentication methods are tried in order:

| Priority | Method | Notes |
|----------|--------|-------|
| 1 | `K6_SESSION_COOKIES` env var | JSON object with cookie name → value pairs |
| 2 | Playwright storage state | Reads `playwright/.auth/auth.json` (from Playwright auth setup) |
| 3 | OAuth flow (auto) | Programmatically walks Keycloak → NextAuth sign-in |

**Method 3** (automatic OAuth flow) works without any pre-generated files.

---

## Node.js tRPC Benchmark (Recommended)

Uses the real `@trpc/client` library — the **exact same** tRPC client used by the frontend.
No wire-protocol guessing, no Goja engine bugs — real V8 JavaScript with TypeScript type safety.

### Usage

```bash
# Run all scenarios (light + medium + heavy + mixed)
npx tsx tools/benchmark/node/trpc-benchmark.ts

# Single scenario
npx tsx tools/benchmark/node/trpc-benchmark.ts --scenario=light
npx tsx tools/benchmark/node/trpc-benchmark.ts --scenario=medium
npx tsx tools/benchmark/node/trpc-benchmark.ts --scenario=heavy
npx tsx tools/benchmark/node/trpc-benchmark.ts --scenario=mixed

# Virtual users (concurrent requests)
npx tsx tools/benchmark/node/trpc-benchmark.ts --vu=10

# Timed run (30 seconds)
npx tsx tools/benchmark/node/trpc-benchmark.ts --duration=30 --vu=5

# Verbose: per-procedure breakdown table (sorted by avg latency descending)
npx tsx tools/benchmark/node/trpc-benchmark.ts --verbose

# CI mode: fails with exit code 1 if thresholds are violated
npx tsx tools/benchmark/node/trpc-benchmark.ts --ci

# Ramp test: gradually increases VUs to find saturation point
npx tsx tools/benchmark/node/trpc-benchmark.ts --ramp --vu=20 --duration=60
```

### Advanced Features (NEW)

#### 1. Per-Procedure Ranking Table (`--verbose`)

Prints a table of every tRPC procedure ranked by average latency, including count,
P95, min, max, and success ratio. This surfaces the specific bottlenecks:

```
=== PER-PROCEDURE RANKING (sorted by avg descending) ===
  Procedure                                              Count   Avg(ms)  P95(ms)  Min(ms)  Max(ms)  OK/Total
  ---------------------------------------------------------------------------------------------------------
  getLatestAgents                                           10     9772    14750     6769    15365     10/10
  getPlanetMarketOverview                                    7     6173    12349     5416    12349      7/7
  ...
```

#### 2. CI Threshold Enforcement (`--ci`)

Exits with code 1 if any procedure exceeds the defined thresholds:

| Category | Success Rate | P95 Latency |
|----------|-------------|-------------|
| Light    | ≥ 95%       | < 500ms     |
| Medium   | ≥ 95%       | < 2000ms    |
| Heavy    | ≥ 90%       | < 5000ms    |
| Mixed    | ≥ 92%       | < 4000ms    |

Useful in CI pipelines:
```bash
npx tsx tools/benchmark/node/trpc-benchmark.ts --ci && echo "PASS"
```

#### 3. Step-Load Ramp Test (`--ramp`)

Gradually increases VU count in steps (up to 10) over the duration to find the
system's saturation point. Each step runs for equal time with mixed traffic.

Outputs a summary table showing how latency and throughput degrade as load increases:

```
=== RAMP TEST SUMMARY ===
  VUs     Duration   Requests  Throughput  Avg(ms)  P95(ms)  Failures
  ---------------------------------------------------------------------------
    2    5.0s           82       16.4     1234     4567       0/82
    4    5.0s          156       31.2     2567     7890       0/156
  ...
```

#### 4. Fixed MIXED Scenario

The `--scenario=mixed` and `all` modes now use a weighted distribution sampler
(40% light, 35% medium, 25% heavy) with 6 sampled operations per VU iteration,
providing a statistically balanced traffic mix comparable to other scenarios.

### CLI Flags Reference

| Flag | Default | Description |
|------|---------|-------------|
| `--vu=N` | 1 | Number of virtual users |
| `--duration=N` | 0 (single run) | Test duration in seconds |
| `--concurrency=N` | 10 | Max concurrent requests per VU |
| `--scenario=X` | all | light / medium / heavy / mixed / all |
| `--verbose` | off | Print per-procedure breakdown table |
| `--ci` | off | Enable threshold enforcement, exit 1 on failure |
| `--ramp` | off | Step-load ramp mode (requires --duration) |

### npm shortcuts

```bash
npm run benchmark          # all scenarios, 1 VU
npm run benchmark:light    # light only
npm run benchmark:medium   # medium only
npm run benchmark:heavy    # heavy only
npm run benchmark:mixed    # mixed only
npm run benchmark:verbose  # all scenarios with per-procedure table
npm run benchmark:ci       # all scenarios with CI threshold enforcement
npm run benchmark:ramp     # ramp test: 20 VUs, 60s
```

### Results

Results are written to `tools/benchmark/results/node-{scenario}-{timestamp}.json`.

---

## k6 Load Tests (Legacy)

> **Note:** k6 uses the Goja JS engine which has closure scoping bugs that cause intermittent
> authentication and parameter parsing failures. The Node.js tRPC benchmark above is the
> recommended alternative.

All k6 scripts authenticate once in `setup()`, then run the benchmark with multiple virtual users.

#### Light scenario (landing page, health, summaries)
```bash
k6 run tools/benchmark/k6/scenarios/light.spec.js
```

#### Medium scenario (planet detail, economy, central bank)
```bash
k6 run tools/benchmark/k6/scenarios/medium.spec.js
```

#### Heavy scenario (demographics, market detail, arbitrage)
```bash
k6 run tools/benchmark/k6/scenarios/heavy.spec.js
```

#### Mixed scenario (simulates real traffic mix)
```bash
k6 run tools/benchmark/k6/scenarios/mixed.spec.js
```

---

## Playwright Browser Benchmark

Measures full page load times including client-side rendering and hydration:

```bash
npx playwright test tools/benchmark/playwright/page-latency.spec.ts
```

For headed mode to watch the browser:
```bash
npx playwright test tools/benchmark/playwright/page-latency.spec.ts --headed
```

Results are written to `benchmark-results/page-latency-results.json`.

---

## Test Coverage

### tRPC endpoints tested (Node.js / k6)
| Category | Endpoints |
|----------|-----------|
| Light | `health`, `getCurrentTick`, `getLatestPlanetSummaries`, `getLatestAgents` |
| Medium | `getPlanetDetail`, `getPlanetEconomy`, `getPlanetDemographics`, `getPlanetMarketOverview`, `getPlanetClaims`, `getPlanetPopulationHistory`, `getPlanetEconomyHistory`, `getAgentListSummaries`, `getAgentOverview`, `getAgentPlanetDetail`, `getAgentFinancials`, `getAgentClaims`, `getTickerEvents` |
| Heavy | `getPlanetDemographicsFull`, `getPlanetMarket`, `getPlanetBufferHistory`, `getProductPriceHistory`, `getArbitrageForResources`, `getArbitrageRoutes`, `getAgentHistory`, `getAgentFinancialHistory`, `getLoanConditions`, `getAgentDetail` |

### Pages tested (Playwright browser tests)
| Category | Pages |
|----------|-------|
| Light | `/`, `/imprint`, `/simulation` |
| Planet | `/planets/{id}/central-bank`, `/planets/{id}/demographics`, `/planets/{id}/companies`, `/planets/{id}/claims` |
| Agent | `/planets/{id}/agent/{id}/{financial,workforce,production,storage,market,ships}` |
| Account | `/account` |

## Thresholds & Grading

| Category | Success Rate | P95 Latency |
|----------|-------------|-------------|
| Light | ≥ 95% | < 500ms |
| Medium | ≥ 95% | < 2000ms |
| Heavy | ≥ 90% | < 5000ms |
| Mixed | ≥ 92% | < 4000ms |

These are reasonable starting points — adjust based on your hardware and requirements.