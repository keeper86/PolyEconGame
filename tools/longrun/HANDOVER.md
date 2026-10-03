# Handover — long-run stability work (2026-09-16)

## Goal
Stable 6000-year economy at 8B population / rm1000. The collapse is a ~800-year
"doom": population grows, then a food-chain whiplash starves everyone to extinction
in ~3 years.

## What was established (data-proven)

1. **The population collapse is a stochastic, high-amplitude oscillation in the
   food chain, not a deterministic first mover.** The resume did NOT reproduce the
   y798 extinction (it survived past y800) → the collapse is a rare alignment of an
   always-present oscillation, not an interest/debt/water doom.

2. **The oscillation is excited ONCE, at the top of the supply chain, and propagates
   downstream.** Lead-lag cross-correlation of `smoothedSignal` (the internal
   storage-error signal) shows a clean unidirectional cascade, each link lagging
   ~4–5 years: CrudeOil (Oil Well) → Chemical Refinery (coupled, ~0 lag) → Pesticide
   Plant (amplifier) → over-sized Farm (amplifier) → Food Processor → Grocery.

3. **The instigator is the Oil Well's expansion PID banging its output limits.**
   - Signal = `tanh(storage-deficit / 1 month)`, so it saturates at ±1.
   - PID: `P = kp·signal` with `kp = 0.01`, but `outMax = 0.001` → P is 10× the limit,
     so the output saturates whenever `|signal| > 0.1` (deficit > ~3 days), i.e. ~99%
     of the time.
   - Anti-windup freezes the integral when saturated → integral ≈ 0 → pure P+D relay
     (bang-bang), which over-builds maxScale ~5× (the Oil Well maxScale is 116.9M vs
     Farm 22M) and wastes 5× construction/maintenance.

## Pricing changes already made (keep these)
- `THEORETICAL_PRODUCTION_COST_FACTOR = 1.0` (was 1.3) — the dominant inflation lever
  (~8–16× lower prices, plMan ~150–300 for 795 years).
- `TARGET_SELL_THROUGH = 1.2`, `TARGET_FILL_RATE = 0.85`, services 0.85.
- Removed buy-side double-counting (the `refillRate` term in `smoothedDemand`).
- Services sell-side `sellSmoothing = 1` (no ×smoothing for services).
- `AUTOMATED_COST_FLOOR_BUFFER = 1.5` (unchanged).

## PID change being tested now
`src/simulation/planet/automaticProductionScale/constants.ts`:
- `PID_KP`: 0.01 → **0.001**  (so `P = kp·signal ≤ outMax` → proportional, no P-term relay)
- `PID_KI`: 0.0001 → **0.00001** (slow the integral so it settles instead of winding up)
- (kept: PID_KD 0.001, PID_IMAX 0.0025, PID_OUT_MAX_UP/DOWN 0.001, PID_D_ALPHA 0.3,
   STORAGE_TARGET_MONTHS 12, STORAGE_CAPACITY_MONTHS 13, STORAGE_ERROR_ZOOM_MONTHS 1)

Note: `outMax = 0.02/0.01 = 2%/1% per tick` is the **scale (hiring/firing) change**;
the expansion (maxScale) is ~3%/yr. The bang-bang is in the scale. The fast gains are now the
*default* (PID_KP 0.01 / KI 0.0001 / KD 0.01), chosen on the y52-160 grid: 0 famines, 22.0 M
population, worst-capacity ratio 0.81-0.92 against the slow default's 16 famines, 6.0 M, 0.126.

## Current constants (src/simulation/constants.ts)
- AUTOMATED_COST_FLOOR_BUFFER 1.5; THEORETICAL_PRODUCTION_COST_FACTOR 1.0
- TARGET_FILL_RATE 0.85; TARGET_SELL_THROUGH 1.2; services 0.85/0.85

## Runs (8B pop, rm1000, singleAgent, 6000y) — all extinct, timings:
- sell1.1 → extinct (hyperinflation); sell1.2 → y852; sell1.2-norefill → y852
- norefill-buf1.2 → y840; norefill-factor1.0 → y797; factor1.0-storage36 → y538
- probe run (norefill-factor1.0 resumed w/ tickProbe): survived past y800 (no collapse).

## Diagnostic tooling
- `tools/longrun/tickProbe.ts` — per-tick per-facility CSV (signal, pidDelta, storage
  inv/target, sell/buy diagnostics). Enable with `TICK_PROBE=1`; resume via checkpoint
  (copy checkpoint.{json,bin} to a fresh `--out` dir, run with `--resume`).
- Lead-lag cross-correlation on `smoothedSignal` identifies the instigator.

## Next steps
1. Confirm the PID change kills the early oscillation (visible by ~y50–100 — no need
   to wait for the ~y800 collapse): check `facilityScaleFrac_oilWell` / Produce price
   amplitude / the Oil Well `pidDelta` no longer banging ±outMax.
2. If the integral still winds up and re-saturates, reduce `PID_KI`/`PID_IMAX` further
   or add a leaky integral.
3. Once the oscillation decays, re-check the downstream (Pesticide/Farm over-build)
   and confirm no new starvation events.

---

# Wave analysis — data-driven case for the shock waves (2026-10-02)

## Tool

```bash
npx tsx tools/longrun/waveAnalysis.ts <result-dir|name> [options]
  --all              scan every numeric column instead of the curated 74
  --monthly          analyse the raw 30-tick samples instead of yearly means
  --from=y --to=y    window   --burn=y  drop the seed transient (default 5)
  --top=n            rows printed (default 45)   --lags=n  max cross-corr lag (25)
  --window=y         extra centred moving-average detrend (0 = linear only)
  --compare=<run>    divergence test against another run
  --col=a,b          add columns   --out=dir  CSV output dir (default <run>/wave)
  --laws             monthly samples + section [7] IDENTIFIED LAWS
  --selftest         validate the estimator against known spectra
```

`checkPredictions.ts` reads a run, runs `waveAnalysis --quiet` for the mode, and prints
the pre-registered verdicts (`PASS`/`WEAK`/`FAIL`/`PENDING`) per arm against the baseline
over the identical window:

```bash
npx tsx tools/longrun/checkPredictions.ts [--from=20] [--to=80] [run ...]
```

`--laws` section [7] fits the control laws straight out of the run (this is the
"reduction" the predictions rest on):

| law | form | default-run value |
|---|---|---|
| retail margin | distribution of `facilityPriceOverCost_groceryChain` | median 1.35, 89 % of ticks ≤ 1.5, 24 % ≤ 1.2 |
| capacity (grocery) | `dln(facilityScaleFrac)/yr = a + b·facilitySignal` | b 0.179, R² 0.706 |
| capacity (food processor) | same | b 0.170, R² 0.629 |
| wanted demand | `ln(demand/pop) = a + ε·ln(price/income)` | ε 0.058, R² 0.250 |
| cost pass-through | `dln(price) = a + β·dln(cost)`, cost = price/(price/cost) | β 0.821, R² 0.245 |
| price vs sell-through | `dln(price) = a + c·(1−ST/1.2)`, ST = 1 − unsold/supply | c 0.018/mo, **R² 0.002** |

Measured mediator across runs (the prediction hinge): grocery capacity gain/R²
collapses as the realised margin falls — 1.35 → **0.179/0.71**, 0.50 → **0.048/0.15**.

Writes `waves.csv` (per-series metrics), `episodes.csv` (famines + drawdowns),
`trigger.csv` (lead-lag vs foodPrice), `acf.csv`, `spectrum.csv`.

Estimator: linear detrend -> Hann-windowed 4x zero-padded FFT -> the largest
*interior* peak in the 4–200 y band is the dominant mode; its half-power bandwidth
gives Q, and zeta = 1/(2Q), the per-year amplitude pole rho = e^{-zeta*omega} and the
half-life. A peak whose half-power edge reaches the band edge is rejected as red
noise, not a wave. `--selftest` (6 cases: 2 sines, 3 narrow-band AR(2), 1 AR(1))
passes: periods within 12 %, Q >= 3 on all resonances, and no spurious resonance on
the AR(1). `--monthly` and yearly give the same periods.

## What the runs show (same seed, current model)

| run | span | dominant mode | famines | gap cv |
|---|---|---|---|---|
| `compfix10k-s1001` (default) | 245 y | **14 y, Q 7–9, band 25–50 % of the 4–200 y power, rho 0.97 (t½ 25 y)** on the whole goods chain; **11 y, Q 10** on the service/price levels; 49–57 y band on population/births/wages | 10 (4.1/century) | 0.67 |
| `groceryspring-s1001` (grocery 0.5/2) | 287 y | 10 y Q 10 on production/glass; 60–114 y bands on food/fill/wealth | 13 (4.5/century) | 0.88 |
| `springlow-s1001` (all 0.5/2) | 146 y | no clean resonance, broad 21–64 y bands with Q 0.5–1.8 | 5 (3.4/century) | 0.59 |
| `refill-6of7-y2150-6000y` (older model, segment) | 562 y | one very narrow 141 y band, band 60–80 %, flatness 0.02 | 6 (1.1/century) | 1.10 |

`--all` (1107 uncurated columns, default run) puts the same 14 y mode at the top for
*unrelated* industries: `facilityScaleFrac_plasticsFactory` (Q 8.9), `facilityPriceOverCost_coalMine`
(7.9), `facilityProfit_coalMine` (7.0), `facilitySignal_plasticsFactory` (8.9). So the
resonance is economy-wide, not a food-chain artefact. The 93 y band sits on the labour
series (`slotFillSecondary`, `capacitySecondary`, `allocSecondary`).

## Trigger ordering (default run, cross-corr vs `foodPrice`, phase inside the 14 y period)

- **lag 25–20 y** (i.e. ~1.5 periods): `facilitySignal/facilityScaleFrac` of the food
  processor and oil well, `*ContractionIntegral` — investment/expansion response.
- **lag 9–8 y** (≈ half period, anti-phase): `starvationSevereFraction` (r 0.49),
  `companiesNearInsolvent`, `redistributedPerCapita` (r −0.51).
- **lag 5–2 y**: `facilityScaleFrac_agriculturalFacility`, `facilityScaleFrac_groceryChain`,
  `facilitySignal_groceryChain` (0.46) — the chain's capacity.
- **lag 1 y**: `storageDeptScale` (0.72), `priceFloorHits` (0.50), `deathsThisMonth` (0.50),
  `existentialNegativeProfitFacilities` (0.60), `companyProfitMedian` (−0.44).
- **lag 0**: every price in phase (grocery 1.00, livingCost 0.98, beverage 0.95,
  processedFood 0.89), and anti-phase: `totalPopulation` −0.76, `foodChainFillRatio` −0.76,
  `groceryFillRate` −0.70, `groceryBuffer` −0.64, `wealthToFoodPrice` −0.57.

Event-aligned composite at the 10 famine onsets (z-scores by years before onset): the
only series above z=0.5 a decade out are `birthsThisMonth` (0.65 at −12 y, 0.89 at −2 y),
`groceryTotalVolume`, `emergencyLoansGranted`, `totalPopulation` — i.e. the famine lands
on the *demographic peak*, and `companiesProfitable` falls from +0.71 (y −4) to −1.30
(y +2). The leading indicators are the boom itself, not any external shock.

## Chaos or a driven resonance?

`--compare=compfix10k-wage-s1001` (identical world, different wage channel): over the
244 common years the mean |log difference| is **0.015–0.030 (1.5–3 %)** for every macro
series (foodPrice 0.015, population 0.017, aggregate profit 0.015) and the first crossing
of 5 % is at **y240–246**. A structurally different run stays macro-identical for 240 of
244 years → no sensitive dependence, so not low-dimensional chaos at the aggregate level.
Combined with the narrow-band 14 y mode and the irregular famine recurrence (gap cv
0.56–1.10), the picture is a **noise-driven resonance**: a lightly damped oscillator
(zeta 0.06, only 32 % of the amplitude lost per period) that is re-excited by the
demographic/credit bands, with famines needing the slow band's peak to coincide with a
big fast-mode swing — the "rare alignment" the earlier HANDOVER already suspected.

## Damping levers implied

Q = 1/(2·zeta) = f0/bandwidth: to kill the 14 y mode, damping must rise ~3–4x (Q 8 → 2).
The loop has a ~3–4 y transfer delay and the price channel is a slow random walk
(PRICE_ADJUST_MAX_UP/DOWN = 1.05/0.95, i.e. ±5 %/tick in the worst case) with
**saturating ends** — `priceFloorHits` is strongly in-phase with the
14 y cycle (r 0.50 at lag 1), so the cost floor/ceiling is the relay nonlinearity that
sustains the oscillation (same mechanism as the Oil-Well bang-bang found earlier).
Candidate experiments, one change at a time, judged by the band% and Q columns:
1. Raise the price response speed (PRICE_ADJUST_MAX_UP/DOWN) so the loop's phase lag shrinks.
2. Widen the sell-through band (TARGET_SELL_THROUGH) so prices stop hitting the floor/ceiling.
3. Widen the storage buffer target (STORAGE_TARGET_MONTHS = 3) — the buffer is the loop's
   integrator, so its size sets both the phase lag and the saturation margin.
4. Then re-run `waveAnalysis --all` and check that band% on the 14 y mode fell.

