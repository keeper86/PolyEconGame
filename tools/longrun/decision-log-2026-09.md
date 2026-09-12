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

## Which node drives it? NOT the chemical/pesticide/agri starvation (measured, 2026-09-09)
Hypothesis tested: agri oscillates because chemical (refinery, multi-output) -> pesticide -> agri starves it.
Instrument: tmp_chainprobe.ts replays refillfix-6000y from its y50 checkpoint through y80.2 at 6-tick
resolution for Oil Refinery / Pesticide Plant / Agricultural Facility / Food Processor, capturing per-input
efficiencies, worst worker efficiency, overallEfficiency, PID signal, sell-through, price and cost floor.

RESULT - the starvation hypothesis is FALSE for this run:
  facility                 n     inputZero      workerZero   outputZero
  Oil Refinery            373    0.0%%           0.0%%         0.0%%
  Agricultural Facility   373    0.0%%           0.0%%         0.0%%
  Pesticide Plant         373    1.6%%           0.0%%         1.6%%
  Food Processor          373    1.6%%           0.0%%         1.6%%
Agricultural Facility is NEVER input-starved (arable/water/pesticide all 1.0000 in every sample) and has no
worker deficit. The refinery is never short of crude. So agri does not oscillate because it is starved.

WHAT IS ACTUALLY HAPPENING - a shared, undamped control-law limit cycle:
  facility                 median sellThrough   median price/costFloor   scale swing
  Food Processor           -0.068               0.001                    11.0x
  Agricultural Facility     0.025               1.030                    10.3x
  Pesticide Plant           0.000               1.017                    11.0x
  Oil Refinery              0.020               0.950                    10.5x
Every node in the chain (a) sells essentially nothing (demand has collapsed), (b) has its price pinned at
the cost floor (ratio 0.95-1.03) so the glut can never clear, and (c) swings its operating scale ~10x.
Agricultural Facility detail: maxScale is CONSTANT at 1.205e6 while scale swings 1.47e5 <-> 1.205e6 (8x);
inputs 1.0/1.0/1.0 throughout; offerPrice ~= costFloor (7.91 vs 7.22, 15.57 vs 14.65); sellThrough 0.0000-
0.09; output inventory ~1.2-1.7e10. So it is producing into a glut it cannot sell, at a price the cost
spring will not allow to fall, while its storage PID hunts for a target it can never reach.

WHY THIS MATTERS FOR THE CAPACITY/JOBS PROBLEM:
Agri maxScale = 1.205e6 while its normal operating scale is ~1.5e5. The expansion logic ratcheted maxScale up
during the boom phases, so the planet's total job-slot capacity is sized for a scale that is almost never
operated. Measured: total slot capacity grew 2.31e9 -> 1.35e10 (5.8x) while employed grew 3.25e9 -> 6.13e9
(1.9x), flipping employed/capacity from 1.41 (workers surplus) to 0.455 (jobs far exceed workers), with
fillPrimary at 0.27 and tightnessPrimary at 71. THAT is the satisfiability problem, and it is caused by
maxScale ratcheting, not by the service-sector bloat (services are now flat: svc scale per capita 9.2e5 ->
1.07e6 over 80y, i.e. 1.16x, confirming the net-demand serviceFlowError fix worked).

So the causal order is: cost-floor spring pins prices -> gluts never clear -> storage PIDs hunt -> expansions
ratchet maxScale up during booms -> planet job capacity outgrows the workforce -> unsatisfiable labour demand
-> fillRates fall -> output and wages fall -> inflation (money) then starves households.

## Applying Spiegler & Naim (describing function / limit cycles), 2026-09-09
Reference: V. L. M. Spiegler, M. M. Naim, "Investigating sustained oscillations in nonlinear production and
inventory control models". See tools/longrun/letter-to-spiegler-naim-2026-09.md for the full mapping.

Their result that applies: for an APIOBPCS-like controller, the CLIP (saturation) in the ordering rule causes
STABLE limit cycles even with constant demand, via a describing-function gain that collapses from 1 to 0.5 as
the input amplitude passes the clip's linear range. The stability boundary is a RATIO condition (their Eq.
21/22): limit cycles for 0.5*Tp <= Tw <= Tp, amplitude growing as Tw falls toward 0.5*Tp, unstable below.

Our numbers against that:
  - error := clamp(error, -1, +1) -> signal sat at the clamp permanently during the oscillation
    (measured: agri signal at the clamp while scale swings 1.47e5 <-> 1.205e6, inputs 1.0/1.0/1.0, sellThrough ~0)
  - PID_OUT_MAX_UP = 0.1 of full scale per tick, storage lead-time horizon Tp = 3 months = 90 ticks
    -> Tw/Tp ~ 0.11, i.e. ~5x BELOW the 0.5 lower edge = inside their "possibly unstable" region
  - rate limit was ASYMMETRIC 10:1 (up 0.1, down 0.01) -> the multi-valued describing function case they
    flag as less accurate and relaxation-oscillation-like; matches our 4-month ramp + fast crash shape

Changes applied:
  1. signalComputation.ts: clamp(x,-1,1) -> tanh(x) (soft saturation). The loop now stays in the linear
     region where the describing-function gain is ~1, which removes the limit cycle by construction rather
     than by tuning. The storage error is a normalized fraction so tanh preserves small-signal behaviour.
  2. constants.ts: PID_OUT_MAX_UP 0.1 -> 0.01, now EQUAL to PID_OUT_MAX_DOWN. This (a) symmetrises the rate
     limit, removing the relaxation-oscillator asymmetry, and (b) raises the effective Tw by 10x, moving the
     ratio from ~0.11 toward the region where a bounded response is expected.
  3. New tests in automaticProductionScaleDynamics.test.ts pinning the paper's Fig. 7a-vs-7b discriminator:
     constant saturating error must converge to a CONSTANT scale (no sustained cycle), scale motion must be
     monotone, per-tick motion must never exceed the rate limit, and small-signal gain must stay at unity.

Tests updated for the new contract (the old assertions encoded the hard-clamp value):
  automaticProductionScaleDynamics.test.ts (tanh(0.5), tanh(-1), tanh(0.75)),
  automaticProductionScale.test.ts (smoothedSignal tanh(1), integral-vs-single-step comparison).
Full suite: 118 files, 1769 passed, 1 skipped; npx tsc --noEmit clean.

Acceptance test: singleAgent 90y run (out=softclip-90y). Passes if the ~10x co-swing of agri/pesticide/
refinery/food-processor is gone AND employed/capacity stops collapsing (it was 1.41 -> 0.455 over 80y in
refillfix-6000y). Per the paper's Section 6 point 3 the maxScale ratchet should be a SYMPTOM; if it does not
shrink once the oscillation is removed, the single-nonlinearity assumption fails for us and the cost-floor
price spring is a genuinely independent second oscillator.

### Acceptance test result: softclip-90y (singleAgent, 90y)
Survived the full 90 years. Population 9.8e6 -> 1.62e7 (+65%%), facility condition ~0.99 throughout.
Previous runs (refillfix-6000y) died at y84 with a population collapse; the pre-refill-fix one died at y73.6.

employed/slotCapacity, the satisfiability ratio that previously collapsed (1.41 -> 0.455 over 80y):
    y20-35  1.4651
    y40-55  1.4323
    y70-88  1.3899
Flat at ~1.4 with no downward drift. THE CAPACITY-vs-WORKFORCE COLLAPSE IS GONE.
This confirms Spiegler & Naim Section 6 point 3 for us: the maxScale ratchet was largely a SYMPTOM of the
cycle (expansion integral accumulating while scale sat at the ceiling during the boom half).

Operating-scale swing, same windows:
    facility            y20-35   y40-55   y70-88   trend
    agriculturalFacility 11.04x   6.55x    5.01x   shrinking
    foodProcessor         3.51x   2.11x    1.68x   shrinking
    oilRefinery          11.41x  11.45x   11.38x   FLAT - unfixed
    pesticidePlant       11.76x  10.26x   11.73x   FLAT - unfixed
Versus the hard-clip run over y30-48: agri 12.32x -> 6.81x, foodProcessor 8.92x -> 2.84x, refinery 14.86x ->
11.62x, pesticide 11.00x -> 11.81x. So the soft clip fixed the two nodes whose cycle was driven by the
describing-function gain collapse, and did nothing for the two that are not.

Why refinery and pesticide survive: their price/cost-floor ratio still reaches the floor. In y25-48 the
price/cost ratio sits in a bounded band for most facilities (clothingFactory 0.86, maintenanceFacility 0.94,
beveragePlant 0.95, itDevicesFactory 0.97) but oilRefinery reaches 0.0129 and pesticidePlant 0.7361 - i.e.
these two prices are still being driven INTO the cost floor, so the cost-floor spring is still the binding
nonlinearity for them. Before the fix the ratio was pinned at the floor for ALL of agri/pesticide/refinery/
foodProcessor at 0.95-1.03 while the scale swung 10x; now the price channel has recovered its freedom almost
everywhere except these two.

CONCLUSION for the letter's point 1: the single-nonlinearity assumption does NOT hold for us. We removed the
clip nonlinearity and two of four coupled oscillators died and the capacity drift disappeared, while two
others were untouched - which is what independent-coexistence of a second oscillator looks like. The
cost-floor price spring is the remaining candidate and is now the next target.

## STORAGE_TARGET_MONTHS as Tp, and the two-knob relation (2026-09-09)
Spiegler & Naim Eq. 21/22 says the stability boundary is a RATIO: limit cycles for
    0.5*Tp <= Tw <= Tp,   amplitude growing as Tw falls toward 0.5*Tp, unstable below.
In our loop Tp = STORAGE_TARGET_MONTHS * 30 (own-capacity output horizon) and Tw = 1/PID_OUT_MAX_UP.

FIRST ATTEMPT (wrong direction, caught by the new guard test): raising STORAGE_TARGET_MONTHS alone
makes the ratio WORSE, because a longer horizon demands a SLOWER correction. With PID_OUT_MAX_UP=0.01
(Tw=100):
    months= 3  Tp= 90  Tw/Tp=1.11  compliant
    months= 9  Tp=270  Tw/Tp=0.37  IN the limit-cycle band
    months=18  Tp=540  Tw/Tp=0.19  IN the band
The guard test 'holds Tw >= 0.5 * Tp' failed and prevented a 25-hour run from being wasted.
Max STORAGE_TARGET_MONTHS satisfying the bound at Tw=100 is 6.67.

SECOND ATTEMPT (the actual change): raise the horizon AND slow the correction together.
    STORAGE_TARGET_MONTHS  3 -> 12   (Tp 90 -> 360, 0.5*Tp = 180)
    STORAGE_CAPACITY_MONTHS 4 -> 13  (shell residency follows the target via residencyMonthsTicks)
    PID_OUT_MAX_UP/DOWN    0.01 -> 0.005  (Tw 100 -> 200, now 200 >= 180, inside the stable region)
Both rate limits stay SYMMETRIC. Guard tests added so the ratio cannot silently regress:
  'holds Tw >= 0.5 * Tp as required by Spiegler & Naim Eq. 22'
  'keeps the target above the capacity horizon so shells can hold the buffer'

EFFECT, singleAgent 6000y run, out=stable6000y (measured to y70):
    facility              y8-20   y25-35  y40-47
    oilRefinery           1.09x   1.28x   1.17x   FIXED (was 11.4x)
    foodProcessor         9.70x   4.58x   4.19x   improved
    agriculturalFacility 10.81x   9.54x  10.97x   unfixed
    pesticidePlant       10.00x  10.00x  10.28x   unfixed
    loggingCamp          10.26x  10.98x  10.00x   unfixed
    copperMine           10.63x  11.80x  11.52x   unfixed
The multi-output node (oilRefinery) that we suspected was the coupling hub is now completely stable. The
nodes that still swing at ~10x are those whose price is still driven into the cost floor.

NOT CURED - the capacity drift returns:
    employed/capacity   y8-20 1.5385 | y25-35 1.3601 | y40-47 1.2748
drifting down at the same signature as the original failure. So the clip+rate fix removes the oscillation in
the nodes it controls but the residual ~10x swing in the remaining nodes STILL rectifies into maxScale. This
is the letter's point 1 confirmed a second time: independent nonlinearities coexist, and the cost-floor
spring is the remaining one. It must be fixed before the capacity drift can be expected to stop.

Tests hardcoded against the old constants were made constant-derived rather than re-pinned:
  shellCompartments.test.ts (STORAGE_CAPACITY_MONTHS), automaticProductionScale.test.ts
  (oversupplyQuantity helper replacing 18000), automaticProductionScaleDynamics.test.ts (target from constant).
Full suite: 118 files, 1771 passed, 1 skipped; npx tsc --noEmit clean.

## Which sector over-expands? None specifically - it is whichever facility still oscillates (2026-09-09)
Question: the old failure had SERVICES expanding over the top. Is it the same now?
Answer: NO. Measured on stable6000y (singleAgent 6000y, checkpoint series to y133).

l) Growth of operating scale, y5-15 -> y115-133 (all 40 facility types, top and bottom):
    oilWell 5.81x, logisticsHub 5.40x, ironSmelter 5.24x, oilRefinery 4.73x, electronicsFactory 4.64x,
    cementPlant 4.18x, itDevicesFactory 4.15x, vehicleFactory 4.14x, machineryFactory 3.78x ...
    ... maintenanceFacility 2.99x, retailChain 2.32x, hospital 2.14x, groceryChain 1.91x,
    educationCenter 1.87x, agriculturalFacility 1.99x, foodProcessor 1.98x, pesticidePlant 1.72x
The top growers are all GOODS / upstream-industrial (extractive -> processing -> capital goods). Services are
mid-to-low, and the whole food chain sits at the BOTTOM. So the service-bloat mode is gone.

m) But growth alone is not the discriminator. Cross-tabulating growth against the residual oscillation
   (swing of operating scale, y110-133) gives a near-perfect correspondence:
    facility                growth    swing(y110-133)
    oilWell                 5.81x     12.03x   <- oscillates, grows most
    ironSmelter             5.24x     11.00x   <- oscillates
    electronicsFactory      4.64x     15.28x   <- oscillates
    agriculturalFacility    1.99x     10.53x   <- oscillates
    oilRefinery             4.73x      1.41x   <- STABLE
    maintenanceFacility     2.99x      1.22x   <- STABLE
    hospital                2.14x      1.52x   <- STABLE
    groceryChain            1.91x      1.39x   <- STABLE
The facilities that stopped oscillating (refinery etc, per the Tp work) also STOPPED over-expanding, even
though oilRefinery grew 4.73x in scale. The facilities that still oscillate are exactly the ones that
overtake their customer base.

n) Two independent measures of the same event:
    window     oscSectorsSum   stableSectorsSum   ratio    employed/capacity
    y8-20         6229             8771           0.710     1.5385
    y50-70       1.098e4          1.357e4         0.809     1.1740
    y80-100      1.809e4          1.785e4         1.014     0.9657
    y110-133     3.278e4          2.721e4         1.205     0.8277
The oscillating sectors overtake the stable ones (0.71 -> 1.20) exactly as the capacity ratio falls
(1.54 -> 0.83). The two curves are the same event.

CONCLUSION: the guilty sector is NOT a sector, it is the DUTY CYCLE. Whichever facility still limit-cycles
spends the boom half of its cycle sitting at maxScale, which accumulates expansionIntegral and ratchets
maxScale up; a facility that does not oscillate never sits saturated and never ratchets. This is the letter's
point 1 and the paper's Section 6 point 3 exactly. It also means the fix is NOT a per-sector cap: fixing the
remaining oscillators removes the ratchet automatically, as oilRefinery/hospital/maintenance/grocery already
demonstrate. Whether the cost-floor price spring is the remaining oscillator is the next check.

CAVEAT on the labor guard: shortage DOES scale the expansion down (EXPANSION_WORKER_RESERVE_MARGIN and the
unemployed-workers gate) but cannot stop it, because the gate is evaluated at the moment the integral crosses
threshold - and an oscillating facility spends enough ticks at maxScale with positive signal to cross it
repeatedly. A rate-limited or budget-gated ratchet still ratchets, just slower. So the guard changes the rate
of the failure, not its existence; that is consistent with the observed slow monotone drift rather than a
collapse.

## The remaining oscillator is MIN_SCALE_FRACTION (2026-09-09)
Probe: tmp_oscident.ts replayed stable6000y from its y200 checkpoint over y200-212 at tick resolution,
capturing scale/maxScale/util, storage signal, inventory/target, per-input efficiency, overallEfficiency,
unfilled fraction, price, cost floor and demand for 8 facilities (5 known oscillators, 3 known stable).

Discriminator found. Fraction of ticks pinned AT the MIN_SCALE floor (util <= 0.101):
    facility                  atFloor%   atMax%    swing
    Oil_Well                    18.6%     61.0%   11.30x
    Electronics_Factory         17.9%     17.0%   10.79x
    Iron_Smelter                14.4%     13.4%   10.26x
    Pesticide_Plant             13.8%     23.2%   12.12x
    Agricultural_Facility        3.3%     25.9%   10.98x
    Oil_Refinery                 0.0%    100.0%    1.15x  <- stable
    Hospital                     0.0%      7.8%    1.32x  <- stable
    Maintenance_Facility         0.0%     91.2%    1.11x  <- stable
Perfect separation: every oscillator visits the floor for 3-19% of ticks, every stable facility 0.0%.

Being pinned at the CEILING is harmless: Oil_Refinery sits at maxScale for 100% of ticks with a 1.15x swing
and Maintenance Facility for 91.2% with 1.11x. It is specifically the FLOOR that breaks the loop.

Mechanism: MIN_SCALE_FRACTION = 0.1 is a hard CLIP on the control output (scale), not on the error signal.
When the controller commands contraction the floor clamps it, so the loop gain in the contracting direction
collapses exactly as it did with the old error clamp - this is the THIRD nonlinearity, and it is the one my
tanh change did not touch (tanh fixed the clip on the signal; the floor clips the actuator). The facility then
HANGS at the floor while inventory rebuilds, then jumps back up: a sawtooth.
Confirming measurement: of the ticks spent at the floor, the signal is NEGATIVE 98.4% of the time
(Oil_Well 790/803, Electronics 747/773). A negative command is being clamped, i.e. the floor is active and
binding, not merely touched.

Corollary: the ~11x swing amplitude is SET BY THE FLOOR CONSTANT, not by the dynamics. 1/MIN_SCALE_FRACTION
= 10, and the observed swings are 10.3-12.1x. The oscillation amplitude is a parameter of the clip.

Also measured and DISCONFIRMED as the primary cause:
  - cost floor: the goods oscillators do sit at price/floor 0.93-1.01 (pesticide 0.986, iron smelter 0.933,
    agri 1.008, electronics 1.009) BUT Oil_Well oscillates 11.30x with price/floor = 1.187, i.e. ABOVE the
    floor. So the price floor is a co-symptom, not the driver.
  - inventory setpoint: oscillators sit at inv/target 0.98-1.01 with signal ~0.00, stable facilities at
    signal 0.67-0.76 with inv/target 0.004-0.33. The oscillators are parked on their own setpoint where the
    controller has no restoring force, which is what lets the floor-clip cycle run.
  - corr(scale, inv/target) is NEGATIVE for oscillators (Oil_Well -0.725, Agri -0.232) and POSITIVE for the
    stable ones (Refinery +0.839, Hospital +0.708). For the oscillators the scale is not tracking inventory.

NEXT: this is a fixable clip, same class as the one already fixed. Candidate - remove the hard floor and let
scale approach zero smoothly (the soft-clip treatment applied to the actuator), or make the floor a soft
asymptote. Must keep scale > 0 because the storage target is proportional to maxScale, not scale, so a zero
scale is representable. Guard with the same style of regression test: a sustained negative command must drive
scale down MONOTONICALLY toward its bound without a rebound.

## Applying the soft scale floor (2026-09-09)
Change: the hard `Math.max(maxScale * MIN_SCALE_FRACTION, ...)` actuator clamp in the autoscale loop is
replaced by a soft floor. Above the floor it is the identity (normal operation unchanged); below it the excess
is squashed through tanh instead of being discarded:

    applySoftScaleFloor(scale, floor, range):
        if scale >= floor: return scale
        excess = floor - scale
        return floor - range * tanh(excess / range)

with SOFT_MIN_SCALE_RANGE = 0.05 (new constant) and range = maxScale * SOFT_MIN_SCALE_RANGE.

Why: MIN_SCALE_FRACTION = 0.1 was a hard CLIP on the control OUTPUT, so a negative command hit a wall and the
loop lost gain in the contracting direction. Measured at the y200 checkpoint: every oscillating facility spent
3-19%% of ticks pinned at that floor with a NEGATIVE signal 98.4%% of the time, while every stable facility
spent 0.0%% there. Pinned at the CEILING is harmless (Oil_Refinery 100%% at maxScale, swing 1.15x). The swing
amplitude matched 1/0.1 = 10 (observed 10.3-12.1x), i.e. it was a property of the clip, not the dynamics.

Properties the new floor guarantees (all covered by tests):
  - identity at/above the floor, continuous across the boundary
  - a stronger negative command always yields a lower scale (authority retained)
  - bounded below by floor - range, so scale stays > 0 and representable
  - sustained negative command drives scale down monotonically with no rebound
atMinScale is now `scale <= minScale` (was `<= MIN_SCALE_FRACTION * maxScale * 1.001`) so the contraction
integral still arms when scale sits in the soft region.

`production.ts` still uses MIN_SCALE_FRACTION for its one-off construction-completion seed
(`max(MIN_SCALE_FRACTION, scaleFraction)`) - intentionally left alone, it is not the control loop.

Tests updated for the new contract (the old assertion REQUIRED the jump onto the floor):
  'clamps scale to the minimum floor...' -> 'approaches the minimum floor smoothly instead of clamping onto it
  from below'. New describe block 'soft scale floor keeps the contracting direction responsive' with 6 tests.
Full suite: 119 files, 1784 passed, 1 skipped; npx tsc --noEmit clean.

CONTROL EXPERIMENT: stable6000y (hard floor) is left running as the control; softfloor-6000y is the treatment.
Expected if the diagnosis is right: the 3-19%% at-floor occupancy goes to ~0, the ~10-12x swings collapse, and
the employed/capacity ratio stops drifting down. If the swings persist, the floor was not the driver.

### Soft-floor run: first read at y35 - INCONCLUSIVE, do not judge yet
softfloor-6000y vs stable6000y (control), y8-20 window (the only overlapping window so far):
    facility               control   softfloor
    oilWell                 4.28x     2.85x   better
    ironSmelter             2.59x     1.24x   better
    oilRefinery             1.09x     1.24x   both fine
    hospital                1.61x     1.62x   same
    electronicsFactory      5.10x    15.41x   worse
    agriculturalFacility   10.81x    14.79x   worse
    pesticidePlant         10.00x    14.41x   worse
Two improved, three worse, one unchanged. This is NOT the clean swing collapse the diagnosis predicted, but it
also cannot be read as a refutation yet, for two reasons:
  1. The window is the startup transient. The mechanism was diagnosed at y200+ on the control; at y35 the seed
     scale is still settling in both runs. The control's own y8-20 numbers (10.81x agri) are noisier than its
     y200+ numbers.
  2. Absolute scale ranges are NOT comparable across the two runs at different times, because both runs grow
     monotonically. Comparing control-y281 ranges against softfloor-y35 ranges is invalid and was not done.

What IS needed before any conclusion: the same measurement at a matched epoch. The control is at y281 and its
y200 checkpoint exists; softfloor-6000y reaches its first checkpoint at y200 (roughly 1.5h). At that point
re-run the at-floor occupancy measurement (tmp_oscident.ts style) on the softfloor checkpoint and compare
against the control's measured 3.3-18.6%% at-floor occupancy and 10.3-12.1x swings.

Decision rule stated in advance: if at-floor occupancy at the matched epoch is near 0%% AND the swings collapse,
the diagnosis is confirmed. If at-floor occupancy is near 0%% but the swings persist, the floor was necessary
but not sufficient (a fourth nonlinearity exists). If at-floor occupancy is still high, the soft floor is not
actually binding where the hard floor was, i.e. the implementation did not change the behaviour.

Also noted: electronicsFactory getting WORSE (5.10x -> 15.41x) is the single most suspicious data point and
should be checked first at the matched epoch. It had inv/target ~1.003 and signal ~-0.003, i.e. parked exactly
on its setpoint.

### Soft-floor result at y68: MY DIAGNOSIS WAS WRONG IN AN IMPORTANT WAY
Matched-window comparison (three windows, so this is not a transient artefact):
    facility               control y8-20 / y25-45 / y55-68    softfloor y8-20 / y25-45 / y55-68
    oilRefinery            1.09 / 1.59 / 1.28                  1.24 / 1.22 / 1.08     equal or better
    electronicsFactory     5.10 / 12.11 / 6.78                15.41 / 9.27 / 7.26    converges
    oilWell                4.28 / 3.78 / 6.06                 2.85 / 3.17 / 8.92     oscillates both
    agriculturalFacility  10.81 / 10.97 / 12.08              14.79 / 14.53 / 14.12   WORSE
    pesticidePlant        10.00 / 10.28 / 10.26              14.41 / 14.76 / 14.41   WORSE
    employed/capacity      1.5385 / 1.3417 / 1.1681           1.5034 / 1.3487 / 1.2573  BETTER

WHAT THE FLOOR ACTUALLY CONTROLS - the amplitude, not the existence of the cycle:
    effective floor   predicted amplitude   observed amplitude
    0.10 (hard)       10.0                  10.0-12.1
    ~0.058 (soft)     17.3                  14.1-17.3
obs at matched epoch: agriculturalFacility 17.27x, pesticidePlant 15.45x, oilWell 8.92x, foodProcessor 5.25x.
The soft floor let scale fall to 0.05*maxScale instead of 0.1*maxScale, so the EXCURSION DEPTH roughly doubled and
the swings got about 1.7x larger. The floor sets the amplitude of the limit cycle, in direct proportion to
1/floor. Lowering the floor made the oscillation BIGGER, not smaller.

CORRECTION to the earlier claim: I wrote that MIN_SCALE_FRACTION "IS the remaining oscillator". That is wrong.
The correct statement is: the floor determines the AMPLITUDE (depth) of the excursion, while something else
determines that the cycle exists at all. Evidence: the at-floor occupancy was a perfect discriminator between
oscillating and stable facilities (3-19%% vs 0.0%%) and the signal was negative 98.4%% of the time at the floor
- both still true - but removing the hard clip did NOT stop the cycling, it only changed the depth. A facility
parked on its setpoint with no restoring force will use whatever excursion range the actuator affords it.

WHAT IS STILL GAINED: employed/capacity is consistently better at every window (1.2573 vs 1.1681 at y55-68,
and the gap widens). Continuing the run is worthwhile for that alone, and it is the metric that actually
determines whether the economy survives.

WHAT THIS POINTS TO NEXT: the oscillator exists because the facilities sit at inv/target ~1.00 with signal
~0.00 (electronics 1.003/-0.003, agri 0.981/0.019, pesticide 0.990/0.010) - ON their setpoint, where a PID has
no restoring force and the derivative term dominates. The stable ones sit far from setpoint with a strong
steady signal (refinery inv/target 0.327 signal 0.672, hospital 0.004/0.760, maintenance 0.012/0.756). So the
next suspect is the SETPOINT ITSELF: a target that the facility can always reach and then hover on is an
unstable equilibrium for this controller. The excursion depth was just a symptom I mistook for the cause.

## The amplitude law is confirmed at three points; floor=0.25 is the best run so far (2026-09-09)
Operating-scale swing, window y6-20, all four runs (control = hard floor 0.10):
    facility               control   softfloor   floor25   setpoint
    agriculturalFacility   10.81x    14.79x      4.21x     3.88x
    pesticidePlant         10.00x    14.41x      4.41x    15.79x
    electronicsFactory      5.10x    15.41x      4.84x     5.58x
    oilWell                 4.28x     2.85x      2.54x     2.62x
    ironSmelter             2.59x     1.30x      1.05x     1.21x
    oilRefinery             1.09x     1.24x      1.09x     1.00x
    employed/capacity       1.5373    1.5168     1.5562    1.5501

THE AMPLITUDE LAW: swing ~= 1/effectiveFloor, confirmed at three independent floor values:
    effective floor 0.10 (hard)   -> predicted 10.0   -> observed 10.0-12.1
    effective floor ~0.058 (soft) -> predicted ~17    -> observed 14.1-17.3
    effective floor 0.25 (floor25) -> predicted 4.0   -> observed 4.2-4.8
This is a clean, predictive quantitative relationship. The floor sets the excursion depth in direct proportion
to 1/floor and nothing else about the cycle changes.

floor25 is the best run on the capacity metric so far (employed/capacity 1.5562 vs control 1.5373 at y6-20),
but see the caveat below before trusting that.

setpoint (--storageTargetScaleAnchored=on): logged as a FALSIFICATION test, not a fix. The user correctly
predicted the sign: scale -> target = f(scale) -> target easier to meet -> less recovery pressure -> scale
falls further, i.e. positive feedback, so it should ratchet down or behave erratically rather than stabilise.
Early data is consistent with that: condition 0.886 at y8 (lowest of all four runs, control is 0.996), and
while agri improved to 3.88x, pesticide got WORSE at 15.79x. If it stabilises anyway, the park-on-setpoint
mechanism is not what I think it is.

METRIC DEFECT FOUND (pre-existing, affects all runs, not introduced here): fillPrimary exceeds 1.0 in 141/191
samples of floor25-6000y (max 1.2222). slotsFilledPrimary genuinely exceeds capacityPrimary (tick 90:
1444327 filled vs 1283490 capacity). So the two are counted over different populations or at different times.
metrics.ts:1219 computes fillPrimary as slotsFilledByEdu/capacityByEdu, which is only coherent if both come
from the same slot universe. NOT patched: changing it now would invalidate the cross-run comparison, and it is
orthogonal to the oscillation question. Logged for a separate investigation. employed/capacity is computed
consistently from employed and the two slot-capacity fields and is used for all cross-run comparisons instead.
