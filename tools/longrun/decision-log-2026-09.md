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



## Decisive result (2026-09-09): the credit-money loop ALONE kills; net-demand service fix only delays
Implemented the principled service-flow fix: `serviceFlowError` now drives expansion by NET demand
(`unfilledNorm - decayShare`) instead of "any unfilled demand". Replacement-of-decay no longer justifies
new capacity; steady state (unfilled ~ decay) gives zero error; decay > target still contracts. All 1763
tests pass. Then ran two 1% runs with the fix (seed 1001, 8B pop, bands off):
- scout: singleAgent (1 agent/product, 42 agents), 600y -> extinct at y74.6 (pop 10.7B peak -> 0).
- full: competitive-6agent (242 agents), 6000y -> extinct at y256.9 (pop 33.1B peak -> 0).
(Control before the fix died at y159.75; so the fix DELAYED competitive collapse ~160->257 but did NOT
prevent it. The monopoly world dies EARLIER, so intra-product competition is not the driver.)

Scout death is a runaway price/wealth hyperinflation -> famine, NOT a labor-satisfiability collapse:
- y60-67 healthy-ish but meanWealth oscillates 3.7..460 and foodPrice swings 14..134 (unstable).
- y68: grocery starvation 0.47, healthcare starvation 0.89, fatalFraction 0.037 -> 108M deaths/month.
- y69-73: foodPrice 533 -> 2360 -> 581 -> 5820, groceryFillRate 0.43/0.48/0.32, fatal 0.51 at y73.
- y74: total starvation, pop -> 250k. bankDeposits 2.18e15, foodPrice 11350, priceLevelServices 11740,
  wagePrimary ~7-27 => REAL WAGES COLLAPSE.
Financials (scout): bankDeposits 1.5e12(y1) -> 2.75e14(y65) -> 2.18e15(y74); bankLoans lags deposits;
bankEquity = loans - deposits deeply negative and ~ -cumulative debtWriteOffs throughout the slow burn.

ROOT CAUSE (accounting leak): `terminateAndRefound` (bankruptcy.ts) and `liquidation.ts` do
`bank.writeOffs += writtenOff; bank.loans -= writtenOff;` WITHOUT any `bank.deposits -=`.
So the loan ASSET is destroyed while the deposits created when that loan was granted remain in
circulation (held by workers/suppliers). Money supply (deposits) is NOT reduced => each write-off
injects net money. bankEquity = loans - deposits therefore goes unboundedly negative (bank eats the loss
with no capital constraint), and deposits/GDP climbs 0.27 -> 4.4+ => hyperinflation => famine => extinction.
The monetary-conservation invariant still passes because it only checks Sum(deposits) == bank.deposits,
not that write-offs are money-neutral. This is a SEPARATE, SUFFICIENT collapse mechanism from the
service-bloat / maintenance min()-gate chain, and it is interest-driven because interest forces the
rollover -> emergency -> write-off -> re-grant cycle that re-creates fresh deposits every iteration.
NEXT: decide treatment - (a) remove money on write-off (bank.deposits -= writtenOff, i.e. bank is a money
sink), (b) bank capital constraint so banks stop lending when equity < 0, (c) tax/transfer recycling to
destroy the excess. Then re-run scout to confirm the y74 wall moves.


## Interest is NOT the driver (2026-09-09): 0% scout dies at the same point as 1%
Ran the scout (singleAgent, 8B pop, resourceMultiplier 100, net-demand service fix, bands off) with
--interestRate=0. Result: STILL extinct, at y73 (1% scout died y74; comp6 died y257). loanInterestCollected
is exactly 0 for the whole run, yet:
- debtWriteOffs accumulate to 1.25e14 by y70.
- bankDeposits grow 1.5e12 -> 2.8e14 (187x) while gdpAnnual grows only ~2x.
- foodPrice 3.3 -> 1347, priceLevelServices 7 -> 1578, wagePrimary ~4 => real wages collapse.
- y72 grocery starvation 0.74, y73 0.995 => extinct (pop 367k).

EXACT MONEY IDENTITY (same at 0% and 1%): deposits = loans + writeOffs. The column (deposits - loans)
tracks cumulative writeOffs almost exactly at every year (y50: 8.46e13 vs 8.56e13; y68: 1.229e14 vs 1.245e14;
y72: 1.231e14 vs 1.247e14). So the entire excess money supply IS the cumulative write-offs.
Mechanism: an agent borrows (predominantly bufferCoverage auto-loans: 7.8e11 -> 1.04e14, the largest
category), spends the deposits into the economy, cannot repay, rolls over (rolloverLoanPrincipal ~2e13,
~30 companies with rollover loans), and is eventually bankrupted/refounded; terminateAndRefound and
liquidation do `loans -= writtenOff` but NEVER `deposits -= writtenOff`, so the deposits created by the
loan remain in circulation while the loan claim vanishes => money supply grows by exactly the write-off
amount, unbounded => hyperinflation => famine => extinction. This is INDEPENDENT of the interest rate.
Interest is a red herring for the collapse timing (0% y73, 1% y74). The real driver is the automatic
wage/buffer-coverage lending + write-off cycle. NEXT: fix money conservation on write-off (destroy the
deposits) OR stop the auto-lending from creating unrepayable principal, then re-run the scout.


## Refinement (2026-09-09): money grows gently as expected; the price level explodes because REAL OUTPUT is bang-bang
Answering "why no gentle inflation": because inflation is M/Y and Y is violently unstable, not M.
0% scout, annual money-supply growth is smooth: +5.2/+2.5/+2.4/+5.7/+1.5/+0.3/+3.2/+2.6/+5.8/+6.9/+5.6 %/yr
(y61..71). Real gdpAnnual swings +115/-56/+45/-53/-37/+159/-33/+131/+185/-49/-84/-96 % over the same years.
M/Y sits at a mild 2-5 for ~60 years (the gentle-inflation regime we expect) and only explodes to 259 when
Y collapses at y73 -> hyperinflation -> famine.
Root of the Y swings: production is bang-bang - maintFacilityOutput alternates ~4.1e7 <-> 0 (exactly 0 at
y69), ironSmelterOutput swings 5x (3.3e7 <-> 1.5e8). Full economy-wide upkeep gating to zero on a single
input shortfall (the known min()-efficiency gate) plus expansion/contraction overshoot drive it.
Also: write-offs PLATEAU late (8.6e13 flat y50-53, 1.245e14 flat y66-73) while bankLoans JUMPS +13%/yr -
so the terminal spiral is NEW lending (bufferCoverage/wageCoverage auto-loans chasing rising nominal needs)
creating deposits directly, i.e. a lending<->price feedback, not additional write-offs.
Revised causal model: (1) write-off leak => steady ~4-6%/yr money growth => mild inflation [real but not
fatal alone]; (2) interest irrelevant at this horizon (0% y73 vs 1% y74); (3) collapse trigger = real-output
instability (bang-bang production / maintenance output hitting 0), amplified by the auto-lender's nominal
feedback. Next targets, in order: (a) production stability (why maint output gates to exactly 0), (b) the
write-off/auto-lending money leak as an amplifier, (c) the debug invariant that currently cannot detect any
of this.


## ROOT CAUSE of production instability (2026-09-09): multi-output facilities use max() over per-output
## storage errors, so one underpriced byproduct whipsaws the whole facility across ALL outputs
The per-tick tickProbe (tools/longrun/tickProbe.ts, TICK_PROBE=1) on the singleAgent 0% run shows it
unambiguously. The Oil Refinery has 3 outputs with independent storage errors:
  err(Fuel) = -0.333 (over-stocked), err(Plastic) = -0.05..-0.33 (over-stocked), err(Chemical) = +0.13..+0.18
  (UNDER-stocked). computeFacilityStorageSignal returns maxError = MAX over outputs = +0.17 (chemical),
  so the refinery EXPANDS because chemical is short - even though plastic is already over target.
Verified: maxError == simStorageSignal for 100%% of 5224 sampled refinery ticks, so the probe reads the
real signal. The refinery scale then ramps to its max cap and floods plastic/fuel to the price floor.
Then chemical becomes over-stocked too, maxError flips negative, and the facility CONTRACTS - but the PID
contraction is rate-limited (PID_OUT_MAX_DOWN=0.01/tick = 1%%/tick) while the expansion was up to 10%%/tick
(PID_OUT_MAX_UP=0.1), so it crashes from 1.06e7 -> 8.4e6 -> 5.2e6 -> 2.1e6 -> 1.06e6 (MIN_SCALE floor) in
~4 months. During that contraction plastic is starved: fillRatePlastic = 0, plasticPrice 0.01 -> 0.70 ->
2.08 -> 15.1 -> 53.3 (5333x). Maintenance's plastic input -> 0 -> the min()-efficiency gate zeroes
maintenance output -> planet-wide upkeep stops -> real-output bang-bang -> hyperinflation (M/Y) -> famine.
Sequence observed monthly: y68.25 plasticPrice 0.375 -> y68.5 0.01 (glut, floor) -> signal goes negative ->
y68.83 scale 2.07e6 -> y69.0 1.06e6 (floor) -> y69.25 plasticPrice 15 -> y69.33 53 -> maintenance output 0.
Conclusion: the instabilities are NOT fundamentally a PID-tuning dilemma (fast vs slow). They are caused by
using max() across a multi-output facility's storage errors, which lets ONE byproduct's deficit drive
expansion/contraction of the entire facility and the other products (plastic = maintenance's sole input)
into alternating glut/famine. Fix directions to evaluate:
 (A) per-output control: decide scale from a weighted/min-abs measure or from aggregate profitability, not
     max() of independent storage errors; or
 (B) split flexible outputs so each product's supply can be steered independently (the refinery currently
     cannot produce plastic without also producing fuel+chemical); or
 (C) give the critical downstream (maintenance) a hard supply priority / larger buffer so a 1-2 year
     plastic price swing cannot zero a planet-critical service.

## Confirmed quantitatively (2026-09-09): the refinery is a CHEMICAL controller; plastic is a stowaway
Per-tick probe statistics (singleAgent 0%, y0-16, 5824 refinery ticks):
- which output sets maxError: chemical 5807 (99.7%%), plastic 16, fuel 1. So the refinery's production
  scale is de facto controlled by CHEMICAL demand alone.
- 39.1%% of ticks have smoothedSignal>0 while plastic is already OVER its storage target (expanding into a
  plastic glut); 0 ticks have signal<0 while chemical is under target (max() never lets plastic veto).
- Only the Oil Refinery is multi-output (verified by enumerating all facility factories: exactly one has
  produces.length>1). So this is a single, isolated design defect with an outsized blast radius because
  plastic is maintenance's sole material input and maintenance is planet-critical via the min() gate.
Fix targeting is therefore narrow and high-leverage. Candidate fixes (to be tested, one at a time):
 1. Change computeFacilityStorageSignal for multi-output facilities to not use max(): e.g. scale on the
    WEIGHTED mean of per-output errors, or on the minimum (most urgent shortage) only when all others are
    not already over-stocked, or on the aggregate storage deficit in currency terms (value-weighted).
 2. Give each output its own expansion/contraction authority for flexible facilities (produce more of the
    short product, less of the glut product) rather than moving total scale.
 3. Make the primary consumer (maintenance) resilient: hold a much larger plastic buffer, or floor the
    efficiency so a plastic dip degrades upkeep proportionally instead of zeroing it (the min() gate).
Note the two amplifiers already known: PID_OUT_MAX_UP=0.1 vs PID_OUT_MAX_DOWN=0.01 (10:1 asymmetric rate)
and the hard MIN_SCALE_FRACTION=0.1 floor / 10%% expansion cap, both of which turn a control error into a
large, slow-to-reverse scale excursion.

## CORRECTION (2026-09-09): refinery max() causes the mid-run OSCILLATIONS, but the TERMINAL death is a
grocery-starvation workforce collapse, NOT a plastic shortage
Per-tick evidence from v1 probe + series at the terminal (singleAgent 0%, y72.5-73.6):
- Maintenance at terminal: scale 100%% of cap, maintInputEfficiencyPlastic=1, Steel=1, Electronics=1,
  plastic buffer FULL at 1.34e8, resourceEfficiency=1 - but workerEfficiency=0 -> overallEfficiency=0 ->
  output 0. So maintenance dies from ZERO WORKERS, not from missing plastic. My earlier plastic story was
  the cause of the oscillations, not of the extinction.
- The trigger before that: groceryFillRate oscillates to exactly 0 repeatedly (y70.33, y70.92, ...) with
  avgGroceryStarvation 0.44-0.67, and groceryTotalSupply (= Produce) is bang-bang: 2.6e8 -> 3.1e8 -> 0 ->
  5.5e8 -> 9.3e8 -> 1.4e9 -> 2.1e9 -> 3.4e8 -> 2.6e8 -> 0 while agriculturalFacilityScale is CONSTANT at
  its max (1.02e6). So the agricultural facility output is being gated to zero intermittently by ONE of its
  inputs (needs: arableLand 30, water 100, pesticide 10) or by workers.
- Consequence chain: produce supply 0 -> grocery fill 0 -> mass starvation (avgGroceryStarvation hits 0.44+
  at y71.2) -> deaths exceed births, pop falls 11.0B -> 9.7B -> 8.6B -> ... -> employed collapses
  5.9B -> 3.0B -> 0.9B -> maintenance workerEfficiency 0.94 -> 0.045 -> 0 -> upkeep stops -> cascade ->
  extinction y73.6.
So there are TWO distinct instability layers:
  (1) the refinery max()-over-outputs control defect -> plastic/fuel/chemical glut-famine cycles (mid-run,
      real, causes large price swings and the 45%%-at-cap / 12%%-at-floor bang-bang), and
  (2) an intermittent hard-zero of the AGRICULTURAL facility's output (the lifeline food producer) which
      starves the population and destroys the workforce -> terminal extinction. The 0% vs 1%% runs die at
      the same place because this is not monetary and not interest-related.
NEXT: identify which agricultural input (water/pesticide/arableLand) or worker class goes to zero, via the
v2 tick probe (TARGETS now include Agricultural Facility, Water Facility, Pesticide Plant; capture of
inEff0/1/2 + workerEffWorst). Then fix that gate.

## FULL CAUSAL CHAIN of the y73 extinction (2026-09-09) - the refinery max() defect propagates up the food chain
The single root is the Oil Refinery's max()-over-outputs scale control, because the refinery is the ONLY
source of CHEMICAL, and chemical -> pesticide -> agriculture -> food -> population -> workforce.
Linked single-producer chain (all facilities have exactly one producer in the 1-agent world):
  Oil Refinery (produces Fuel/Plastic/Chemical, scale driven by MAX err, 99.7%% of ticks = chemical err)
    -> chemical   -> Pesticide Plant (needs chemical 60 + water)
    -> plastic    -> Maintenance Facility
  Pesticide Plant -> pesticide -> Agricultural Facility (needs arableLand 30 + water 100 + pesticide 10)
  Agricultural Facility -> produce -> Grocery Chain -> population food
  Produce -> Pharma Plant too.
Observed monthly co-movement at the terminal (scout0) - a limit cycle that DRAINS the grocery buffer:
  y68.0  chemPrice 15.3  refinery 1.06e7(max)  pest 3.44e5  agri 4.5e5   buffer 0.99  foodPrice 17
  y68.9  chemPrice 54.5  refinery 1.06e6(FLOOR, -10x) pest 2.18e5 agri 1.02e5(-10x) buffer 1.00 foodPrice 33
  y69.2  chemPrice 59.1  refinery 1.06e6  pest 3.44e4(-10x)  agri 1.02e6  buffer 1.00  foodPrice 58
  y69.7  chemPrice 76.4  refinery 3.78e6  pest 3.79e5  agri 1.02e6  buffer 0.91  foodPrice 82
  y70.0  chemPrice 56.6  refinery 1.06e7(MAX) pest 3.79e5  agri 1.02e6  buffer 0.36  foodPrice 193
  y70.3  chemPrice 61.7  refinery 8.62e6  pest 3.78e4  agri 1.02e6  buffer 0.33  foodPrice 291
Each refinery swing (-10x to floor, then back to max) collapses pesticide output ~10x, which collapses
agricultural output ~10x, which zeroes produce supply -> grocery fill 0. Early on the grocery buffer
(0.98-1.0 through y69) absorbs these fill-0 months (first occurrences y44.58, y44.67, y57.5 - all
survived). After y69.75 the buffer is drained below 0.4 and the NEXT cycle starves the population:
  y70.33 groceryBuffer 0.325, y71 starvation 0.44+, pop 11.0B -> 9.7B -> 8.6B ..., employed 5.9B -> 0.9B,
  maintenance workerEfficiency 0.94 -> 0.045 -> 0, upkeep stops, extinction y73.6.
So the same defect that produces the mid-run price oscillations also produces the terminal extinction;
the difference is only whether the buffer happens to absorb the current cycle. Why it stopped absorbing
after y69: the amplitude grew with total throughput (population/scale grow ~40%% while the buffer is a
fixed 3-month stock) and the cycles began to align instead of being isolated single-month blips.
This also explains why 0%% and 1%% interest die at the same time: the mechanism is entirely real-sector.

## Tick-level confirmation (2026-09-09): the hard zeros are INTERMEDIATE-GOOD OUT-OF-STOCK, from y6 on
v2 tick probe (TARGETS include Pesticide Plant / Agricultural Facility / Water Facility; captures per-input
efficiencies and workerEffWorst):
- Pesticide Plant: chemEff = 0.0000 with workerEffWorst = 1.0 and scaleFrac = 1.0 at ticks 224,225,229-
  242,... i.e. it is INPUT-starved with a full workforce and full operating scale. chemical inventory is
  literally 0 for stretches. Occurs from y0.6 onward.
- Agricultural Facility: pestEff = 0.0000 while arableLand=1.0, water=1.0, workerEff=1.0 (e.g. ticks 2179,
  2183, 2187, 2188, 3390-3394). So agriculture is PESTICIDE-starved with everything else fine. From y6 on.
- Note resourceEfficiency = min(1, fairShare/required) is proportional, so it reaches exactly 0 only when
  the input inventory is exactly 0 - there is no artificial min()-gate here; the zero is genuine
  out-of-stock of an intermediate good.
Conclusion: the chain run is Refinery chemical (single source, oscillating max()-controlled scale) ->
Pesticide Plant 0 chemical -> Agricultural Facility 0 pesticide -> produce 0 -> grocery fill 0. This is
present from y6 and is absorbed by buffers (grocery buffer 0.98-1.0) for ~65 years, then fails at y70 when
the buffer can no longer absorb a trough. Both 0%% and 1%% interest runs die identically, confirming the
mechanism is real-sector and not monetary.
## CONCLUSION of the instability investigation (2026-09-09): it is a 1-tick out-of-stock, not a PID tuning problem
Terminal tick-level evidence (v2 probe, y70.3-71.4, maintenance + grocery at 100% scale, workerEff = 1.0):
  Maintenance Facility: inEff(steel) alternates 1.0 -> 0.0 -> 1.0 -> 0.0 every 1-3 ticks, wkEff = 1.0,
    scaleFrac = 1.0, signal ~0. Its output therefore toggles between full and ZERO every few ticks.
  Grocery Chain: inEff(processed food) alternates 1.0 -> 0.883 -> 0.50 -> 0.00 -> 0.47 -> 0.44 -> 0.00 ...
    with wkEff 0.8-0.99. Same toggling.
Mechanism: computeResourceEfficiencyMap uses
    required  = need.quantity * facility.scale          (grows with scale)
    available = queryStorageFacility(storage, name)      (agent-level stock)
    fairShare = (required / totalDemand) * available
    resourceEfficiency = min(1, fairShare / required)
and production multiplies output by overallEfficiency = min(workerEff, ...resourceEff, conditionEff).
If the input stock is momentarily 0 (because the upstream output arrives in batches / the same storage is
drawn by several facilities), resourceEfficiency is EXACTLY 0 and the facility produces NOTHING that tick.
With scale at max the per-tick required draw is huge, so the stock is repeatedly drained to 0 between
arrivals -> the facility strobes on/off at a 1-3 tick cadence instead of producing smoothly at a reduced
rate. That strobe is the "production instability" we set out to explain.
Why the buffers do not save it: the 3-month storage target applies to the PRODUCER's output inventory; the
CONSUMER's input availability is instantaneous, so a producer cadence mismatch is not smoothed anywhere
except by the consumer's own storage, which is being drained every tick at full scale.
Why smaller buffers previously killed it earlier: they reduce exactly that consumer-side smoothing, so with
a small buffer the input stock is 0 even more often and the strobe dominates sooner. This is precisely the
"PID / buffer dilemma" the user described, and the correct fix is NOT to retune the PID: it is to stop a
1-tick stock-out from turning into a 100% output outage.
## CONFIRMED ROOT of the input strobe (2026-09-09): the per-tick purchase cap has ZERO headroom over consumption
User hypothesis: "the input buffer should not be empty; even clearing every third tick should be enough if we
buy on average more than 3 ticks worth of inputs. We can increase the amount bought per tick."
This is correct, and the code confirms why it currently cannot work.

In automaticPricing.ts the agent's per-tick input purchase is capped:
    let totalShortfall = Math.max(0, storageTarget - currentInventory);
    const baseRateConsumption = storageTarget / bidCfg.inputBufferTargetTicks;
    if (baseRateConsumption > EPSILON && storageTarget > EPSILON && totalShortfall > EPSILON && not services) {
        const fillRatio = Math.min(1, currentInventory / storageTarget);
        const smoothedDemand = baseRateConsumption * (1 + bidCfg.inventorySmoothingMaxExtra * (1 - fillRatio));
        totalShortfall = Math.min(totalShortfall, smoothedDemand);      // <-- the cap
    }
and the order quantity is exactly this shortfall (bidStorageTarget = currentInventory + totalShortfall).

Now substitute the maintenance steel case with defaults (INPUT_BUFFER_TARGET_TICKS = 30,
INVENTORY_SMOOTHING_MAX_EXTRA = 2, need 10 per tick per unit scale):
    storageTarget          = 10 * scale * 30 = 300 * scale
    baseRateConsumption    = storageTarget / 30 = 10 * scale   == EXACTLY the per-tick consumption
    cap at fillRatio = 1.0 : baseRate * (1 + 2*0)   = 1.0x consumption   -> NO refill headroom at all
    cap at fillRatio = 0.9 : baseRate * (1 + 2*0.1) = 1.2x consumption
    cap at fillRatio = 0.5 : baseRate * (1 + 2*0.5) = 2.0x consumption
    cap at fillRatio = 0.0 : baseRate * (1 + 2*1.0) = 3.0x consumption
Because the cap is only greater than 1x when the buffer is ALREADY below target, the buffer is a one-way
ratchet: any consumption burst pushes it down, and the refill rate is barely above consumption, so it never
recovers. The smoothing term only helps in proportion to how empty the buffer already is.

EMPIRICAL PROOF that this is rationing and NOT a market supply problem (scout0 series, y60-63):
    steelUnsoldSupply = 7.7e8 .. 2.3e9 (a 3-30x GLUT, unsold steel sitting in the market)
    steelFillRate oscillates 0.05 .. 1.0
    maintSteelBuffer falls 7.45e7 -> 5.14e6 -> 0 and maintFillRate oscillates 0.37 .. 0.92
So the maintenance facility cannot obtain steel while hundreds of millions of units go unsold: the bid cap,
not availability, is the binding constraint. Same pattern for grocery processed food (inEff alternates
1.0/0.0 every 1-3 ticks) and every other input-consuming facility.
And maintFillRate is 0.40-0.87 for the WHOLE run (even y50, fully healthy regime) - i.e. upkeep has been
chronically 15-60%% short of steady-state demand from the start, not just at the end. The y70 death is when
the accumulated grocery/maintenance shortfall finally tips into famine.

FIX (matches the user's proposal): give the input purchase real headroom over consumption instead of only
when the buffer is nearly empty - e.g. make the per-tick purchase order a multiple of baseRateConsumption
(a few ticks' worth, so that buying on average >3 ticks of consumption per clearing tolerates every-third-
tick clearing), or raise INPUT_BUFFER_TARGET_TICKS' effective buy rate / INVENTORY_SMOOTHING_MAX_EXTRA so the
cap at normal fill is comfortably > 1x consumption. To be implemented and A/B tested.

 1. Do not let resourceEfficiency hit 0 from a momentary stock-out: allocate consumption from a smoothed /
    rate-limited input budget, or floor the efficiency to a proportional value derived from the fraction of
    the tick the input was available (i.e. carry a small input buffer inside the facility rather than
    re-requiring the full per-tick quantity from agent storage).
 2. Give consuming facilities an explicit input buffer (like the maintenance steel/electronics/plastic
    buffers already modelled in metrics) that is filled from storage and consumed from, decoupling
    consumption cadence from arrival cadence.
 3. Ensure the producer's output cadence matches the consumer's consumption cadence for intermediate goods
    (or batch production monthly so arrivals line up with consumption).

 1. Refinery scale must not be driven by max() across its three outputs (it de-facto controls on chemical
    alone, 99.7%% of ticks) and must not swing 10x. This is the root.
 2. Intermediate goods in a single-producer -> single-consumer chain need a real buffer or a producer-side
    floor: the consumer going to exactly 0 input (and its output to exactly 0) is what turns a supply
    wobble into a famine.
 3. A critical consumer (agriculture/grocery) should not have its output gated to exactly 0 by a shortfall
    of a substitutable or non-critical input like pesticide - proportional degradation would be survivable.

## FIX APPLIED and A/B VERIFIED (2026-09-09): input purchase now has real refill headroom
Change: src/simulation/constants.ts adds INPUT_BUFFER_REFILL_TICKS = 10; automaticPricing.ts caps the
per-tick input purchase at
    smoothedDemand = baseRateConsumption * (1 + inventorySmoothingMaxExtra * (1 - fillRatio))
                     + totalShortfall / INPUT_BUFFER_REFILL_TICKS
Previously the first term alone was the whole cap, which at fillRatio = 1 equals exactly 1x consumption
(zero refill headroom). The added term lets the buffer always recover: a 30-tick buffer refills in
INPUT_BUFFER_REFILL_TICKS ticks instead of never.
Updated 4 tests that asserted the old formula (agentBuying x2, supplyChain x1, automaticPricing x1) and
imported the new constant. tsc --noEmit clean; full suite 1763 passed.

A/B on the same scout config (singleAgent, 8B, resourceMultiplier 100, interestRate 0, 90y, TICK_PROBE=1):
  metric                            baseline (v2)      refillfix
  run outcome                       died y73.6         COMPLETED 90y, pop 8.45B and rising
  groceryBuffer @y65-89             -> 0.000004        stays 0.98-0.99 (no famine)
  foodPrice range                   9 .. 1347          5 .. 107 (falling)
  maintenance zero-output ticks     6.5%%               2.8%%
  maintenance mean efficiency       0.912              0.965
  maintenance ticks below 0.9       10.5%%              4.6%%
  AGRICULTURE zero-output ticks     3.25%%             0.31%%   (10x better)
  agri mean efficiency              0.824              0.829
Verdict: the real-sector famine mechanism is effectively removed - the lifeline food chain no longer
strobes to zero, the grocery buffer never drains, and food price stays stable instead of hyperinflating.

NEW issue revealed by the fix (a different channel, not a regression):
  baseline deposits/gdp  0.9 .. 6.8 ;  refillfix deposits/gdp  13 .. 49
  baseline debtWriteOffs 1.2e14     ;  refillfix debtWriteOffs 5.3e14
Buying more inputs requires more working capital -> more bufferCoverage/wageCoverage auto-loans -> MORE
money creation -> money supply grows much faster relative to real GDP. The fix therefore trades the famine
collapse for a stronger monetary inflation. Population plateaus ~8.4B instead of growing past 10B,
consistent with real growth being suppressed by the higher price level.
Remaining collapse risk is now squarely the credit-money channel (auto-lending creates deposits against
unrepayable principal; write-offs never destroy them) - now cleanly isolated from real-sector noise.

## 6000y scout with the refill fix, 0.5%% interest (2026-09-09): death moved y73.6 -> y84, mechanism CHANGED
Run: singleAgent, 8B pop, resourceMultiplier 100, --interestRate=0.005, 6000y, bands off, refill fix active.
Outcome: grew to 11.79B (y80, condition 0.98), then died y84 (pop 4.3B -> extinct, run aborted early).

COMPARISON
                                  pre-fix scout0        refillfix (this run)
  death                           y73.6                 y84
  peak population                 11.33B                11.79B
  famine trigger                  input strobe          monetary inflation
  avgGroceryStarvation pre-death  rising to 1.0         ~0 right up to y80
  groceryBuffer before death      0.000004              0.65-0.99 (healthy for 80 years)
The refill fix did its job: for 80 years the grocery buffer never drained and there was effectively no
starvation. The old real-sector famine mechanism is gone.

NEW/REMAINING MECHANISM = the credit-money channel (now isolated and clearly visible)
  deposits/gdp      0.22 (y1) -> 2.5 -> 2.8 (y50) -> 5.9 (y60) -> 4.2 (y75) -> 5.1 (y78)
  debtWriteOffs     2.2e11 -> 2.18e14 accumulated
  loanInterestCollected  3.3e9/yr (y1) -> 1.42e13/yr (y84)  (4200x)
  priceLevelRaw     1.6 -> 8.7 (y70) -> 16.0 (y80) -> 223 (y84)
  foodPrice         3.9 -> 34 (y70) -> 280 (y80) -> 1084 (y84)
  waterPrice        1.1 -> 15.6 (y70) -> 8.5 (y80) -> 124 (y84)
Death sequence at y79.9-84: avgHealthcareStarvation climbs 0.02 -> 0.24 -> 0.38 -> 0.48 -> 0.81 -> 0.99,
then avgGroceryStarvation follows to 1.0; groceryBuffer 0.14 -> 0.005; deaths this month 1.5e7 -> 2.96e8
vs births 2.07e7 -> 4.5e6. So it is again starvation, but HEALTHCARE-first and driven by a broad price
detonation (all prices x10-15) rather than by an input stock-out.

Verdict: with the real-sector starve removed, the binding constraint is now the money supply growing far
faster than real output (deposits/gdp 0.2 -> 5+ and climbing) via the auto-lending + write-off loop. At 0.5%%
interest this still compounds enough over 80 years to detonate prices. NEXT: address the credit-money channel
(auto-loan principal that cannot be repaid, and write-offs that never destroy the deposits they created).

## WHY the inflation happened and WHY population could not buy (2026-09-09) - full picture
Instrument: tools/longrun/groceryPricingDiag.ts replays the refillfix-6000y checkpoint (y50) to y79.5 and
dumps the grocery offer's per-tick price state. Findings below are measured, not inferred.

### (1) The money went to COMPANIES, not households - the demand side died first
householdDeposits / bankDeposits over the run:
    y20 23.0%%   y40 13.5%%   y60 3.1%%   y70 4.0%%   y78 5.5%%   y80 0.21%%
bankDeposits reaches 3.6e14 while householdDeposits is only 7.5e11 - i.e. 99.8%% of the money supply is in
COMPANY/agent accounts and effectively none in households. meanWealth and medianWealth oscillate violently
(1616/238 -> 2178/1031 -> 63/56) because household purchasing power is only the current wage flow, not a
stock. So the population could not buy not because money did not exist, but because the money created by
the credit loop accumulated in firm balance sheets while households' real purchasing power was eroded.

### (2) The price does NOT rise on falling sell-through - the COST SPRING overrides the signal
This was the user's specific question. The sell-through term behaves correctly:
    sellThroughFactor(smoothedST, target=0.6, maxUp=1.05, maxDown=0.95)
    sellThrough 0.15 -> baseFactor 0.9625  (price SHOULD fall 3.75%%/tick)
But automaticPricing.adjustOfferPrice adds a cost spring:
    deviation = sqrt(max(0, brakeZoneTop/price - 1)),  brakeZoneTop = costFloor * 1.5
    netFactor = baseFactor + costSpringStrength * SPRING_NORMALIZATION * deviation
    (costSpringStrength = 0.5, SPRING_NORMALIZATION = 1/7)
Measured grocery rows (tick 28425): offerPrice 8.4215, costFloor 6.561, deviation 0.4023,
baseFactor 0.9654, netFactor 0.9942. So the spring adds +0.0287, cancelling ~76%% of the -0.0375 discount.
Detailed table of the net effect at typical price/floor ratios (sell-through fixed at 0.15):
    price/costFloor  deviation  spring   base     net      result
    1.100            0.6030    +0.0431  0.9625   1.0056   price RISES despite sell-through 0.15
    1.200            0.5000    +0.0357  0.9625   0.9982   falls 0.18%%/tick (20x too slow)
    1.284            0.4102    +0.0293  0.9625   0.9918   falls ~1%%/tick
    1.500            0.0000     0.0000  0.9625   0.9625   normal
    2.000            0.0000     0.0000  0.9625   0.9625   normal
The grocery price sat at price/costFloor ~1.22-1.28 - exactly inside the brake zone - so it was pinned
just above cost while sell-through fell to 0.14-0.16. The offer inventory therefore ballooned
(5.4e8 -> 2.4e9) and never cleared, oscillating in a ~1-year limit cycle (glut: netFactor ~1.0 frozen,
squeeze: sell-through 0.9, netFactor 1.02). Net effect: the market cannot clear by price.
So the answer to "shouldn't price stop rising when sell-through drops?" is: the sell-through rule does the
right thing, but the cost-floor spring is strong enough in the brake zone (below ~1.5x cost floor) to
cancel or reverse it. Below ~1.11x cost floor the spring wins outright and the price rises on collapsing
demand.

### (3) Combined causal chain of the y84 extinction
  credit-money loop (auto-loans create deposits; write-offs never destroy them)
    -> bankDeposits grows to 3.6e14, deposits/gdp 0.2 -> 5+, loanInterest 3.3e9/yr -> 1.42e13/yr
    -> new money lands in COMPANY deposits (hh share 23%% -> 0.2%%)
    -> households have only wage flow; prices pinned by the cost spring cannot clear the goods
    -> grocery sell-through collapses, inventory balloons, groceryBuffer drains (0.99 -> 0.005)
    -> avgHealthcareStarvation 0.02 -> 0.99, then avgGroceryStarvation -> 1.0
    -> deaths 1.5e7 -> 2.96e8/month vs births 2.07e7 -> 4.5e6 -> extinction y84.
Two independent defects compound here: (a) the credit-money leak puts the money in the wrong hands, and
(b) the cost spring prevents the price from clearing the market when demand falls.

### (4) WAGES do not track PRICES - the affordability ratio collapses
Measured wage/costOfLiving (how many wage-units one cost-of-living unit costs):
    y1 2.40 | y10 7.44 | y30 3.31 | y50 1.69 | y70 2.30 | y75 1.24 | y79 0.87 | y80 0.33
priceLevelServices ran 10 -> 354 while wagePrimary ran 1.27 -> 5.79 (4.5x vs 35x).
Cause (automaticWageAdjustment, automaticWorkerAllocation.ts):
    affordable   = lastMonth.revenue - purchases - claimPayments
    rawCeiling   = affordable / totalWorkersTicks
    _smoothedWageCeiling = 0.1 * rawCeiling + 0.9 * prev     (WAGE_CEILING_SMOOTHING = 0.1)
    targetWage   = WAGE_SHARE * ceiling = 0.6 * ceiling      (WAGE_SHARE = 0.6)
So wages are anchored to the firm's SMOOTHED residual cash flow (a ~10-month time constant) and to only 60%%
of it. They are not indexed to the price level at all, so when the credit-money loop inflates prices the wage
side lags and real household income collapses. (MAX_WAGE = 1000 was never binding; max observed wage 32.7.)

### SUMMARY of the y84 collapse - two defects compounding
1. CREDIT-MONEY LEAK (money created, wrongly allocated): auto-loans credit deposits; write-offs destroy the
   loan but never the deposits. bankDeposits -> 3.6e14, deposits/gdp 0.2 -> 5+, interest 3.3e9 -> 1.42e13/yr.
   The new money lands in COMPANY deposits: householdDeposits/bankDeposits falls 23%% -> 0.2%%.
2. PRICE CANNOT CLEAR + WAGES DO NOT FOLLOW: with demand falling, the grocery sell-through rule correctly
   cuts the price (0.9625/tick at sell-through 0.15) but the cost-floor spring adds back up to +0.043/tick
   in the brake zone (below 1.5x cost floor), so netFactor is ~0.998 at price/floor ~1.2 and >1 below
   ~1.11 - i.e. the price is pinned just above cost and the glut (2.4e9 units) never clears. Meanwhile
   wages are anchored to smoothed firm cash flow (60%%, 90%%-smoothed), so they fall behind the price level
   and wage/costOfLiving drops to 0.33.
Result: households cannot buy (no money share, and wages below cost of living), the market cannot clear by
price, grocery inventory balloons and the groceryBuffer drains -> healthcare then grocery starvation ->
deaths 2.96e8/month vs births 4.5e6 -> extinction y84.
The refill fix is NOT implicated: it removed the earlier input-strobe famine (survived to y84 instead of
y73.6, grocery buffer healthy for 80 years) and thereby exposed these two independent monetary/price defects.

### (5) The wage "recovery" is not slow - the wage rule is actively driving wages the WRONG WAY
Instrument: a per-year dump of the wage-adjustment internals (ceiling/target/avgWage/pull/penalty/pressure)
replayed from the refillfix-6000y checkpoint to y80. Result: `pressure` is NEGATIVE in the large majority of
years, so the rule is pushing wages DOWN while prices are rising.
Measured rows (per-year averages over all automated agents):
  year  ceiling   target   avgWage   pull     penalty   pressure   stepRaw   maxStep
  51    2.53      2.43     2.34     -1.262    0.612    -1.744     -0.818    0.0117
  64   -2.68      5.44     2.76     -1.540    0.762    -2.086     -1.153    0.0138
  70    1.25      4.79     4.47     -3.794    1.909    -5.691     -5.087    0.0223
  72   -2.72      4.31     4.23     -1.870    0.930    -2.596     -2.196    0.0211
  80   -0.45      2.11     2.28     -0.225    0.091    -0.289     -0.132    0.0114

Mechanism (automaticWorkerAllocation.automaticWageAdjustment):
    rawCeiling = (revenue - purchases - claimPayments) / totalWorkersTicks
    ceiling    = 0.1 * rawCeiling + 0.9 * prev        # smoothed, ~10-month lag
    targetWage = WAGE_SHARE * ceiling = 0.6 * ceiling
    bargainingPull = WAGE_BARGAINING_GAIN * (targetWage - avgWage) / ceiling
    springPenalty  = SPRING_K * max(0, (avgWage - ceiling) / ceiling)
    pressure       = shortage^2 + bargainingPull - springPenalty
    step           = clamp(WAGE_FEEDBACK_GAIN * current * pressure, +/- WAGE_ADJUSTMENT_RATE * current)
THE CONTROL IS INVERTED / NON-MONOTONIC IN A WIDE BAND. Two separate defects:
 a) `ceiling` can be NEGATIVE (firms with negative residual cash in the month: observed -9.91, -2.72, -2.68,
    -0.90, -0.45). Dividing by a negative ceiling flips the sign of bargainingPull, and the springPenalty
    then also misbehaves. The wage rule is undefined/unstable whenever affordable <= 0.
 b) Even for positive ceiling, the target is 0.6*ceiling, so bargainingPull is only positive when
    0.6*ceiling > avgWage, i.e. ceiling > avgWage/0.6 ~ 3.8. The economy sat at ceiling 0.5-3.4 for most of
    the run, i.e. BELOW that threshold, so the rule commanded wage CUTS while prices rose.
Demonstration of the non-monotonicity (avgWage fixed at 2.28, as observed at y80):
    ceiling -9.91 -> pressure +0.129 (raise)      ceiling +0.50 -> pressure -5.740 (LOWER strongly)
    ceiling -0.45 -> pressure +2.844 (raise)      ceiling +1.25 -> pressure -1.636 (lower)
    ceiling +9.38 -> pressure +0.357 (raise)      ceiling +2.53 -> pressure -0.301 (lower)
So the direction of the wage signal flips as the ceiling crosses zero and again around ~3.8, which is exactly
where the economy operates. This is a structural defect of the rule, not a missing time constant, and it is
NOT fixed by making the adjustment faster (the maxStep is not even binding).

ANSWER TO THE QUESTION: the wage recovery is not merely too slow. The rule
  (i) is not anchored to the price level at all,
  (ii) uses a target of only 60%% of the smoothed affordable ceiling, so it targets a wage far below what
       firms can actually pay (observed avgWage ~0.25 of ceiling), and
  (iii) INVERTS / breaks whenever the ceiling is negative or below avgWage/0.6, which was the normal
       regime - so for most of the run it pushed wages DOWN.
The maxStep (WAGE_ADJUSTMENT_RATE) was never the binding constraint (maxStep ~0.01-0.03 vs stepRaw often
larger in magnitude and negative).
