# Journey Summary — Stabilizing the PolyEconGame economy over 600 years
Date: 2026-08-28. Companion to `protocol_2026-08-28.txt` (raw evidence chain).

## Goal
Stabilize the macro economy over a 600-year horizon, using realistic policy
levers (interest rates, wealth taxes, pricing), after identifying the
collapse mechanism. All longrun runs: benchmark Earth, 10M population,
seed 1001 unless noted.

## The question that started it
"WHY do all configurations collapse at ~year 500?" The original hypothesis was
financial: the bank loan book compounds at ~5%/yr vs ~0.6%/yr real growth.

## The journey (hypothesis → experiment → result)

### 1. Loan-compounding hypothesis (financial)
- 600y ladder at 1/2/3/4/5% interest: **loan growth ≈ rate + 0.2-1.2pp**
  (confirmed, monotonic). Collapse years: 4% y343 < 1% y402 < 2% y453 <
  5% y499 < 3% y508. **NOT monotonic** — no rate prevents the collapse, 1%
  and 4% are worse than baseline.
- Two competing constraints found: the bank needs ≥~3% interest to cover
  write-offs (interest/write-offs @y250: 1%→0.1, 2%→0.2, 3%→1.4, 4%→10.6,
  5%→119), while debt sustainability needs ~0.5%. The 3% optimum is the
  bank-solvency crossover.
- Bank-equity stabilization (UBI recirculation) was tried and FAILED
  (collapsed y210, 2.4× worse — the UBI fed the collateral-loan flywheel).
  Reverted.
- Population wealth tax (cohorts, 120-month allowance, 2%/yr) implemented per
  user direction — modest effect, not the driver.

### 2. The collapse is NOT financial
Month-by-month trace showed a **maintenance bootstrap cascade**: the
maintenance facility's input supply dries up → maintenance output → 0 in one
month → repair demand explodes ~100× → maintenance price to the ceiling →
conditions 1.0→0.2 → worker efficiency → 0 → starvation. The interest/GDP
ratio does NOT predict the collapse (baseline was at 2.7M× at y475 and
outlived 4% at 169×).

### 3. The refinery (the trigger node)
- Plastic is a **joint by-product** of the oil refinery (fuel 80 / plastic 60
  / chemical 60 per batch from 200 crude).
- The refinery is **structurally unprofitable**: all three outputs sit at
  ~0.70-0.73× their cost floor (a fixed point of the cost-spring vs
  sell-through pricing equilibrium), so its own management slowly contracts
  it → shutdown at ~y503 → plastic supply → 0 → maintenance starves → cascade.
- User's storage-blocking hypothesis: REJECTED (no storage-full warnings in
  500y; all three prices rose together — the refinery shut down entirely).
  But the split-output intuition was confirmed via *prices*: a fixed
  fuel:plastic:chemical ratio sold into three independent markets cannot
  clear profitably (priceOverCost 0.73 for years).

### 4. Refinery min-ask experiment (personality knob, user's idea)
- 3× soft-min ask: refinery prices ~2.9× cost and is hugely profitable, BUT
  the markup propagates through cost floors → HR cost → wages (1.1→25) →
  cost-push hyperinflation → collapse at y16.
- 1.3× break-even ask: refinery holds ~1.12× cost, stable, no inflation at
  30y. Looked like a fix.

### 5. The 600y break-even ladder — the collapse is universal
Six runs (interest 1-4%, seeds 1001/2002, ± ratio change): ALL collapsed at
**y494-585**. The fixes narrowed the spread and removed early flukes but did
NOT prevent the collapse. The 1-ref y11 and 4-ref y106 collapses were real
but early-game brittleness, not the endgame clock.

### 6. THE ROOT CAUSE — PEAK OIL
The planet's **oil reservoir is finite**: `1_000_000_000` units,
`renewable: false` (world.ts). Oil wells extract 0.2 reservoir per
scale-unit per tick; extraction accelerates as the economy grows.
- Depletion: y300 → 0.69B left, y400 → 0.44B, y450 → 0.24B, y480 → 0.08B,
  y490 → 0.02B, **~y492 empty**.
- Cumulative extraction at collapse: baseline 1.094B, 4-ratio 1.086B,
  1-ratio 1.118B — every run consumes the WHOLE reservoir (plus stockpiles).
- When the oil runs out → no crude → refinery shuts down (the exact event we
  kept finding) → plastic/fuel/chemical → 0 → maintenance bootstrap node
  starves → cascade → extinction.

This explains everything:
- The coordinated ~y500 collapse across ALL configs (same growth → same oil
  consumption → same depletion clock).
- The interest rate being noise (doesn't change extraction).
- The early die-off DELAYING collapse (1-ratio's y8 die-off → smaller economy
  → less oil → survived to y584).
- The "flukes" were early perturbations that never mattered.

## Current status
- **`longrun-oil2x` confirmation run** (2× reservoir = 2e9): launched, healthy
  at y84/600. Prediction: passes y600 easily if depletion is the whole story.
- New `oilReservoirMultiplier` world config + `oilReservoirLeft` metric.
- All targeted tests green.

## UPDATE: resources10 × checkpointing (2026-08-28)
- The oil2x run collapsed at **y554.7** — oil still had 0.70B left, but the
  **iron ore deposit was EMPTY** (eff 0.000 at y545). The collapse is
  sequential exhaustion of ALL finite non-renewables: baseline kills on oil
  (~y492), oil2x kills on iron (~y540). Coal 1e9, copper 0.5e9, limestone
  0.5e9, stone 1e9, sand 5e9 are the next clocks in line.
- **Checkpointing** added to `run.ts`:
  - `--checkpointEveryYears=N` (default 50), `--resume`.
  - `checkpoint.json` (scenario/seed/years/tick, RNG state `[s0,s1]`,
    prevPopulation, pid) + `checkpoint.bin` (msgpack+gzip game state — the
    same codec the live game uses).
  - series.csv/scaleGaps.csv append incrementally; resume rebuilds history.
  - Signal handler (SIGINT/SIGTERM) saves a checkpoint; the loop now yields
    to the event loop every 30 ticks (it previously starved it completely, so
    signals never fired and the node survived `kill -TERM`).
  - **Verified bit-exact**: interrupted+resumed run matches an uninterrupted
    run with 0 differing cells across all metrics after the resume point.
  - Kill the real node PID (recorded in checkpoint.json) — `npx` doesn't
    forward SIGTERM.

## RESULT: resources10 collapsed at y692.75 — steel capacity, not resources
The 6000y question is answered: **NO, 10x resources does not reach 6000y.**
The run grew to 540M people (54x) and collapsed at y692 with oil at 7.37B
left and iron/coal/sand deposits at 100% — the depletion clocks were NOT the
cause this time. The collapse moved y499 (oil) -> y554 (iron) -> y692 (steel).

The real wall: the **iron smelter is structurally loss-making** (margin
-0.15..-0.28, priceOverCost ~0.60 for 200+ years — the same cost-spring vs
sell-through equilibrium that made the refinery unprofitable), so its
automatic scaling never keeps pace with the ~2%/yr growing economy. At 540M
pop, steel demand avalanches past the fixed capacity: steel price 1.35 ->
10.44 -> 81.69 in three years, the maintenance facility can't buy steel,
maintenance output -> 0, conditions cascade, extinction. (Secondary choke:
HR buffer maxed at ~320K daily output, 1854 warnings.)

The 6000y goal needs BOTH sustainable resources AND a conversion chain that
can scale with demand — either the pricing equilibrium must let smelters earn
their cost floor at scale, or automatic scaling must respond to demand rather
than profitability alone. Same root family as the intermediate brittleness.

## SIGNAL FIX: the conversion chain is now profitable (2026-08-28)
Why the smelter lost money despite "over-demand": its accumulated inventory
overhang (years of over-production, offered as 100-2000x the traded volume)
crushed the price to 0.6x cost, while its storage-throttled production
sell-through looked ~100%, so the expansion signal (capped at max(flowDeviation,
-unfilledFrac) — never negative when any scarcity existed) kept it "expanding"
into the over-supply. Fixed in `computeFacilitySignal`:
- `UNSOLD_SCARCITY_FORGIVENESS=2`: the scarcity forgives up to 2x its size of
  unsold supply instead of 1x, so extreme overhangs drive the signal negative.
- `MARKET_OVERHANG_FULL_PENALTY_TICKS=30`: a market-wide unsold overhang
  throttles every producer until the stock drains (catches the full-storage case).
30y validation (baseline): smelter margin went from a permanent -0.15..-0.28 to
+0.10..+0.145 after an initial ~15y adjustment; steel price ~cost (was 0.6x);
average margin over all 40 facility types positive (+0.16 at y30); economy
healthy (condition 1.0). The structural unprofitability is resolved by the
signal alone. (Open follow-up: the offer-smoothing keeps a ~1-month inventory
flooding the market, which slightly suppresses prices during drains — a
pricing-side tuning knob, `FREE_QUANTITY_SMOOTHING_MAX_EXTRA`.)

## Open item: intermediate brittleness
Separate from the oil clock, the early game is fragile:
- Break-even refinery caused y11 (1%) and y106 (4%) collapses via
  supply-holding (chemical scarcity + cost loop) on fast-growing economies.
- The 1-ratio run had a 35% die-off at y8 (chemical price 4× floor from
  day 1 — the new ratio's lower chemical output created a chronic shortage).
- The consumption ratio is a moving target (early economy wants more chemical,
  late economy more fuel) — a single fixed ratio cannot match it.
- Candidates: **variable refinery output** (adjust the mix to demand), or
  maintenance-input resilience. Testable in fast 15y loops.

## Key collapse-year table
| config | collapse year |
|---|---|
| baseline 5% (seed 1001) | 499 |
| 1% | 402 |
| 2% | 453 |
| 3% | 508 |
| 4% | 343 |
| 1%-ref seed2002 | 494 |
| 2%-ref | 500.6 |
| 2%-ref seed2002 | 503.9 |
| 4%-ref seed2002 | 515.8 |
| 4%-ratio | 511.7 |
| 1%-ratio | 584.8 |
| **oil2x (2e9)** | **554.7** — not >600! |

## UPDATE: oil2x result — resource exhaustion, not just oil
The 2x-oil run ALSO collapsed (y554.7). At collapse: oil reservoir still 0.70B
left (of 2e9), coal fine (eff 1.000), but **iron ore deposit EMPTY**
(ironMineInputDepositEfficiency = 0.000 at y545+). No iron -> no steel -> the
maintenance facility's steel input starves (its plastic buffer was still full!)
-> maintenance output -> 0 -> cascade.

So the collapse is a SEQUENTIAL EXHAUSTION of all finite non-renewable
resources. The economy grows until the first-depleted one runs dry:
- baseline (1e9 oil): oil depletes ~y492 -> collapse y499.
- oil2x (2e9 oil): oil lasts, economy grows to 240M, iron (1e9) depletes
  ~y540 -> collapse y554.
The remaining finite deposits (coal 1e9, copper 0.5e9, limestone 0.5e9, stone
1e9, sand 5e9) are the next clocks in line.

CONCLUSION: the economy is a one-way extractor of finite resources and
collapses when the first one runs out. "Stabilizing to 600y" is impossible
without sustainable resource management: recycling the non-renewables back
into production, substitutes, or a steady-state economy. The financial,
interest, refinery-pricing and ratio work was all secondary — the collapse is
Malthusian resource exhaustion, and every fix merely picks the next
bottleneck to hit.
