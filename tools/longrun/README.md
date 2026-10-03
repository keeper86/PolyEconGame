# Long-Run Simulation Tooling

Headless, deterministic benchmark runs of the simulation engine. Used to test long-horizon
stability (population, prices, facility condition, banking) and to isolate the effect of a
mechanism change by comparing scenario results against a `baseline` reference.

Runs are CPU-bound single-process simulations of a synthetic 10M-person planet (`world.ts`).
There is no database, web server or worker thread involved — only `advanceTick`.

## Quick start

Run the `baseline` scenario for its default horizon (30 years) with band reporting:

```sh
npx tsx tools/longrun/run.ts --scenario=baseline
```

Run a scenario for a custom horizon and write results under a custom output directory:

```sh
npx tsx tools/longrun/run.ts --scenario=wealthTax --years=50 --out=my-experiment
```

Run all scenarios in parallel (spawns one process per scenario):

```sh
npx tsx tools/longrun/orchestrator.ts --years=30 --bands=strict
```

## The `run.ts` CLI

| Flag | Default | Meaning |
| --- | --- | --- |
| `--scenario=<name>` | `baseline` | Scenario to run, see list below. |
| `--years=<n>` | scenario default | Number of simulated years (360 ticks per year). |
| `--bands=report\|strict\|off` | `report` | Band check mode: `report` prints PASS/FAIL per band, `strict` additionally exits with code 1 on any failure, `off` skips band evaluation. |
| `--out=<dir>` | scenario name | Output directory under `results/`. **Must be empty/non-existent** for a fresh run — a fresh run into a dir that already contains results (e.g. reused name from a previous or still-running run) is refused, because run.ts would truncate `series.csv`/`scaleGaps.csv` and then mix rows from the two runs (unsorted ticks). Pick a fresh name, or pass `--resume` to continue the SAME run from its checkpoint. |
| `--debug` | off | Enables `SIM_DEBUG=1` (assertions + verbose warnings). Slower; use for short runs. |
| `--agentsPerProduct=<n>` | scenario | Overrides agent count per product. |
| `--slack=<n>` | scenario | Overrides the LP-solver seed slack. |
| `--constructionScaleFactor=<n>` | scenario | Overrides construction-chain seed scaling. |
| `--buildChainScaleFactor=<n>` | scenario | Overrides build-chain seed scaling. |
| `--interestRate=<n>` | scenario | Sets the annual loan rate (0.05 = 5%). |
| `--bankruptcyWriteOffFraction=<n>` | scenario | Sets the bankruptcy debt write-off fraction (1.0 = full write-off). |
| `--costSpringStrength=<n>` | scenario | Overrides the agent-personality cost-spring strength (0.35 = default). |
| `--populationWealthTax=on\|off` | off | Enables the wealth tax on rich population cohorts (see below). |
| `--claimCostMultiplier=<n>` | — | Overrides the non-renewable claim cost multiplier. |
| `--wealthTaxAllowance=<n>` | — | Overrides the wealth tax allowance. |
| `--refineryMinAskMultiplier=<n>` | — | Soft-min ask for refinery agents only: `automatedCostFloorBuffer` (brake zone top = cost floor × n). |
| `--refineryPriceAdjustMaxDown=<n>` | — | Caps refinery sell-price cuts per step (closer to 1.0 = less aggressive). |
| `--refineryTargetSellThrough=<n>` | — | Refinery sell-through target (lower = less volume chasing). |
| `--seed=<n>` | scenario seed | Overrides the world RNG seed (default: scenario's seed, 1001). Useful for checking whether a collapse is a fluke of one seed. With the orchestrator, results go to `<scenario>-s<seed>/`. |
| `--resourceMultiplier=<n>` | scenario/world | Scales ALL resource pools (renewable + non-renewable) by `n`. Default is `100` (both the world builder and the `storage-controller` scenario); pass `<100` to stress finite-resource scarcity (e.g. `longrun-resources10` uses 10). |
| `--oilReservoirMultiplier=<n>` | — | Scales the non-renewable oil reservoir *further*, on top of `--resourceMultiplier` (1.0 = the ×multiplier base of 1e9 units). |
| `--checkpointEveryYears=<n>` | `50` | Saves a checkpoint (serialized game state + RNG state) every `n` years into `<out>/checkpoint.{json,bin}`. |
| `--resume` | off | Resumes from the latest checkpoint in `<out>/` instead of building a fresh world. Errors if no checkpoint exists in `<out>/`. |

| `--serviceSellThrough=<n>` | `0.70` | Sell-side target sell-through for *service* offers (e.g. 0.90). Higher → services cut offers harder when sell-through is below target. |
| `--serviceFillRate=<n>` | `0.70` | Buy-side target fill-rate for *service* bids (e.g. 0.85). Higher → buyers bid harder to keep service buffers full. |
| `--serviceDecayTarget=<n>` | `0.30` | Service-flow autoscale decay target: share of produced service that may decay beyond the day-shield before the facility is asked to contract. |
| `--storageTargetMonths=<n>` | `3` | Goods storage target buffer in months of max-scale output (drives autoscale storage signal). |
| `--storageCapacityMonths=<n>` | `6` | Goods storage max buffer in months of max-scale output (storage-space clamp). |

## Checkpointing

Very long runs (e.g. 6000y ≈ 40-60h) are fully resumable:

- Checkpoints are saved every `--checkpointEveryYears` years and on `SIGINT`/`SIGTERM`.
- A checkpoint is two files in the output dir: `checkpoint.json` (scenario/seed/years/tick,
  the RNG state `[s0, s1]`, and `prevPopulation`) and `checkpoint.bin` (the msgpack+gzip game
  state, same codec the live game uses).
- Resume with the exact same `--scenario`, `--years`, `--seed` and `--out` plus `--resume`.
  The resumed run is bit-for-bit identical to an uninterrupted run (verified: 0 differing
  metric cells across the whole series after the resume point).
- The simulation loop yields to the event loop every 30 ticks so signals are handled promptly.
  Kill the actual `node` process (recorded as `pid` in `checkpoint.json`), not the `npx` wrapper
  — `npx` does not forward `SIGTERM`.
- On clean completion the checkpoint is removed; a completed run cannot be resumed.

```sh
# launch a 6000y run
npx tsx tools/longrun/run.ts --scenario=longrun-resources10 --checkpointEveryYears=50 --bands=off
# … kill / crash / reboot … resume exactly where it stopped:
npx tsx tools/longrun/run.ts --scenario=longrun-resources10 --checkpointEveryYears=50 --bands=off --resume
```

### Do not reuse an output dir for a different run

`series.csv` / `scaleGaps.csv` are streamed with `fs.appendFileSync` as the run progresses. A fresh run
strictly truncates them and starts at tick 0. If you launch a fresh (non-`--resume`) run into a dir that
already has results — e.g. you reuse the same `--out=<name>` for a second experiment, or a relaunch of the
*longer* version of a run you already started with fewer years and no checkpoint — the new process truncates
the files while the earlier process (or the leftover rows) are still being appended, and you end up with a
`series.csv` whose rows jump around (`.csv` has unsorted, interleaved ticks like `4740,4770,30,4800,...`).

run.ts refuses this now: a fresh run into a non-empty result dir aborts with a clear error, and
`--resume` with no checkpoint aborts too. Workflow:
- **New experiment** → use a brand-new `--out=<name>`.
- **Continue the same long run** after a crash/kill → replay the exact commandline with `--resume`
  (it continues from `checkpoint.{json,bin}` and merges the already-streamed rows).
- If you ended up with a polluted file (mixed ticks), treat that run's `series.csv` as unusable and
  restart into a fresh `--out=`; the checkpoint contents are still authoritative.


## Scenarios

Defined in `scenarios.ts` (name → world config + stability bands). Every run uses `seed=1001`
unless the scenario says otherwise, so identical inputs produce identical outputs.

| Scenario | Horizon | What it tests |
| --- | --- | --- |
| `baseline` | 30y | Balanced control run; the economy must stay stable. |
| `bankruptcyHaircut` | 30y | 50% write-off, debt rolls over at 5%. |
| `interest10` | 30y | Full write-off, loans at 10%. |
| `interest5-wo66` / `interest5-wo90` / `interest5-wo95` | 30y | 5% loans with 66%/90%/95% write-off. |
| `interest7.5-wo75` | 30y | Middle path between baseline and the 10% stress case. |
| `waterCapped` | 30y | Capped water; population must shrink to carrying capacity. |
| `lowEmployable` | 30y | Only 40% of working-age population employable. |
| `rawRichManuPoor` / `rawPoorManuRich` | 30y | Asymmetric raw vs. manufactured capacity. |
| `isolationSolverSeed` | 20y | Seed facilities at 2.25× solver scale. |
| `maintenanceRich` / `maintenanceBufferDeep` / `maintenanceRichBufferDeep` | 10y | Maintenance capacity / buffer isolation tests. |
| `singleAgent` | 10y | One agent per product (monopoly). |
| `wealthTax` | 50y | Company wealth tax + needs-based support. |
| `longrun-baseline` / `longrun-wo50` / `longrun-spring040` / `longrun-spring045` | 600y | Long-horizon parameter variations: as-is vs. 50% bankruptcy write-off vs. cost-spring strength 0.4/0.45. |
| `longrun-interest1` / `longrun-interest2` / `longrun-interest3` / `longrun-interest4` | 600y | Baseline economy at 1/2/3/4% loan interest (baseline is 5%). Tests whether the debt compounding and the y499 collapse scale with the interest rate. |
| `longrun-interest1-ref` / `longrun-interest2-ref` / `longrun-interest3-ref` / `longrun-interest4-ref` | 600y | Same interest ladder PLUS the break-even refinery pricing (1.3x min ask). Tests whether keeping the refinery profitable prevents the plastic-cutoff collapse. |
| `longrun-interest1-ratio` / `longrun-interest4-ratio` | 600y | Break-even refinery pricing PLUS the consumption-matched output ratio (fuel 90 / plastic 62 / chemical 48). Tests whether removing the chemical over-supply stabilizes the economy. |
| `longrun-oil2x` | 600y | Baseline economy with DOUBLE the oil reservoir (2e9). Tests whether the universal ~y500 collapse is purely oil-resource depletion. |
| `interest2` / `wealthTaxPop` / `interest2-wealthTaxPop` | 30y | 2% loan interest (slow the debt compounding) and/or the population wealth tax. |
| `refineryFirmAsk` | 30y | Refinery agents ask a soft-min price of 3× cost, cap price cuts at 1%, target 0.5 sell-through. Tests whether pricing the joint-output refinery above cost keeps it alive. |

## Population wealth tax

`--populationWealthTax=on` activates `collectPopulationWealthTax` in `governmentAgent` (runs monthly
in `governmentTick`): each population cohort is taxed independently on per-capita wealth above
`POPULATION_WEALTH_TAX_ALLOWANCE_MONTHS` (120) months of the education-level wage, at
`POPULATION_WEALTH_TAX_ANNUAL_RATE` (2%/yr). Revenue goes to the government budget (funding
needs-based support), reducing wealth concentration.

## 600-year parameter runs

The four `longrun-*` scenarios share `seed=1001` and run 600 years. Launch them in parallel:

```sh
npx tsx tools/longrun/orchestrator.ts --scenario=longrun-baseline,longrun-wo50,longrun-spring040,longrun-spring045 --years=600 --bands=report
```

Compare the finished runs (population, starvation, fill rate, facility condition, wealth, banking
metrics at y100/y300/y600 plus band pass/fail):

```sh
npx tsx tools/longrun/compareLongrun.ts
```

Add `--runs=a,b,c` to restrict the comparison to a subset.

> **Result of the first 600-year run (2026-08-28):** every variant collapsed — baseline at
> y499, spring040 at y489, spring045 at y497, wo50 at y141 — via a sudden maintenance-price
> death spiral. Full analysis in `protocol_2026-08-28.txt`.

## Stability bands

Each scenario declares `bands`: a metric, a horizon, a window and an allowed range. The band is
the mean of the metric over the last `windowYears` up to `horizonYears`, optionally relative to
year 1. Bands are the contract that says "the economy is stable" — a mechanism change that
breaks a baseline band is a regression.

## Outputs

Written to `tools/longrun/results/<out>/`:

| File | Content |
| --- | --- |
| `series.csv` | One row per simulated month for every metric in `METRIC_KEYS` (`metrics.ts`). |
| `summary.json` | Scenario metadata, `msPerTick`, band results, and yearly means of all metrics. |
| `scaleGaps.csv` | Yearly production-scale gap diagnostics (solver vs. targets vs. actual). |
| `seedGap.txt` | Human-readable initial scale comparison at seed time. |

Performance on a typical dev machine: roughly 8–13 ticks/s, i.e. ~15–25 min for a 30-year run.
Check `msPerTick` / `ticksPerSecond` in `summary.json`.

## Reading market mismatch

Markets are oversubscribed by design: agents offer several times what they produce and bid several
times what they consume, and the surplus offers are exactly what refills the storage buffers while
they sit below target. The tâtonnement price is a directed random walk, so matching switches on and
off from tick to tick.

Consequence: large per-tick mismatch is normal and means nothing on its own.

- `market_X_unfilled` / `unfilledFrac` around 0.2-0.3 together with `market_X_unsold` / `unsoldFrac`
  around 0.8 is expected — offered supply runs at several times the traded volume in a healthy run.
  Agents target `TARGET_SELL_THROUGH = 1.2` (`src/simulation/constants.ts`), i.e. they deliberately
  offer more than they expect to sell, and the book carries offers from several ticks.
- Judge markets by smoothed behaviour, never by single ticks or tick-to-tick variance. Pricing and
  control act on EMA'd sell-through and fill-rate (`SELL_THROUGH_EMA_ALPHA` / `FILL_RATE_EMA_ALPHA` =
  0.3, against `TARGET_SELL_THROUGH` / `TARGET_FILL_RATE`), while `market_*_fillRate` and
  `market_*_buffer` in `series.csv` are instantaneous per-sample values — average them over windows of
  years before concluding anything.
- Something is genuinely wrong when a *smoothed* value trends: an EMA sell-through/fill-rate drifting
  over decades, a price leaving its band, or unfilled and unsold both rising over the long run.

## Comparing results

`baseline` is the reference run. To see the effect of a change, run the same scenario into a
different output dir (e.g. `--out=baseline-marginal-price`) and diff the band results and the
price/fill-rate columns of `summary.json`:

```sh
python3 - <<'EOF'
import json
for name in ('baseline', 'baseline-marginal-price'):
    s = json.load(open(f'tools/longrun/results/{name}/summary.json'))
    print(name, {b['metric']: b['actual'] for b in s['bands']})
EOF
```

## Running from a persisted snapshot

`runFromSnapshot.ts` continues an existing compressed snapshot (hex, optionally gzipped) instead
of building a fresh world:

```sh
npx tsx tools/longrun/runFromSnapshot.ts --input=tools/longrun/snapshot_zipped.gz --years=5 --keep=earth
```

`--keep=none` keeps all planets; any other value keeps only that planet. Results go to
`results/fromSnapshot/`.

## Diagnostics

Specialized one-off scripts for zooming into subsystems:

- `diagnostic.ts` — prints solver-vs-actual scale gaps at seed and then once per year.
- `marketDiagnostic.ts` — market clearing / price behavior for key service markets.
- `floorDiagnostic.ts` / `constructionDiagnostic.ts` / `solverDiagnostic.ts` — cost floors,
  construction chain, and solver-seed scale gaps.
- `foodChainTimeline.ts` — food-chain buffer / fill / price timeline.
- `leontief.ts` — input-output analysis of the production network.
- `extractSnapshot.ts` — extracts a readable subset of a persisted snapshot.
- `_cmp.ts` — quick performance comparison between the procedural initial universe and the
  benchmark world.

## Notes

- `tools/longrun/results/` is gitignored — runs are local evidence. Summarize conclusions in
  `stabilizingV1.txt`-style protocol notes when a mechanism change moves the baseline.
- The RNG is seeded once before world creation, so scenarios are fully reproducible.
- Do not run these while a `npm run test:all` or a heavy dev-server build is active; timing
  numbers will be distorted by CPU contention.

## Two bugs worth keeping

Both were caught by launching rather than by reading, and both are your kind of trap:

1. My first seed hook landed in `main()`, where `gameState` isn't in scope — the flags are parsed in `main`, the world is built in `runScenario`. Fixed with a module-level enable flag read in `main` and consumed inside `runScenario`, the same pattern as the existing runtime knobs.
2. __zsh does not word-split unquoted parameters.__ `A10='--pidKp=0.01 --pidKi=0.0001 …'` then `$A10` arrived as a *single* argument, `Number(...)` became `NaN`, and the NaN propagated into `setPidKp` → the scale → `Invalid mean wealth for cohort category … meanWealth=NaN`. All eight arms died in 30 ticks with an error that looked like a population-dynamics bug. Every launch now spells the flags out literally — worth knowing if you launch arms by hand.
