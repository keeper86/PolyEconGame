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

Note: `outMax = 0.001 = 0.1%/tick = 36%/yr` is the **scale (hiring/firing) change**,
not the expansion (maxScale) which is ~3%/yr. The bang-bang is in the scale.

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
