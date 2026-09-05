# Decision log — economic-stabilization features (2026-08-28 → 2026-09)

Purpose: catalogue each feature introduced in this arc, what failure/observation motivated it, what it
does, and its current status (default vs opt-in) so we can decide what to promote to default.

## Legend (status)
- **DEFAULT** — part of normal simulation behaviour (module constant / always on).
- **OVERRIDE** — behind a longrun/run flag or runtimeConfig override; off/unset unless enabled.
- **RECENT** — knob is live but calibration/decision still open.
- **NOTE** — observation / research result, no code change.

## 1. Storage-based (inventory) autoscale — controller replacement
- **Why:** sell-through/price scale signals were biased by oversupply artifacts and drove the
  contraction-spiral collapse clock. Chain model showed a pure-feedback, demand-anchored inventory
  controller survives 600y at every tested growth rate.
- **What:** production scale is a PID on storage error vs a `STORAGE_TARGET_MONTHS` (3 mo of own
  max-scale output) buffer; integral accrues at maxScale on positive error, contracts at minScale on
  negative error; expansion-sized to the storage deficit (capped, funds/HR/CS/labor/landbound gated).
- **Status:** DEFAULT; `storage-controller` scenario. `--storageTargetMonths/--storageCapacityMonths`
  were added to trial tighter buffers (1/2, 2/4).
- **Learnings:** 1-month target too brittle (buf1 died y330); 2/4 still plateau-starved.

## 2. Service flow controller — decay perspective for services
- **Why:** services decay; production capacity can't read a goods-like buffer, and the sold-through
  logic misfired (the grocery sat ~0.79 sold-through, *above* its old 0.8 deadband → never expanded
  into a 40% unfilled population).
- **What:** `serviceFlow.ts` steers service scale on the *share of produced service actually decayed*
  (rotted above the one-day shield) vs a target decay of **30%**: expand while unfilled exists &
  decay under target; contract only when >30% of output rots. Reads `assets.lastDepreciatedPerTick`.
- **Status:** DEFAULT (decay target 0.3). Overridable `--serviceDecayTarget`.
- **Learnings:** cured the frozen famine but production-side alone never lifts the sub-fed plateau to
  full, because households face a cash-transfer cap (see #3).

## 2b. Service sell-through & fill-rate pricing (price-side)
- **Why:** providers fed the affordable segment but the dependent population couldn't clear at the
  prevailing offer. A higher sell-through target pushes service offers down; a higher fill target
  makes buyers hold deeper stock to smooth stockouts.
- **What:** runtime overrides `--serviceSellThrough`, `--serviceFillRate` (defaults today 0.70/0.70).
- **Status:** OVERRIDE (validated at 0.90 / 0.85). Raised the fed plateau from ~100B→147B but did
  NOT remove it — showing price/production fixes scale the economy yet the transfer remains the floor.

## 3. Insurance / subsistence transfer — wage-index + 5-day cap (the real ceiling off)
- **Why:** every config plateaued at grocery-fill ~0.7 / starvation ~0.17 regardless of food supply,
  because 142B of 148B (unoccupied/in-ed/unable) depend on a transfer that was *unit-bug* small: it
  indexed `0.85 × wage` but `wage` is per-**tick**, so dependents got ~1.1/mo ≈ a third of groceries.
- **What:** (a) insurance ratio 0.85/0.8/0.75 → **0.5**; (b) top-up pays a *daily* `rate × wage` per
  recipient and caps carried cohort wealth at **5 days** (rate-limited transfer → feeds current
  consumption, no amassed spendable bundles to bid away supply).
- **Status:** DEFAULT (constants UNEMPLOYMENT_INSURANCE_RATE_* = 0.5, INSURANCE_WEALTH_CAP_DAYS = 5).
- **Learnings:** full ×30 monthly-index → hyperinflation (prices ×100k, extinction). The 0.5/5-day
  flow gave grocery-fill 1.0 / starvation 0 for the full duration up to the next wall (finite oil).

## 4. Finite-resource scaling to remove the depletion clock (robustness)
- **Why:** fresh full-fed economies exhaust crude at some ~y300–2000 regardless of resourceMultiplier:
  fuel is one finite lump drawn ~proportionally to population, with no price/scarcity taper before the
  cliff. Finite depletion is a "trivial crash reason" hiding real economic conclusions.
- **What:** made `--oilReservoirMultiplier` *actually work* (it was documented but never parsed by
  run.ts — a wiring bug); default all-resource `resourceMultiplier` to 100; oil = resource × oil
  multipliers (base 1e9).
- **Status:** DEFAULT `resourceMultiplier = 100` in buildBenchmarkWorld + storage-controller scenario;
  `--oilReservoirMultiplier` wired (default 1).
- **Learnings:** for the "stable 20,000y" test we size oil so the clock isn't the constraint
  (current robust run: resource ×100, oil ×500 → ~5e13 ≈ ~20k yr at asymptotic burn).

## 5. Asymmetric input-efficiency damping of the storage expansion signal
- **Why:** an upstream (refinery/well) running full-blast until its input buffer hit 0 then dropping
  to 0 was binary; expansion should throttle *before* the buffer empties.
- **What:** positive (expansion) storage signals are damped by the facility's worst input efficiency;
  negative (contraction) signals pass through undamped so an input-starved-but-stacked producer can
  still contract.
- **Status:** DEFAULT (`maxError > 0 ? inputEfficiency * maxError : maxError`).

## 6. Refinery storage-driven production-mix + by-product flare
- **Why:** flexible refinery output followed price/scarcity and caused fuel/plastic/chemical crises;
  saturated products piled forever and bloated buffer signals, hiding saturation from the controller.
- **What:** flexible multi-output mix driven by each output's storage deficit to its keep target
  (floor share ≥10%); goods outputs above the waste-keep (wasteSurplusTicks) are removed (services
  excluded). Storage keep at 120 ticks so saturation still reads above the storage-signal target.
- **Status:** DEFAULT (`productionMix.ts`, `wasteSurplusOutputs`).

## 7. Saturated-product pricing bypass (cost-spring brake disable)
- **Why:** even under fixed personalities, the cost-spring built a self-reinforcing price floor
  (~1.6× cost) that kept saturated chemicals/fuel from clearing.
- **What:** when an output is at/above its waste-keep ("saturated"), the cost-spring term is disabled
  and the offer may fall on weak sell-through.
- **Status:** DEFAULT.

## 8. Wages already exceed the WAGE_SHARE target (observation)
- **Why:** considered raising wages to lift the dependent transfer (which anchors to wage).
- **Find:** workers already receive ~69% of company residual (rev − pur − claims), *above* the nominal
  WAGE_SHARE = 0.6; profitShareBonus is vestigial (always 0). Raising WAGE_SHARE has little headroom;
  the real lever is the transfer floor (#3), not wage share.
- **Status:** NOTE — no code change.

## 9. Benchmark resource default
- `resourceMultiplier` default = **100** in `buildBenchmarkWorld` (and `storage-controller` scenario).
  Intended as the benchmark-horizon default; scarcity experiments pass <100 explicitly.

## Open questions (for "what becomes default")
1. Service decay target (0.30) — keep, or tune harder/softer?
2. Service sell-through / fill defaults: promote to 0.90 / 0.85 by default, or keep opt-in?
3. Insurance 0.5 with 5-day cap is default and yields a fully-fed economy — confirm no inflation /
   funding pathology across multi-millennia before locking in.
4. Finite-oil: keep default `resourceMultiplier = 100` (+ what default oilReservoirMultiplier?) so
   6000/20000y runs are not resource-clock ended.
