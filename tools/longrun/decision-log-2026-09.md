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

## Run verdict — robust-1agent (2026-09-05): still collapses at ~y285
The fresh 8B single-agent world (all stacked defaults, insurance 0.5/5day, oil ×500, resource ×100,
storage controller, flaring, asym damping, saturated pricing bypass) ran FULLY-HEALTHY y1→y283
(pop 7.8B → **39.4B**, fill 1.0, starvation 0.0, food price ~3) — then collapsed in under a year:
food price 3 → 10 → 157 → 1409 and grocery supply to 0 in ~12 months (pop extinct y285.75).
- This was NOT the oil/exhaust clock of the earlier ~15-19B deaths (oil is ×500×100) — it reached
  2× higher pop than any prior run first, so it is the true **systemic wholesale collapse** the
  stacked tunables delayed but did not remove. Same ~y200-300 family as the historical failures.
- Root cause not yet identified. 40 companies never dropped (no bankruptcy) yet the whole grocery+chain
  stop supplying simultaneously (condition 0.62, avg starvation 0.94, fill 0.00) — smells like a
  synchronized staffing/cash cliff around ~3-4e10 pop, distinct from the chronic sub-fed plateau
  (fill ~0.7/mean-starve ~0.2) that svcopt/fixstack survived for 20k+ years at 100-150B.
- Note: its `series.csv` got contaminated by reusing the out-dir (see README guard) — only ticks the
  dying run itself wrote (>102000) were trusted for this read.

## Open (carried on)
- robust-1agent verdict above is unresolved; comp6 (6-agent competitive random personalities, 10k y)
  launched 2026-09-05 is the live experiment to see whether competition changes this ~y285 wall.
- Root-cause the y285 wholesale collapse (likely fastest via resuming robust checkpoint at y~280
  with diagnostics) instead of waiting out a 12-day comp6 run to the same window.


## Root cause of the robust-1agent ~y285 collapse (2026-09-05) — single-refinery tier halt
Resumed the y250 checkpoint to a fresh clean dir and tracked monthly columns; also cross-compared
original vs resumed twins. Findings:
- The collapse is NOT oil depletion (well count stays 1, reservoir stays ~5e13, never near empty),
  NOT food-first, NOT maintenance-first. The FIRST mover is the **fuel/chemical (refinery) tier**:
  ~y284 fuel 0.4→1.2→43 and chemical 3.4→295 within ~8 months while the single oil-well agent and
  its refinery keep count 1. Only AFTER that food/fill collapses and facility maintenance losses
  appear (maint=6) — the condition crash is an effect of the earlier supply crash (as suspected).
- Mechanism hypothesis: the single refinery agent, at full-fill signals near the ~39-40B peak,
  momentarily idles/contracts (storage-target sees glut → decays to floor), starving the whole goods
  chain that needs fuel/chemicals. With 1 agent/product it's a fragile monopoly oscillation.
- Determinism caveat (IMPORTANT): the original run that died at y285.75 and a resume from its own
  y250 checkpoint ended slightly different (~ppm drift compounding) and the TWIN did NOT collapse:
  it sailed through y285 → y300 healthy at 43B. So the ~y285 collapse sits on a knife-edge — tiny
  numerical/path differences flip it. This is exactly the kind of latent fragility that stacked
  tunables raise but don't remove.
- Upstream implication: the single-agent worlds are NOT a safe stability test — the interesting
  question is whether 6-agent competition (comp6, live) makes the refinery tier robust or replicates
  this near-threshold behavior.


## Refined collapse mechanism (2026-09-05) — refinery at FULL SCALE, zero output
Correction to the earlier note. Instrumented refinery oil-well telemetry across the y283-285 fork
(columns facilityScale_oilRefinery, facilityScale_oilWell, margins, oilRefineryRevenue). Neither
"tried to expand and couldn't" nor "workers left first" is the mechanism:
- y~276-283 (the ~30-40B run-up): the single refinery is pinned at its HARD maxScale=11,911,810,
  oscillating at the storage-target boundary (can't add capacity above the ceiling as demand grows).
  So capacity is ceiling-bound during the decade before the event (one part of the fragility).
- y~284 collapse: refinery STAYS at maxScale but output truly stops: oilRefineryRevenue → exactly 0.0
  and stays 0, facility/well margins → 0.0, autoscale signal → 0 (not a contraction response), while
  priceOverCost climbs 1.1 → 7-10 (gigantic profit opportunity ignored). Workforce is still ~18B
  employed with no starvation at this point → NOT a staff desertion, and food/maintenance catastrophes
  follow later (starvation sev→1 THEN employment 17.7B→8.7B as people die).
- Ordering (confirmed here): fuel/chemical halt → food dies (3→80→105) → mass starvation → THEN the
  workforce dies off. Condition/maintenance losses are the final effect. The user's causal instinct
  (condition crash is effect, not cause) holds; the true first cause is the oil→refinery tier ceasing
  output at full scale with full oil + full workforce + huge margins.
- Most-consistent cause: the single oil-well's max EXTRACTABLE FLOW (claim/flow ceiling) can no longer
  feed the refinery once it's at ceiling capacity for a ~40B economy → the refinery's crude input buffer
  empties → zero output regardless of price/margin/scale. Full disaggregation of crude extraction across
  multiple wells/claims (i.e. multi-agent competition) is the natural robustness test → comp6.
- Question to verify on comp6 or a targeted probe: is it a well-flow (claim) ceiling, or an intra-refinery
  input-starvation scheduling bug at extreme scale? Distinguish by replaying near-y283 with crude-flow and
  refinery-input columns as instrumented METRIC_KEYS.


## CORRECTION (2026-09-05, important) — the ~y285 collapse was an OIL-DEPLETION artifact, not a full-oil systemic bug
Re-examining the interleaved columns exposed that `1agent-robust-8b/series.csv` mixes rows from
**MULTIPLE DISTINCT OIL-SCALED RUNS**, not two paths of one world:
- Panel A (the "dying" rows I mis-scaled): `oilReservoirLeft` ≈ 4e9 and falls linearly to exactly 0.0
  by ~y283.9, then well scale frozen, refinery revenue → 0, fuel 0.4→43, food collapse, mass death.
- Panel B (the survivor rows): `oilReservoirLeft` stays ≈ 4.99e13 (the real ×500 world) and is healthy
  at y285+ (fuel ~0.4, revenue high)

So the "collapse with FULL oil at 40B" was false: those rows belonged to a small-oil run that simply
RAN OUT of oil (the finite-resource clock), which the ×500 world never hits. That ALSO explains why the
clean diagnostic resume from the real ×500 y250 checkpoint sailed through y285 → y300 healthy at 43B:
the true ×500 robust world did NOT collapse at y285.

Recency/implications:
- Rescind the "refinery flow-ceiling starvation / single-well monopoly fragility at 40B with full oil"
  hypothesis — its evidence came from the oil-DRY world (input 0 because reservoir empty, not because of
  a flow cap).
- The earlier "robust-1agent dies at y285 full-oil" verdict and its knife-edge/determinism speculation
  are UNSUPPORTED. The genuinely clean signal: the ×500 world was healthy at y300/43B when its diagnostic
  continuation was killed.
- Unknown still: does the TRUE ×500 8B single-agent world collapse LATER (y400-2000 as it grows further)?
  The diagnostic (resumed, clean) needs to be carried forward to answer this.
- Data hygiene: do not trust anything read from `1agent-robust-8b/series.csv` further (multi-run
  contamination). Track the pushed diag copy `robust-death-diag` (clean from y250).


## DEFINITIVE: both worlds collapse via the SAME maintenance-price spiral (2026-09-05, resumption runs finished)
Two clean full runs both died with a common first-mover:
- robust-death-diag (single-agent x500, resumed at y300): healthy growth to ~80B, extinction y423.75.
- comp6 (competitive 6-agent, random personalities, fresh y0): healthy to ~21B, extinction y340.83.
- So competition (6 wells/refineries/agents on the same economy) did NOT defuse the collapse — it died
  EARLIER in sim-time (y340 vs y423) and at ~1/4 the population (21B vs ~79B).

Collapse signature is IDENTICAL in both: after ~300-400y healthy (fill 1.0, no starvation, oil full),
the MAINTENANCE service price blow-out is the trigger:
- diag: maintenance price 4.7 → 765 over ~10 months, condition 1.0 → 0.5 → 0.22, food dies second.
- comp6: maintenance 1.7 → tiny creep at y338.7 → 5.5 → 20.9 → 43 → 66 → 104 in 2 months, with fuel
  and chemical ticking up in lockstep → then EVERY input hyperinflates (foodP 1.9→12.5→167→916→38,000,
  maint up to 286,000) → starvation 0.997, extinction.
- In comp6 the competitive pricing turns the SAME maintenance trigger into explosive downstream
  hyperinflation (100-1000x larger than single-agent's orderly spiral) → it's a worse outcome.

Interpretation:
- The single-agent "monopoly" was NOT the problem; the underlying maintenance-supply price-spiral
  failure is structural and scale/personality independent. 6-agent competition amplifies it.
- No config tested survives past ~y423 single / ~y340 competitive. All prior "survivors >1000y" in this
  repo's history either plateau-subfed with chronic starvation (svcopt/fixstack) or are oil-clock short.
- Next lever must address the maintenance supplier's price spiral directly (why a healthy, charged
  economy lets one segment's maintenance price run away 100-1000x), not company-count competition.

## ROOT CAUSE (2026-09-05, definitive) — maintenance outputs are hard-gated to zero on material shortage
`unif150-wage60-1000y` (6-agent, uniform 1.5 floor, WAGE_SHARE=0.6, oil×500) held healthy y1-173
(pop 7.8B→21B, maint price ~2.5, fill 1.0, starv 0) — proving the WAGE_SHARE=0.5 labour-lockout fix.

Death: extinct y218.58. First mover traced monthly:
- At y174.75 the MAINTENANCE SUPPLY collapses ~150x in one month (5e8 → ~0) while the 6 maintenance
  facilities stay present and even GROW scale (960k → 1.15M). Output 9.5e7 → 1.1e6, yet workerEff=1.0,
  conditionEff=1.0, and the individual input efficiencies show the single binding break:
      maintInputEfficiencyPlastic: 1.00 → 0.31
  (steel + electronics stay 1.0; overallEff 1.0→0.14, resourceEff 1.0→0.31 from the plastic term alone).
- Why it crashes to ZERO despite scale+staff+being "present": production.ts:226 hard gates
      if (overallEfficiency <= 0) → every output = 0
  and overallEfficiency = min(workerEff, conditionEff, min over r resourceEfficiency[r]), with
      resourceEfficiency[r] = min(1, available_r / (need_r × scale)).
  So when ONE material input (plastic) is short, the whole facility produces ~0 - regardless of profit.
  It is not idling for lack of margin; it is structurally unable to produce for want of that input, and
  the efficiency formula turns scarcity into a full outage, not into degraded-but-proportional output.

Causality: mid-chain good (plastic) intermittently starves the maintenance producer → maintenance output
gated to ~0 → NO facility upkeep performed → all facilities decay planet-wide → repair backlog explodes
(e2e backlog 4e9) → maint/food price hyperinflate → mass starvation ⇒ extinction. Same substrate as the
single-agent y423 and comp6 y340 deaths: the maintenance sector is the propagation duct because it is
(1) planet-critical (every facility needs it) and (2) hard-zeroed on any one material shortage.

Design gap surfacing: a min() -product efficiency + hard >=0 gate means a transient shortage of ONE deep
input produces a 100%-output outage for a critical service instead of a scaled-down response. Candidate
fix direction (discuss before implementing): floor the applied efficiency so material scarcity degrades
output proportionally rather than gating to zero for maintenance; and/or make the maintenance facility's
material usage scarcer-resilient (buffer/once per upkeep, not per-tick just-in-time).



## Upstream cause confirmed (2026-09-05): the capacity-clamped flexible refinery is the plastic gatekeeper
Refines the previous entry. The plastic shortage that forces maintenance to zero is NOT a refinery
behavioural failure - it is capacity. Facts from unif150-wage60 metrics:
- Oil Refinery (productionFacilities.ts:262) is the ONLY outputFlexible producer in the economy:
  crude -> { fuel 90, plastic 62, chemical 48 }, wasteSurplusTicks 120. productionMix.ts operates on it
  alone. Plastic is produced NOWHERE else. => plastic scarcity is refinery/mix-driven by construction.
- Refinery fleet: 6 units, aggregate scale grows monotonically 2.7M -> 25.5M, each pinned at its
  maxScale cap (~4.3M). Margin ~0-0.2 and priceOverCost ~0.94-1.18 for years (thin but fine), then at
  the y174 crunch margin -> 0.72-0.85 and priceOverCost -> 7.5-8.2 (VERY profitable) while scale is
  frozen at max. So the refinery is economically healthy and maxed out, NOT misbehaving.
- Because productionMix apportions output by storage deficit, once overall refinery demand > max
  capacity (~y170, at ~24-26B pop) the controller doles out shortage; plastic (fillRatePlastic 0.9->0.22)
  gets shorted ahead of fuel -> maintInputEfficiencyPlastic -> ~0.31 -> maintenance hard-gated to zero
  -> collapse. Fuel fill oscillates 1.0/0.17/0.8/0.2/0.43/1.0/0.76 right at the supply edge all run.
- Verdict on "are refineries doing fine": yes financially, but they are a single capacity cap between the
  whole economy and its maintenance material. The fragile junction = a capacity-clamped, single flexible
  refinery being the involuntary gatekeeper of the economy-wide maintenance input.
- Two independent lever classes, distinguished (not yet chosen):
  (A) refinery-side: stop it being the sole plastic gatekeeper - more flexible producers, or let
      maxScale grow to meet demand (expansion was pinned at cap; investigate why it cannot exceed ~24B-worth).
  (B) maintenance-side: don't let ONE input shortfall hard-zero a planet-critical service - floor/apportion
      the efficiency so a plastic dip degrades repairs proportionally rather than killing all upkeep.

