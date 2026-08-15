# Long-run economy harness

Headless, full-economy benchmark that runs the real `advanceTick` engine on a
**reduced single-planet world** (2–4 agents per product, ~130 agents total) and
samples a fixed set of headline metrics over decades. It is deliberately **not**
part of CI — there are no `*.test.ts` files here and nothing is wired into
`npm run test:all`.

## Why

The production world (Earth + Alpha Centauri + small planets + forex/ships/
arbitrage) is too big and too noisy for decade-scale stability work. This harness
isolates one self-contained planet so the "slow ~15y decline" is reproducible and
measurable, with enough data to pinpoint the core issue.

## Layout

- `world.ts` — builds the reduced benchmark world (`buildBenchmarkWorld`).
- `metrics.ts` — extracts ~30 headline metrics from `GameState` each sample.
- `scenarios.ts` — the 5 scenarios (baseline + 4 stress) and their bands.
- `run.ts` — runs one scenario, samples monthly, writes `series.csv` + `summary.json`.
- `solverDiagnostic.ts` — 3-way facility-scale comparison (solver vs computeTargets vs actual).
- `diagnostic.ts` — standalone seed-gap + yearly scale-drift report.
- `orchestrator.ts` — runs all scenarios in parallel (one OS process each).

## Run

```bash
# one scenario
npx tsx tools/longrun/run.ts --scenario=baseline
npx tsx tools/longrun/run.ts --scenario=waterCapped --years=30 --bands=strict

# all scenarios in parallel (4 processes)
npx tsx tools/longrun/orchestrator.ts
```

Options: `--scenario=<name>`, `--years=<n>` (default 30), `--bands=off|report|strict`,
`--debug` (re-enables `SIM_DEBUG=1` invariant checks — slow, for diagnosing only).
`report` (default) logs band results but always exits 0; `strict` exits 1 on failures.

By default the runner **deletes `SIM_DEBUG`** so the expensive per-tick invariant
checks never run (they ~3× the tick cost and would make timings meaningless).
Only pass `--debug` when you actually want to run the invariants.

Results land in `tools/longrun/results/<scenario>/`:

- `series.csv` — monthly time series of every metric.
- `summary.json` — yearly means, band results, `msPerTick` / `ticksPerSecond`.
- `seedGap.txt` — tick-0 three-way scale comparison (solver vs computeTargets vs seeded vs actual).
- `scaleGaps.csv` — yearly grouped scale-gap ratios + in-flight construction backlog.
- `run.log` — console output (orchestrator only).

## Scale diagnostic

```bash
# seed-gap report at tick 0 (no ticks advanced)
npx tsx tools/longrun/diagnostic.ts --scenario=baseline

# seed-gap + yearly drift over N years
npx tsx tools/longrun/diagnostic.ts --scenario=baseline --years=5
```

`run.ts` also writes the tick-0 `seedGap.txt` and yearly `scaleGaps.csv` on every
run. The diagnostic compares **three** scale models per facility:

1. **solver** — `solveSupplyChain` just-in-time floor (minimal scale to meet
   population service demand, ~0 slack).
2. **targets** — `computeTargetScales` re-run at this population (the slack-based
   model behind `FACILITY_SCALE_PER_BILLION`).
3. **seeded** — `FACILITY_SCALE_PER_BILLION × population` (what the world actually
   seeds).

plus **actual** (Σ `facility.scale` across agents). Facilities are classified via a
dependency-graph walk from the 5 population services:

- **population-facing** (`P`) — everything transitively feeding grocery / healthcare /
  retail / education / logistics. Statically derivable from population.
- **endogenous** (`E`) — the construction chain (`Construction Facility`,
  `Concrete Plant`, `Cement Plant`, `Stone Quarry`) plus facility services
  (`Administrative Center`, `Maintenance Facility`). Their demand is driven by the
  *existing* facility stock and the expansion rate, so it **cannot be derived from
  population** — the solver's ~0 is as arbitrary as computeTargets' fixed
  `CONSTRUCTION_DEMAND_PER_TICK = 1_512_000_000`.

### What it shows

- Population-facing facilities are seeded at ~2.25× the just-in-time floor
  (computeTargets' 1.2–1.5× slack compounds down the chain), and stay there.
- The construction chain is seeded ~37 000× the just-in-time floor and contracts
  aggressively (e.g. `Construction Facility` 2646 → ~1300 in year 1, `Concrete
  Plant` 2646 → ~265) as `automaticProductionScale` sheds the excess.
- `computeTargetScales` run live at benchmark population produces absurd targets
  (construction ≈ 2.1M) because `constructionDemandPerTick` is a **fixed** 1.5B/tick
  constant that does not scale with population — only the linearized
  `FACILITY_SCALE_PER_BILLION` path in `world.ts` tames it.

## Scenarios

| name | knob | what we expect |
|---|---|---|
| `baseline` | none | stable population, low starvation, high fill rate over 30y |
| `waterCapped` | `waterPoolQuantity` tiny | water price ↑, population ↓ to carrying capacity |
| `lowEmployable` | `employableFraction=0.4` | high dependency ratio, wages ↑, near-full employment |
| `rawRichManuPoor` | raw pools ×3, low-tier scale ×1.5, high-tier scale ×0.3 | raw prices ↓, manufactured/services prices ↑ |
| `rawPoorManuRich` | raw pools ×0.3, low-tier scale ×0.3, high-tier scale ×3 | raw prices ↑, manufacturing idles |

"Low tier" = raw + refined; "high tier" = manufactured + services (per
`RESOURCE_LEVELS` in `resourceCatalog.ts`).

## Bands

A band is `{ metric, horizonYears, windowYears, min?, max?, relativeToStart? }`.
It averages the metric over the trailing `windowYears` before `horizonYears`.
When `relativeToStart` is set, `min`/`max` are ratios against the metric's own
year-1 value. The bands in `scenarios.ts` are **initial hypotheses** — run in
`report` mode first, read the yearly table, then tighten them.

## Notice 
Make sure to set SIM_DEBUG!=1 when running the long-run harness. Otherwise 
