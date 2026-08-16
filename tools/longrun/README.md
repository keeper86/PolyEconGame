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
- `metrics.ts` — extracts ~50 headline metrics from `GameState` each sample,
  including an **existential-vs-non-existential labor split** (see below).
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

## Labor-tier metrics

`metrics.ts` also splits worker slots and fill by whether a facility belongs to
the **existential chain** (water → agriculture → food processor → grocery, plus
hospital/pharma) or the **non-existential** bucket (construction/mining/machinery
and everything else). Classification is by facility type, the same name→key map
used by the scale diagnostic.

Per-tier metrics written to `series.csv`:

- `existentialSlotCapacity` / `nonExistentialSlotCapacity` — Σ `totalSlotCapacity`
  (bodies needed at current productivity) for that tier.
- `existentialUsedWorkers` / `nonExistentialUsedWorkers` — Σ `assets.usedWorkers`.
- `existentialFillRatio` / `nonExistentialFillRatio` / `foodChainFillRatio` —
  used ÷ slots (the food-chain ratio covers only agriculture→food→grocery).
- `existentialMaxScale` / `nonExistentialMaxScale` — Σ **capacity** (`maxScale`),
  not operating scale. This is the number that contraction would have to shrink.
- `existentialOperatingScale` / `nonExistentialOperatingScale` — Σ `scale` (the
  PID-controlled operating level, ≥ 10% of `maxScale`).
- `existentialContractionIntegral` / `nonExistentialContractionIntegral` — Σ
  `pidState.contractionIntegral` (the gate that must reach 30 to shrink by 0.5%).
- `existentialNegativeProfitFacilities` / `...AtLowerBoundFacilities` — counts of
  facilities already at the contraction preconditions (`profitEMA < 0`, `scale ≤
  0.1 × maxScale`).

The distinction between `MaxScale` (capacity) and `OperatingScale` matters: the
PID sheds *operating* scale quickly, but capacity only shrinks via the 0.5%-per-
event contraction gate, so `MaxScale` can keep **growing** even while the economy
collapses.

## Maintenance-market metrics

Added to `series.csv` to trace the maintenance-service spiral (baseline price
`11 → 195 → 3,984 → 75,052`, condition `0.95 → 0.42 → 0`):

- `maintFacilityScale` / `maintFacilityMaxScale` — Σ operating / capacity scale of
  the `Maintenance Facility` agents (baseline sheds 178 → 85 by year 2).
- `maintFacilityCondition` — scale-weighted condition of the maintenance producers
  (they maintain themselves, so this is the self-maintenance coupling).
- `maintFacilityOutput` — Σ `lastProduced[maintenance]` (real supply per tick).
- `maintFacilityCostFloor` — `planet.lastProductionCostFloors[maintenance]`.
- `maintAggregateConsumption` — Σ `lastTickMaintenanceConsumption` (actual repair
  consumed across all facilities).
- `maintSteadyStateDemand` — Σ `facilityMaintenanceConsumptionPerTick` (what bids
  assume; excludes the catch-up repair surge).
- `maintCatchupBacklog` — Σ `max(0, maxMaintenance − status) · scale · 100` (repair
  owed when conditions dip).
- `maintAggregateBuffer` — Σ maintenance inventory across all agents.
- `maintFillRate` — `volume / demand` (structurally < 1 whenever the 3-tick stock
  target exceeds per-tick production).
- `maintRepairSurgeRatio` — `consumption / steadyStateDemand` (> 1 flags the
  catch-up repair surge that overwhelms steady-state-sized capacity).

## Maintenance diagnosis (what the matrix shows)

The maintenance market collapses in two phases. First, the maintenance facility
offers its **entire buffer** every tick (services skip sell-smoothing), so its
production signal reads the dump as "unsold supply" and contracts 178 → 85 during
year 1–2 even though fill rate is below target. Second, once conditions dip for
any reason, repair demand surges to the `FACILITY_MAINTENANCE_REPAIR_PER_TICK =
0.025` cap — ~4.5× the steady-state decay rate — which steady-state-sized
capacity (17.8K/tick vs ~8K steady consumption) cannot meet. Persistent low fill
rate then compounds the bid price +5%/tick, and the cost spiral (maintenance ↑ →
all cost floors ↑ → maintenance bid ceiling ↑) runs to `PRICE_CEIL`, collapsing
condition and the food chain.

`maintenanceRich` (3× capacity) survives the full horizon — capacity margin for
the repair surge is the binding fix. `maintenanceBufferDeep` makes it *worse*: the
30-tick stock target is un-fillable in one tick, so fill rate collapses and the
price spiral starts earlier.

`maintenanceNoConditionMalus` (`disableConditionEfficiency=true`, a temporary
diagnostic toggle on `computeFacilityConditionEfficiency`) shows the collapse is
**not solely** the condition→production link: with the malus off, condition no
longer reduces output, yet the maintenance price still spirals (`12.6 → 160,074`)
and the economy still collapses — just ~5 years later (y8–9). The condition malus
is an *amplifier*; the root cause is the maintenance **price spiral** itself
(fill-rate → +5%/tick bid compounding, amplified by the cross-resource cost loop
maintenance ↑ → steel/electronics/plastic cost floors ↑ → maintenance cost floor ↑
→ maintenance bid ceiling ↑).

Neutralizing the other internal-service effects (`disableHrProductivityEffect`,
`disableStorageStarvationEffect`) shows none is the cause on its own: `hrNoEffect`
still dies (y5–6) and `storageNoEffect` still dies (y8–9). But disabling **all
three** (`allInternalNoEffect`) stops the death — population degrades to ~85% and
plateaus. So the full collapse is the *compound* of the three internal-service
maluses (condition→production, HR→productivity, storage→loss) acting on top of the
persistent maintenance price spiral; the spiral alone degrades, the maluses make
it fatal.

## Scenarios

| name | knob | what we expect |
|---|---|---|
| `baseline` | none | stable population, low starvation, high fill rate over 30y |
| `waterCapped` | `waterPoolQuantity` tiny | water price ↑, population ↓ to carrying capacity |
| `lowEmployable` | `employableFraction=0.4` | high dependency ratio, wages ↑, near-full employment |
| `rawRichManuPoor` | raw pools ×3, low-tier scale ×1.5, high-tier scale ×0.3 | raw prices ↓, manufactured/services prices ↑ |
| `rawPoorManuRich` | raw pools ×0.3, low-tier scale ×0.3, high-tier scale ×3 | raw prices ↑, manufacturing idles |
| `maintenanceRich` | `maintenanceScaleFactor=3` | 3× maintenance capacity survives the 10y run (baseline collapses at y3–4) |
| `maintenanceBufferDeep` | `maintenanceBufferTicks=30` | 30-tick maintenance buffer fails via price spiral (fill rate ~0.1) |
| `maintenanceRichBufferDeep` | `maintenanceScaleFactor=3, maintenanceBufferTicks=30` | combined; still collapses at y7 via price spiral |
| `maintenanceNoConditionMalus` | `disableConditionEfficiency=true` | condition→production link off; still collapses (y8–9) — proves the price spiral is the root cause, not condition |
| `hrNoEffect` | `disableHrProductivityEffect=true` | HR coverage→productivity off; still collapses (y5–6) — HR is a symptom, not the cause |
| `storageNoEffect` | `disableStorageStarvationEffect=true` | storage-starvation loss/decay off; still collapses (y8–9) — storage is barely strained, not the cause |
| `allInternalNoEffect` | condition + HR + storage effects all off | **does not die** — degrades to ~85% population and plateaus; the three maluses together are what make the spiral fatal |

"Low tier" = raw + refined; "high tier" = manufactured + services (per
`RESOURCE_LEVELS` in `resourceCatalog.ts`).

## Bands

A band is `{ metric, horizonYears, windowYears, min?, max?, relativeToStart? }`.
It averages the metric over the trailing `windowYears` before `horizonYears`.
When `relativeToStart` is set, `min`/`max` are ratios against the metric's own
year-1 value. The bands in `scenarios.ts` are **initial hypotheses** — run in
`report` mode first, read the yearly table, then tighten them.

## Notice 
Make sure to set SIM_DEBUG!=1 when running the long-run harness. 
