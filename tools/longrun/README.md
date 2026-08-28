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
| `--out=<dir>` | scenario name | Output directory under `results/`. |
| `--debug` | off | Enables `SIM_DEBUG=1` (assertions + verbose warnings). Slower; use for short runs. |
| `--agentsPerProduct=<n>` | scenario | Overrides agent count per product. |
| `--slack=<n>` | scenario | Overrides the LP-solver seed slack. |
| `--constructionScaleFactor=<n>` | scenario | Overrides construction-chain seed scaling. |
| `--buildChainScaleFactor=<n>` | scenario | Overrides build-chain seed scaling. |
| `--interestRate=<n>` | scenario | Sets the annual loan rate (0.05 = 5%). |
| `--bankruptcyWriteOffFraction=<n>` | scenario | Sets the bankruptcy debt write-off fraction (1.0 = full write-off). |
| `--costSpringStrength=<n>` | scenario | Overrides the agent-personality cost-spring strength (0.35 = default). |
| `--claimCostMultiplier=<n>` | — | Overrides the non-renewable claim cost multiplier. |
| `--wealthTaxAllowance=<n>` | — | Overrides the wealth tax allowance. |


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
