# SESSION HANDOVER — labour/service-price investigation

Temporary memory-transfer note for context compaction. Branch `solve-hr-deadlock`,
HEAD `27a5b32f "fixing"` (work committed; `git status` clean). Delete when stale.

## 1. What the session was about

Started as: "labour market has no elasticity — employed/unemployed is set by
circumstances; can we make elasticity emergent?" It walked from labour → wages →
quit/hire → and then into the *real* downstream finding: a **chronic famine
equilibrium**, which is an **affordability** failure, not a production one. The
through-line fix that worked was **lowering the cost-floor brake**.

## 2. Current code state (what changed vs `origin/solve-hr-deadlock`)

- `src/simulation/constants.ts`
  - `AUTOMATED_COST_FLOOR_BUFFER` **1.5 → 1.25** (the spring's brake top; the real default).
  - `TARGET_SELL_THROUGH` (goods) **1.2 → 1.1**.
  - `TARGET_SELL_THROUGH_SERVICES` **0.86 (=TARGET_FILL_RATE) → 1.1** (now explicit).
- `src/simulation/initialUniverse/personalities.ts` (less heterogeneity, 1 DoF)
  ```ts
  const rndParameter = 0.025 * gauss(0, 0.5);                  // sd 0.0125 (was 0.01)
  const priceAdjustmentAggressivenessUp   = Math.max(1.01, 1.05 + rndParameter);
  const priceAdjustmentAggressivenessDown = Math.min(0.99, 0.95 - rndParameter);
  const sellPriceAgressiveness = Math.max(1.05, AUTOMATED_COST_FLOOR_BUFFER + rndParameter);
  const buyPriceAgressiveness  = BID_ANCHOR_MULTIPLE - 1 - rndParameter;
  ```
  Means preserved (1.05 / 0.95 / 1.25 / 6.0), symmetric, single "aggressiveness"
  DoF. `sellPriceAgressiveness` now *tracks the constant* (was hard-coded 1.5,
  which silently overrode `AUTOMATED_COST_FLOOR_BUFFER` — the trap we hit).
- `src/simulation/market/automaticPricing.ts` — service sell-through **anchored to
  production rate** (uncapped) and **tick-aligned**:
  ```ts
  const serviceProductionAnchor = offer.resource.form === 'services' && productionRate > 0;
  const sellThroughBase = serviceProductionAnchor ? productionRate : effectiveQuantity;
  const priorBase = offer.lastSellThroughBase !== undefined && offer.lastSellThroughBase > EPSILON
      ? offer.lastSellThroughBase : sellThroughBase;               // same-tick numerator+denominator
  const sellThrough = serviceProductionAnchor ? sold / priorBase : (sold / priorBase) * sellSmoothing;
  offer.lastSellThroughBase = sellThroughBase;
  ```
  Stockout branch uses `sold / (offer.lastSellThroughBase ?? productionRate)` for services.
  `sellSmoothing` stays 1 for services, 4 for goods(=SELL_PRODUCTION_SMOOTHING); `sellThroughRate`
  diagnostic now reports the normalised value.
- `src/simulation/planet/planet.ts` — new optional `AgentMarketOfferState.lastSellThroughBase`
  (msgpack-safe; old snapshots fall back).
- Household service demand (`serviceDefinitions.ts`, `populationDemand.ts`, `settlement.ts`,
  `consumption.ts`) — price-independent, cost-floor-anchored `serviceDemandFactor` multiplied
  into the service flow *consistently in all three places* (bids, buffer settlement, decay).
  Toggle `setServicePriceResponseEnabled`, knob `setServiceNeutralMarkup` (default 1.25),
  CLI `--servicePriceResponse`, `--serviceNeutralMarkup`.
- Demand shock (money) — new `src/simulation/agents/demandShock.ts` + call in `engine.ts`
  + flags `--demandShockPerCapita/StartYear/Years`; deficit-financed (`governmentSupport` loan,
  government is bankruptcy-exempt). Protocol: `tools/longrun/demand-shock-protocol.md`.
- `tools/longrun/metrics.ts` — new per-facility columns:
  `facilityOfferPriceOverCost_*` (the real **offer** price / cost floor),
  `facilityCostSpringDeviation_*`, `facilitySellThroughFactor_*`, `facilityNetPriceFactor_*`.
- Tests updated: `automaticPricing.test.ts` (sellThroughRate 0.3→3), `groceryMarket.test.ts`
  (two tests re-based on the production anchor — fixture capacity is 1e6/tick).

## 3. Running experiments

| out dir | cfg | what it tests |
|---|---|---|
| `svc125anchor-10000y-s1001` | singleAgent, seed 1001, rm 100000, **old** personalities | brake 1.25 + production anchor + target 1.1 |
| `svc125anchor-pers-10000y-s1001` | identical except **new** personalities | A/B the narrowed-variance personality change |

Both 10000y. Latest state: `svc125anchor` **y393**, `-pers` **y322** (~2.5 GB RSS each).
Monitor: `tail -f tools/longrun/results/<dir>-run.log`.
Result of the A/B: **null** (see §9).

## 4. Findings (the arc, condensed)

**Labour market (fix6).** Wages pinned at `MIN_WAGE = 1` in all four tiers; `tightness = 0`,
`wageQuitRate = 0`, `wageShortagePressure = 0`, `wageChurnPressure = −0.027` (pushes *down*);
`wageCeiling` 1.16–1.44 (firms *can* afford more). Wages are held only by the legal floor. The
wage channel is **inoperative at ~80% unemployment** (not severed) — the "locally trapped"
narrative: with no vacancies there is no leverage, so nothing lifts wages off the floor.

**The long run is a chronic famine equilibrium, not events.** fix6 y0–2602:
`avgGroceryStarvation > 0` in 30,382/31,224 months; continuously above 0.05 from **y566→y2602**
(peak 0.293), earlier y78–565. `starvationSevereFraction` mean 0.44; `deathsStarvationPerTick`
mean 738; population plateaus ~27M; employment rate pinned 0.15–0.18. From ~y78 the economy sits
in a stable low (Malthusian-ish) state.

**The famine is an affordability failure, not capacity** (fix6 y1600): need 916k/tick,
capacity 988k/tick (**1.08× need — capacity suffices**), bids 880k ≈ need, offers 5.22M
(**5.9× demand**), yet only 395k clears: **484k unfilled *and* 4.83M unsold in the same tick**.
`meanWealth ≈ 0.096`, `governmentDeposits ≈ 4e5` (support ≈ 0) ⇒ budget-clamped bids sit below
the ask. Not a maxScale issue, not a chain break (though `processedFood` does fill 0 — unresolved).

**Prices are spring-pinned, not floating.** Spring active ~90% of facility-months, down-step
maxed ~88–99%, mean "pinned" fraction (sell factor within 2% of its own min) **0.87**. The spring
is a hard floor at `brakeTop / (1 + ((1−maxDown)·7/strength)²)`: brake 1.5 ⇒ ≈1.0–1.34×cost,
brake 1.25 ⇒ ≈0.84×cost. **Metric trap (fixed):** the old `facilityPriceOverCost_*` used
`priceOf()` = market/tâtonnement price, which for an untraded service *converges toward the best
bid* (below cost) while the real offer is floored — the new `facilityOfferPriceOverCost_*` reads
the offer (e.g. educationCenter 0.601 market vs 1.020 offer). Trust the new column.

**The service sell-through bug.** Goods measure against *production* (offer capped at
`productionRate×4`, `sellSmoothing = 4` ⇒ net `sold/production`). Services measured against
**storage** (the retainment/offer cap is skipped for services, `sellSmoothing = 1`); storage ≈ 6
ticks of production (decay 10%/tick) ⇒ sell-through deflated ~0.07 ⇒ permanent max-cut ⇒ spring
pins the price. Anchoring to `productionRate` fixes the scale but **raises the effective price**
(0.07 → 0.4–0.9 ⇒ *less* cutting ⇒ the balance sits higher): at brake 1.5 the grocery offer P/C
went **1.25 (storage) → 1.39 (anchor)**, and that run was strictly worse (starvation from y50,
severe cases, population stalled at 12.3M vs the control's 16M at y99). **The anchor alone is
contractionary.**

**What actually worked: the brake.** Branched y150→400 test (`svcpr-cf125-b150`,
`--costFloorBuffer=1.25`): **starvation 0.000**, fill 0.87, price 3.48, **employed 9.11M vs
control 1.52M (~6×)**, wage bill 2.72e8, profit 1.03e8, and it *grew* after the change
(2.99M at y167 → 9.11M at y400). The money shock in the same test **reverted** (0.157 vs 0.187
at y400) — transient. Conclusion: **lower the floor, don't inject money.**

**Early transient (all runs; real; worst in the anchor variant).** y2–3: avg starvation 0.23/0.10,
severe 0.37, `deathsStarvationPerTick` 2–3k, population −5.8% to the y4 trough then recovers.
Present in the pre-anchor control too (peak 0.13) ⇒ a seeded over-population transient — but the
anchor made it deeper.

**Artifact to ignore:** `starvationMildFraction` reads 0.5–0.8 in *every* run, because
`updateStarvationLevel` decays asymptotically (`current + (eq−current)/30`) and never reaches 0 —
denormals count as `> 0`. Judge famine by `avgGroceryStarvation`, `starvationSevereFraction`,
`starvationFatalFraction`, `deathsStarvationPerTick`. (Fix outstanding: threshold it, e.g. `> 1e-3`.)

## 5. Run inventory (`tools/longrun/results/`, gitignored)

- `fix6-fresh-s1001` — old-code baseline, rm 10000, y0–2602. The long-run famine evidence.
- `svcpr-1000y-s1001` — new-code control (service price response, brake 1.5, targets 1.2/0.86), y0–179.
- `svcpr-ctrl-b150` / `svcpr-shock-b150` / `svcpr-cf125-b150` — branched y150→400 paired tests
  (control / money shock / brake 1.25). Held the key cf125 result.
- `svcpr-on` / `svcpr-off`, `cf15-fresh-30y` / `cf125-fresh-30y` — small A/Bs of the price response.
- `svcanchor-10000y-s1001` — killed y129 (target 1.2 + naive anchor).
- `svctarget110-10000y-s1001` — killed y99 (brake 1.5 + anchor + target 1.1; the worse track).
- `svc125anchor*` — the two live runs (section 3).


## 6. Open questions / next steps

1. **Acceptance test FAILED** — see §9: 0-starvation did not hold past y210. The lever is the
   distribution channel (profit → household), not the brake/anchor.
2. **Personality A/B is null** over 320 y (§9).
3. **The anchor is contractionary** vs the storage denominator; if the famine returns, the lever is
   reverting the anchor — not raising the brake back to 1.5.
4. Unresolved: why `processedFood` fills 0; whether the famine state is "realistic".
5. Fix `starvationMildFraction` (threshold).
6. `populationMilestone.test.ts` has 2 pre-existing failures from a concurrent edit
   (`MILESTONE_STEPS_PER_MAGNITUDE = 1` vs the test's 1/10) — left untouched on purpose.

## 7. Commands

```sh
# monitor
tail -f tools/longrun/results/svc125anchor-10000y-s1001-run.log
# full analysis of runs (stability, trajectory, floor pressure, finance, services, head-to-head)
python3 tools/longrun/sessionAnalysis.py <run> [run ...]
# compare two runs column-wise at fixed years
npx tsx tools/longrun/compareSeries.ts <baseline-dir> <candidate-dir> <col> <col> ...
# fresh 10k run with the current defaults
npx tsx tools/longrun/run.ts --scenario=singleAgent --years=10000 --seed=1001 \
  --resourceMultiplier=100000 --agentsPerProduct=1 --checkpointEveryYears=50 --bands=off --out=<name>
# tests (expect only the 2 populationMilestone failures)
npx tsc --noEmit && npx vitest --run
```

## 8. Analysis of the two live runs at y112 / y42

Script: `tools/longrun/sessionAnalysis.py <run...>` (stability, oscillation, trajectory,
floor pressure, finance, service markets, head-to-head).

**Stability — yes, but only after a big early contraction.** Both runs share y0–y20: employed
4.56M → 2.2M (−52%), `meanWealth` 4.00 → 0.34, `gdpAnnual` 7.2e9 → 2.5e9 (−65%), then a slow
recovery. After y20 run1 is on a smooth path: population +0.58%/yr monotone (0 turning points),
employed ~2.2–2.4M with a slow ~60y dip-and-recover, GDP 2.5–2.8e9, starvation 0 throughout,
`priceLevelServices` +3.8%/dec, grocery price +1.9%/dec, `priceFloorHits`/`priceCeilHits` = 0.
**But household wealth decays monotonically** (4.0 → 0.14 at y40 → 0.069 and flat) and never
recovers: `wealthMonthsMean` 0.0125 (= 0.4 days of income), `populationBelowFloorFraction` = 1
(in *both* runs, from y0). Run2 is ~28y behind run1 on the same track.

**Floor pressure — yes, for every facility, 100% of months.** Across all 42 facility types:
unweighted mean spring-active share **1.000**, mean pinned share **0.98**, `baseFactor` ≈ 0.95–0.99
(always near the max cut), `netFactor` ≈ 1.000. Mean offer P/C: **15 types < 1.00, 27 in 1.00–1.25,
0 above 1.25**. The observed price is the spring's balance point, i.e. a **cost-plus rule with a
sell-through-dependent markup**, not a clearing price. (Note: `facilityMargin` blows up where
revenue ≈ 0 — e.g. run1 `textileMill` margin −1.8e14 — read `facilityProfit`, not the margin.)

**Finance — the bank is a money sink; households are outside it.** `bankEquity` (≡ `loans −
deposits`) goes +2.4M (y0) → **−22.0bn (y112)**, monotone, −1.3e8/yr, while `bankDeposits` grow
0.86bn → 23.3bn and `totalLoans` stay ~1.3–2.5bn: **loan/deposit 0.086**, equity/loans −10.6.
`policyRate` = **0.07 = `POLICY_RATE_MAX_PER_YEAR`** — the controller (target equity ratio 0, gain
0.05) saturates at its ceiling because the equity ratio is ≈ −16. `debtWriteOffs` grow 2.3e8/yr vs
`loanInterestCollected` 0.96e8/yr → the book loses ~9%/yr net. `householdDeposits` 1.2e6 of the
23.3bn (0.005%); the money sits in firm deposits (~7.5 years of revenue). `governmentDebt` = 0.
Firms: 26/42 profitable, 16/42 deep loss, 3 near-insolvent. `profitShareBonuses` = 0,
`intergenSurplus` = 0 → **no firm→household distribution channel**.

**Services — all 8 have demand, but 3 don't clear, and the non-survival ones decay to zero.**
(y78–108, run1) Grocery fill 0.93, healthcare 0.63, admin 0.74, logistics 0.53, maintenance 0.76;
**retail fill 0.017 (volume 0 in 65% of months), education volume 0 in 100% of months (demand 553),
construction fill 0.34 (volume 0 in 56%)**. The trend is monotone: grocery ×24, retail −99%,
education → 0, logistics −69%, admin −56%, construction −74%. **This is pre-existing, not caused by
the anchor/brake work**: the old baseline `fix6-fresh-s1001` has retail and education at **exactly
0 volume from ~y433 to y2602** and grocery fill only 0.49–0.52 (vs 0.92–1.00 now).

**Mechanism (the real lever).** Household service bids are rationed by a **wealth stock**, not
income: `populationDemand.ts:129–195` sets `remainingWealth = wm.mean` and spends it *per tick*
across `allServices` in priority order (grocery → healthcare → logistics → education → retail →
construction), `break`ing as soon as it is exhausted. With P90 wealth = 0.026 months of income,
a cohort spends ~everything on grocery and never reaches the lower tiers. That — not the
`serviceDemandFactor` — is what starves retail/education. (`svcpr-off` vs `svcpr-on` show the same
5-year retail volume, and the factor only *reduces* the spend, so it cannot be the cause.)


## 9. Full re-analysis at y393 / y322 — the famine is back, both runs identical

Re-ran `sessionAnalysis.py` (now with a 30y *and* a 0–120y window, plus a service-volume
trajectory). **The y200 acceptance test FAILS and the personality A/B is a null result.**

**Personality A/B = null.** At matched years the two runs are indistinguishable (y290–320:
pop 4.32e7 vs 4.66e7, starvation 0.188 vs 0.192, fill 0.592 vs 0.599, bankEquity −3.94e10 vs
−3.97e10, retail/education volume 0 in both). The narrowed variance changed nothing over 320 y.

**Population is monotone and the system is drifting, not settling.** Year-averaged: population
6.7 turning points/100y (i.e. monotone), ±1.8 % amplitude; employed 70/100y at ±5 % (≈1.4 y
period — noise); the only large oscillation is `priceLevelServices` at **±31 %** and that is an
artifact of the constructon market (see below).

**The famine returned at ~y210 and is still growing.** run1 trajectory (yearly means):

| y | pop | births/yr | deaths/yr | starv. deaths/tick | employed/pop | grocery vol/capita | fill |
|---|---|---|---|---|---|---|---|
| 0 | 9.80e6 | 2.02e5 | 1.96e5 | 0 | 0.465 | 0.00196 | 0.96 |
| 30 | 1.13e7 | 2.40e5 | 1.74e5 | 0 | 0.196 | 0.0286 | 1.00 |
| 90 | 1.60e7 | 3.40e5 | 2.48e5 | 0 | 0.136 | 0.0275 | 0.99 |
| 180 | 2.69e7 | 5.73e5 | 4.17e5 | 0 | 0.103 | 0.0247 | 0.76 |
| 210 | 3.20e7 | 6.82e5 | 4.97e5 | 1.1 | 0.095 | 0.0260 | — |
| 270 | 4.02e7 | 8.50e5 | 7.94e5 | 748 | 0.070 | 0.0212 | — |
| 330 | 4.42e7 | 9.37e5 | 9.39e5 | 1145 | 0.065 | 0.0187 | — |
| 390 | 4.60e7 | 9.80e5 | 9.13e5 | 932 | 0.068 | 0.0198 | 0.54 |

Births and deaths converge (9.1–9.8e5/yr) → a **Malthusian equilibrium** with starvation deaths
≈37 % of all deaths. Population growth decelerated 5.7 %/dec (y0–120) → 1.25 %/dec (y361–391).

**It is an entitlement failure, not scarcity.** y361–391 grocery: demand 1.50e6, **offers 6.42e6
(4.2× demand)**, 5.58e6 unsold *and* 6.6e5 unfilled, fill 0.558. Food *delivered* per capita rose
9× vs y0 (0.00196 → 0.0198) while fill fell to 0.54. The binding constraint is purchasing power:
**employed/pop fell 0.465 → 0.067** (and 0.157 of the *employable*), **all four wages pinned at
`MIN_WAGE`=1**, **the wage share of revenue is 26 % but profit is 41 % of GDP and
`profitShareBonuses`=0**, so profits accumulate as **firm deposits = 10× GDP** while households hold
**0.9 days of income** (P90 = 0.027 months) and **`populationBelowFloorFraction` = 1**.
Case in point — at y0 the same economy delivered 0.002 food/head at fill 0.96; today it delivers
0.020/head at fill 0.54.

**Floor pressure is unchanged** (y0–391): 42/42 types spring-active in 99.6 % of months, mean
`baseFac` 0.971, offer P/C buckets 8 < 1.00 / 34 in 1.00–1.25 / 0 above 1.25. New symptom of the
pinning: the ask cannot rise to clear, so the **bid side runs away** — `market_Construction_price`
has CV **0.53**, max **29.8** vs min 5.2, and that single market is what swings `priceLevelServices`
±31 %. (Retail/education also have unanchored tâtonnement prices because they never trade.)

**Finance, same pathology the worse for 300 more years.** run1 y361–391: loan/deposit **0.044**,
equity/loans **−22.0**, totalLoans/GDP 0.473, **deposits/GDP 10.9**, bankEquity −4.2e10,
write-offs 1.27e8/yr vs interest 5.7e7/yr, household deposits 0.01 % of the total, policyRate
pinned at its 0.07 ceiling. Companies are fine (net worth median 3.5e8, 29.5/42 profitable).

**Services have decayed further.** y361–391: grocery 0.558, admin 0.743, maintenance 0.746,
construction 0.589, **healthcare 0.232** (was 0.625 at y78–108), **logistics 0.273** (was 0.529),
**retail volume 0 in 100 % of months, education volume 0 in 100 % of months**. So the service
economy has contracted from "grocery + 4 partial" to "grocery + admin + maintenance + construction".

**Diagnosis.** The circular flow is broken at the firm→household step (41 % of GDP retained, no
distribution) and at the labour market (wages pinned at the floor, jobs growing 38 % while the
population grows 330 %). Demand is therefore demand-constrained by employment, employment is
constrained by demand, and the population outgrows the frozen wage bill → a rising entitlement
famine with food in abundance. The brake/anchor work only moved the *onset* (y78 → y210), not the
attractor.

## 10. Labour-requirement sweep (5 runs, started after §9)

**Goal:** raise the labour requirement per unit of throughput and see whether it creates
employment / lifts wages off the floor, or (like the anchor) is contractionary.

**Mechanism (new):** both labour constants are now **env-overridable**, because they are baked
into the facility templates when `productionFacilities.ts` is imported — a `run.ts` setter would
fire too late. Same precedent as `SIM_DEBUG`.

- `workerRequirements.ts`: `LABOUR_PER_TON_PER_TICK = envNumber('LABOUR_PER_TON_PER_TICK', 0.5)`,
  `LABOUR_PER_SERVICE_UNIT = envNumber('LABOUR_PER_SERVICE_UNIT', 0.75)`.
- `run.ts` prints both in the startup banner so each run log self-documents.
- Probe: `tools/longrun/labourProbe.ts` (per-facility ton/service labour split).

**The two axes are cleanly separable** (probe): goods facilities (mines, refineries, factories,
agriculture) are ~100 % ton-labour; service facilities are 70–100 % service-labour
(groceryChain 90 %, hospital/retail 91 %, educationCenter 93 %, adminCenter 99.8 %). The
`MINIMUM_WORKERS_PER_SCALE = 20` floor is never binding (min headcount 24.9).

**Data-driven step.** At y418 the labour demanded by all facilities was **3.53e6**, split
**50.2 % ton / 49.8 % service**, against `employable` = **1.98e7** → demand/employable = **0.178**.
So full employment needs a ×5.62 labour multiplier. One step is defined as 1/1 of that:
`step = employable/labourDemand − 1 = 4.6207` multiples of each base coefficient, i.e.
**Δton = 2.3104**, **Δsvc = 3.4656**.

| run | (steps ton, svc) | LABOUR_PER_TON | LABOUR_PER_SERVICE | labour multiplier | = % of full employment |
|---|---|---|---|---|---|
| `labour-ton1` | (1,0) | 2.810 | 0.750 | ×3.32 | 59 % |
| `labour-svc1` | (0,1) | 0.500 | 4.216 | ×3.30 | 59 % |
| `labour-both1` | (1,1) | 2.810 | 4.216 | ×5.62 | **100 % — slight overshoot** |
| `labour-ton2svc1` | (2,1) | 5.121 | 4.216 | ×7.94 | **141 % — overshoot** |
| `labour-ton1svc2` | (1,2) | 2.810 | 7.681 | ×7.92 | **141 % — overshoot** |

Control (0,0) = the killed `svc125anchor-10000y-s1001` (ton 0.5 / svc 0.75), 418 y of data.

**Launch** (all `--scenario=singleAgent --years=1000 --seed=1001 --resourceMultiplier=100000
--agentsPerProduct=1 --checkpointEveryYears=50 --bands=off`):
```sh
LABOUR_PER_TON_PER_TICK=2.81  LABOUR_PER_SERVICE_UNIT=0.75  npx tsx tools/longrun/run.ts ... --out=labour-ton1-1000y-s1001
LABOUR_PER_TON_PER_TICK=0.5   LABOUR_PER_SERVICE_UNIT=4.216 npx tsx tools/longrun/run.ts ... --out=labour-svc1-1000y-s1001
LABOUR_PER_TON_PER_TICK=2.81  LABOUR_PER_SERVICE_UNIT=4.216 npx tsx tools/longrun/run.ts ... --out=labour-both1-1000y-s1001
LABOUR_PER_TON_PER_TICK=5.121 LABOUR_PER_SERVICE_UNIT=4.216 npx tsx tools/longrun/run.ts ... --out=labour-ton2svc1-1000y-s1001
LABOUR_PER_TON_PER_TICK=2.81  LABOUR_PER_SERVICE_UNIT=7.681 npx tsx tools/longrun/run.ts ... --out=labour-ton1svc2-1000y-s1001
```
5 × ~2.5 GB, 20 cores, ~14 GB free — watched for memory.

**Watch:** `employed`, `employable`, `unemployed`, `wageNone..Tertiary` (does the floor break?),
`slotFill*`/`tightness*` (does the market tighten?), `companyWagesTotal` and the wage share,
`facilityOfferPriceOverCost_*` (a higher wage bill should push the cost floor and the pinned
price up), `avgGroceryStarvation` + `groceryFillRate` (the affordability feedback — a higher
labour share should *reduce* purchasing power), and `depreciatedValue`/`facilityScale_*` (does
scale shrink, i.e. is the whole thing contractionary like the anchor?).


## 11. Labour sweep round 2 — the ×5.62 step was lethal; recalibrated to ×1.25

**Round 1 (step ×5.62/axis) died in 1.8–2.8 y — all five.** Not starvation first: the *food chain*
breaks. Water supply → 0, `market_Water_price` 3 → 15 → 55 → 726, produce 9 → 218, grocery 4.5 →
562, then `avgGroceryStarvation` → 0.997, `deathsStarvationPerTick` → 1.5e4, `population extinct
at y2.67`. Both axes do it — a service-only ×5.62 starves the *goods* sector of workers too, so
the binding constraint is **total** labour demand. Log: `population extinct at y<year>, aborting run`.

**Boundary measured with 10-year screens** (both axes at ×m, so M = m; `screen-m*` dirs):

| M | 1.30 | 1.35 | 1.40 | **1.45** | 1.50 | 1.70 | 2.00 | 2.50 |
|---|---|---|---|---|---|---|---|---|
| outcome | survives | survives | survives | **dies** | dies | dies | dies | dies |

So the survivable ceiling is **M ≈ 1.40** — a knife edge. At M = 1.30 the labour market *does*
do what the experiment wants: `tightness` 15–19, wages 1.0 → 2.05 → 2.47 (y2–3), then the economy
recovers (y10: pop 9.28e6, fill 1.00, wages back to 1.01). At M = 1.50 `tightness` → 4.7e5 and
`workerUtilization` → 0.13 in y2, then extinction.

**Round 2 = step ×1.25 per axis** (ton 0.5/0.625/0.78125, service 0.75/0.9375/1.171875), which puts
the two 3-step configs at M ≈ 1.41 — just past the edge:

| dir | (steps) | ton | svc | M | status |
|---|---|---|---|---|---|
| `labour2-ton1` | (1,0) | 0.625 | 0.75 | 1.13 | alive |
| `labour2-svc1` | (0,1) | 0.5 | 0.9375 | 1.12 | alive |
| `labour2-both1` | (1,1) | 0.625 | 0.9375 | 1.25 | alive |
| `labour2-ton2svc1` | (2,1) | 0.78125 | 0.9375 | 1.41 | **died y2.67 → restarted at 0.70/0.9375 (M 1.33)** |
| `labour2-ton1svc2` | (1,2) | 0.625 | 1.171875 | 1.41 | alive |

**The ton axis binds, the service axis does not.** At the *same* M ≈ 1.41 the ton-biased config
died and the service-biased one survived — because the ton coefficient drives the water→produce→
grocery chain directly. So "overshoot" is asymmetric.

**Effect at y10–18 (yearly means, vs control):** employment 2.59e6 → 3.71e6 (ton1) / 3.18e6 (svc1)
/ 4.09e6 (both1) / 4.26e6 (ton1svc2), i.e. **+23 % to +65 %**; `tightnessNone` 0.37 → 16 → 2.5 → 5.6
→ 40.7; wages lift off the floor at (1,1) (1.006) and strongly at (1,2) (**2.30**). So raising the
labour requirement **does** create employment and start to break the wage floor — the opposite of
the production-anchor change. Watch `meanWealth`/`priceLevelServices`, which inflate with the wage
bill (both1 meanWealth 19 vs control 0.48; ton1svc2 139 and priceLevelServices 13.9) — the labour
shock appears to come with a monetary expansion worth understanding.


## 12. Labour sweep, full 1000 y — the lever is a **transient** employment multiplier

All five completed 1000 y, no extinction. Script: `tools/longrun/labourSweepAnalysis.py`.
Normaliser: `employed/totalPopulation` (**not** `employed/employable` — that column is the
*unoccupied* count; pop = employed + unableToWork + inEducation + employable, so the ratio
exceeds 1 and is meaningless as a rate).

**Employment share (employed / population):**

| run | y1 | y10 | y30 | y50 | y100 | y200 | y300 | y500 | y1000 |
|---|---|---|---|---|---|---|---|---|---|
| control (0,0) | .499 | .285 | .196 | .173 | .136 | .098 | **.068** | -- | -- |
| ton1 (1,0) | .494 | .396 | .272 | .235 | .190 | .132 | .120 | .0745 | **.0692** |
| svc1 (0,1) | .493 | .335 | .244 | .201 | .148 | .121 | .079 | .0684 | **.0654** |
| both1 (1,1) | .496 | .461 | .302 | .278 | .199 | .152 | .112 | .0799 | **.0760** |
| ton2svc1 (2,1) | .497 | .552 | .407 | .299 | .218 | .158 | .109 | .0853 | **.0820** |
| ton1svc2 (1,2) | .498 | .527 | .449 | .439 | .282 | .205 | .150 | .0924 | **.0886** |

**The gain is large, then it evaporates.** At y30 the employment share is +39 % to +129 % vs
control, `tightnessNone` 1.2 → 8.9–51, and the most stressed run briefly lifts wages (1.708).
By y500–1000 every run has converged back to ≈ the control's ~0.07 share; wages are pinned at
`MIN_WAGE` = 1 in *every* run at *every* sampled year from y50 onward; `tightness` → ~0.

**What persists is scale, not living standards.** At the y1000 plateau:

| run | pop (M) | employed (M) | GDP/capita | starvation | severe | fill | wealth |
|---|---|---|---|---|---|---|---|
| control (y300) | 42.9 | 2.92 | 90.0 | 0.188 | 0.369 | 0.602 | 0.071 |
| ton1 | 118.3 | 8.19 | 99.1 | 0.198 | 0.370 | 0.501 | 0.083 |
| svc1 | 57.3 | 3.74 | 84.3 | 0.210 | 0.471 | 0.525 | 0.081 |
| both1 | 80.5 | 6.11 | 103.6 | 0.201 | 0.459 | 0.533 | 0.093 |
| ton2svc1 | 76.2 | 6.25 | 111.3 | 0.203 | 0.479 | 0.512 | 0.094 |
| ton1svc2 | 98.3 | 8.71 | 112.8 | 0.205 | 0.490 | 0.533 | 0.105 |

Population ×1.3–2.8, employment ×1.3–3.0, GDP ×2–3; **GDP per capita flat (84–113 vs 90)**,
wealth flat (~0.08 = ~1 day of income), again with ~50 % of the population unemployed (the
unoccupied pool at y1000: 24–51 M).

**The famine is not solved — it is deferred and marginally worsened.** Control reaches starvation
0.188 at y300; the labour runs reach ~0.13–0.20 at y400–500. At the plateau all runs sit at
starvation ~0.20 with a *worse* severe fraction (0.37–0.49 vs 0.37) and worse grocery fill
(0.50–0.53 vs 0.60). Births ≈ deaths everywhere (Malthusian balance) with starvation at
**37 % of deaths in the control vs 47 % in ton1**.

**Also**: labour-intensive services get a permanently higher relative price
(`priceLevelServices` 3.91–5.55 vs 3.38), and the capital stock scales with the economy
(ton1 total facility scale 1.66e4 at y30 → 4.32e4 at y1000, vs control 1.36e4 → 1.76e4).

**Conclusion.** Employment *is* elastic to the labour-input parameter — the original question is
answered "yes", at least for a few centuries. But the long-run employment share, wage and living
standard are pinned by the same Malthusian/demand-side attractor as everything else in this
session; raising the labour coefficient mostly raises the economy's **carrying capacity** (it
holds 1.3–2.8× as many people at the same living standard) and delays the famine by 100–200 y.
Any labour-side intervention is a re-scaling, not a fix.


## 13. Why employment collapses from over-employed to low — it is the *capital ceiling*, not productivity or services

**Q1: is it productivity? No — productivity is flat to ±2 %.** Every efficiency series in the
1000 y ton1 run: mean 98.6–100 %, e.g. `productionEfficiency` mean 0.9922 (0.986 at y30 → 0.997 at
y1000, i.e. it *rises* 1 %), `avgWorkerEfficiency` 0.9932, `avgResourceEfficiency` 0.9990,
`avgConditionEfficiency` 1.0000, `workerUtilization` 0.9991. The low minima (0.41–0.77) are
*transient* early-crisis dips, not a trend. So output per worker is constant; the ~15 % figure is an
overestimate.

**Q2: is it starvation of the higher services? Not the driver.** The service *share* of
employment **rises** (control 0.485 → 0.560; ton1 0.393 → 0.514) — because groceryChain, a survival
service and the single biggest employer, grows. The higher services do get squeezed (scale
`retailChain` 1755 → 126 in ton1, 876 → 117 in control; `educationCenter` flat at ~40), but they are
tiny employers, so they cannot move the aggregate.

**It is the capital stock.** Employment = Σ facility scale × headcountPerScale, and `facilityCount*`
is pinned at **42** (one facility per product in the `singleAgent` scenario), so the only capacity
knob is `scale`:

| | y30 | end | ×growth |
|---|---|---|---|
| control: sum scale → employment | 1.37e4 → 2.21e6 | 1.83e4 → 3.06e6 | ×1.33 / ×1.39 |
| ton1: sum scale → employment | 1.73e4 → 3.06e6 | 4.32e4 → 8.19e6 | ×2.49 / ×2.67 |
| control population | 11.3M | 46.7M | ×4.15 |
| ton1 population | 11.3M | 118.3M | ×10.5 |

Employment tracks the capital stock almost exactly (×1.39 vs ×1.33; ×2.67 vs ×2.49); the population
runs 3–4× faster. Hence employment *per capita* collapses.

**Why the capital stock stalls: the expansion rule targets storage, not demand.**
`computeDynamicExpansionTarget` (`expansionTarget.ts:109–131`) sets the target from
`target = STORAGE_TARGET_MONTHS(6) × TICKS_PER_MONTH × maxScale × output.quantity − inventory`.
In the affordability famine the warehouses are *overflowing* — `market_Grocery_unsold` 2.5e4 (y30) →
**1.56e7** (ton1 y1000) while `unfilled` also rises 429 → 1.99e6 — so the deficit is 0, the signal is
exactly **0** (`facilitySignal_groceryChain` = 0 from y300 on), and no expansion is ordered. The key
facilities then sit at **0.95–1.00 of `maxScale`** (groceryChain 0.97, logisticsHub 1.00, hospital
0.97–1.00, maintenance 1.00, admin 1.00) and `maxScale` itself barely moves (control total
3.20e4 → 2.58e4, i.e. it *falls*; ton1 3.34e4 → 5.33e4). Per-step expansion is also capped at
`maxScale × 1.1` (`DYNAMIC_EXPANSION_CAP_FRACTION`) and by land-bound pool availability
(`findMaxScaleForLandboundResources`).

**The causal chain:** higher labour requirement → employment jumps at fixed scale (share 0.50 → 0.45
stays high) → the extra output is not bought (households destitute) → **unsold stock explodes** →
the storage-based expansion signal reads that as abundance → **capital freezes** → employment
capacity freezes → the population keeps compounding → the employment share decays back to ~0.07 and
the famine returns. The labour lever delays it by 100–200 y and raises the level, exactly as §12
found.

**Implication:** the fix is not on the labour side. Either the expansion rule must target *unfilled
demand* rather than storage, or households must have purchasing power so the unsold stock clears and
the signal turns positive again. Until then every labour/price/brake lever only re-scales the same
attractor.


## 14. The service sector is a single log function of household income per head

**Correction to §13:** the expansion rule reading *storage* is a legitimate **indirect demand proxy** —
demand drains storage — so it is not "misreading" the famine. The precise pathology is narrower:
storage is a **quantity** proxy, so it goes blind exactly when the market clears by *price sorting*
rather than by volume. With 1.56e7 unsold *and* 1.99e6 unfilled in the same grocery market, stock is
6+ ticks deep and the signal correctly says "plenty of stock" — while a sixth of demand goes unmet
because those buyers have no money. The proxy aggregates away the distribution of purchasing power.

**The bet is right, and it is stronger than a correlation.** Pooling every 10-year sample from all six
runs (535 points, 6 runs × 1000 y):

```
mean service fill = 0.157 + 0.228 · ln(wage per capita)      R² = 0.810, RMSE = 0.048
```

So "high employment" and "healthy service sector" are **not two conditions — they are one variable
seen twice.** With wages pinned at `MIN_WAGE`, the wage bill per capita is *exactly* 30 × employment
share (verified: control y100 0.136→4.082, ton1 y100 0.190→5.741, ton1svc2 y100 0.282→8.448, all
ratio 30.0). Service health is therefore a monotone function of the employment share.

**And the hierarchy is an Engel ladder in income per head** — fill crossing 0.5 / 0.9:

| service | fill 0.5 at wage/cap | fill 0.9 at wage/cap |
|---|---|---|
| Grocery | 2.06 | 3.92 |
| Construction | 1.96 | 1.97 |
| Maintenance | 2.66 | 2.03 |
| Healthcare | 3.43 | 5.18 |
| Education | 7.01 | 7.06 |
| **Retail** | **8.15** | **13.47** |

Grocery clears at 2.1, healthcare at 3.4, education at 7.0, retail at 8.2 — the higher tiers need
2–6× the income, which is why they die first (retail → education → healthcare → grocery) and why a
*fully* healthy service sector needs wage/cap ≳ 13, i.e. an employment share ≈ 0.45 at the pinned
wage.

**The seed state was exactly the state the bet describes**: at y0–5, empShare 0.45–0.53, wage/cap
14–36, with grocery/health/education fill 0.99–1.00 and logistics 0.95. It is not self-sustaining
because employment *capacity* (42 facilities × scale, capped by `maxScale` and the storage signal)
cannot grow with a population that compounds 4–10× over the run. The employment share is pushed down
through one Engel threshold after another; each tier that dies removes labour demand (services are
70–100 % service-labour), which pushes income down again — the loop runs backwards.

**So the escape condition is a floor on the employment share** (equivalently on household income per
head), and the only lever that holds it is making employment capacity grow with the population. That
is what the labour coefficient buys: a longer time above the thresholds (ton1svc2 at y50: wage/cap
13.2 and service fill 0.846 vs control 5.19 / 0.603). Everything else — brake, anchor, spring —
re-scales the same curve.


## 15. Confirmed: the world is seeded over-built and over-booked; capacity then "heals"

**The seed is at its capacity ceiling and has almost no labour slack.** At y0.08 (identical across
runs — same seed): `sum facilityScale` = **30,045** vs `sum facilityMaxScale` = **30,194** →
**scaleFrac = 0.995**. Labour demand vs the able population (employed + unoccupied + unable):

| configuration | labour demand | able adults | ratio |
|---|---|---|---|
| baseline (0.5 / 0.75) | 5.001e6 | 5.868e6 | **0.852** |
| labour2 step (0.625 / 0.75) | 5.802e6 | 5.868e6 | 0.989 |
| labour2 step (0.625 / 1.172) | 6.814e6 | 5.868e6 | **1.161** |
| **round-1 step (2.81 / 0.75)** | **1.979e7** | 5.868e6 | **3.373** |

So the baseline seed needs 85 % of *every able adult* — including the 1.24 M who are
`unableToWork`. Even the baseline cannot staff it: y0 `workerUtilization` 0.901,
`productionEfficiency` **0.839** (10 % of posts vacant, 16 % of output lost) in the control;
0.791/0.752 in ton1. The round-1 sweep was **over-booked 3.37× — "thrice"** — giving
`workerUtilization` 0.148–0.228 and `productionEfficiency` **0.138–0.247** at y0: output at a
quarter, the water→produce→grocery chain fails, extinction. The measured 10-year survival boundary
(M ≤ 1.40 survives / M ≥ 1.45 dies) is exactly this over-booking boundary (ratio ≈ 1.19–1.24).

**The capacity then heals — it melts ~50 % and re-grows from the lower base.**

| y | control scale | scaleFrac | workerUtil | prodEff | ton1 scale | scaleFrac |
|---|---|---|---|---|---|---|
| 0 | 3.005e4 | 0.995 | 0.901 | 0.839 | 3.004e4 | 0.995 |
| 5 | 2.565e4 | 0.759 | 0.997 | 0.996 | 2.408e4 | 0.739 |
| 10 | 1.744e4 | 0.507 | 1.000 | 0.999 | 1.987e4 | 0.570 |
| 20 | **1.362e4** | 0.407 | 1.000 | 0.999 | 1.983e4 | 0.580 |
| 30 | 1.364e4 | 0.425 | 1.000 | 0.990 | **1.658e4** | 0.496 |
| 100 | 1.420e4 | 0.590 | 1.000 | 0.990 | 1.795e4 | 0.593 |
| 1000 | (ended y418) | | | | 4.317e4 | 0.810 |

Control: 30,045 → **13,620 (−55 %)** by y20. ton1: 30,045 → 16,580 (−45 %) by y30. As it heals,
`workerUtilization` → 1.000 and `productionEfficiency` → 0.99–1.00. The **sustainable scale is
14–17 k, so the seed is ~2× over-built.** `maxScale` itself barely moves (30.2 k → 32.1 k control,
30.2 k → 33.4 k ton1) — the ceiling stays, the *utilisation* collapses, then re-grows (ton1
scaleFrac 0.496 at y30 → 0.810 at y1000).

**And after healing, employment is much lower and does not recover the seeded level.** Control
employed 4.556e6 (y0) → 2.209e6 (y30) → 2.924e6 (y300): the sustainable level is **48–64 % of the
seed**. Crucially it does not need the services to be failing — at y10–20 the labour runs have
grocery/health/logistics fill 0.85–1.00, `workerUtilization` = 1.000, and employment *still* falls
(empShare 0.396 → 0.329 → 0.272). A healthy service sector does not sustain high employment; both
are downstream of a capital stock that is melting, then re-growing slower than the population.

**Conclusion.** The "high employment + healthy service sector" state is a **property of the over-built
seed**, not an equilibrium — the seed can only be staffed if essentially every able adult works, so
it has no slack to give and any labour-side increase over-books it immediately. The labour lever is
therefore nearly unusable *from the seeded state*; it would only be informative in a world seeded
under-built (or after the heal, where scaleFrac is 0.4–0.6 and slack exists again).


## 16. Seed-scale experiment (REFUTED) + the famine as one inequality + where to hook "don't starve"

**New knob:** `--seedScaleFactor=<f>` (world config `seedScaleFactor`, multiplies the base scale in
`world.ts:computeTargets`, both the solver and the per-billion branch). `tsc`/prettier clean.

**"Reduce initial scale → higher labour may be survivable" — tested and refuted.** Round-1 ×5.62
labour (ton 2.81 / svc 4.216) at seed scales 1.0 / 0.5 / 0.33 / 0.25 / 0.20 / 0.17 / 0.15 — **all
eight went extinct at y1.83–2.67**, while `seedScaleFactor=0.25` with *baseline* labour survives to
y19. Diagnostics at y0.08:

| seedScale | sum scale | labour demand ratio (×5.62) | workerUtil | prodEff | outcome |
|---|---|---|---|---|---|
| 1.00 | 30,110 | 4.807 | 0.148 | 0.138 | extinct y1.83 |
| 0.50 | 15,028 | 2.397 | 0.297 | 0.290 | extinct y2.67 |
| 0.33 | 9,916 | 1.581 | 0.450 | 0.442 | extinct y2.58 |
| 0.25 | 7,513 | 1.198 | 0.592 | 0.589 | extinct y1.83 |
| 0.20 | ~6,022 | ~0.96 | — | — | extinct y2.08 |
| 0.15 | 4,508 | 0.721 | 0.942 | — | extinct y2.08 |

At 0.15 the labour ratio is **0.72 — ample slack** — and it still dies. The killer has moved to the
**water/produce chain**: water supply 2.57e5 vs demand 2.4e5 with erratic volume
(600 → 8.9e4), produce volume **0** with demand *below* supply. The same capital both feeds the
population and employs it, so **you cannot buy labour slack by shrinking the seed — you trade one
failure for the other.** Note also the empirical survival boundary is a labour-demand ratio ≲ 1.2,
and the baseline seed already sits at 0.855: the seeded world is by design almost fully employed.

**The famine is one inequality.** Pooling all six 1000-y runs: `groceryFill ≈ empShare × wage × 30 /
groceryPrice`. At the plateau predicted 0.494–0.514 vs actual 0.501–0.533 — essentially exact.

```
income per head / month = empShare × wage × 30   = 0.066 × 30   = 1.98
food cost per head / month = price × need        = 3.9 × 1.0    = 3.9
ratio = 0.51  =  the observed grocery fill (0.53)
```

So **coverage = employment share × (wage / food price)**. One wage-earner's 30/month feeds 7.7
people; 7 % employment ⇒ 54 % fed. Starvation ⟺ `empShare × wage / price < 1`, i.e. with the wage
pinned at `MIN_WAGE` = 1 and food at ~3.9, **you need empShare ≥ ~13 %** — the economy sits at 6.6 %.
Food is *first* in the household priority order (`populationDemand.ts` loops `allServices` as
grocery → healthcare → logistics → education → retail → construction and `break`s when the budget is
gone), so the other services are bought at nil *because* the food attempt consumes the budget — a
consequence, not a cause.

**Where to hook "labour scarcity shouldn't starve people"** (three independent places):

1. **Allocation priority** — `src/simulation/workforce/automaticWorkerAllocation.ts` has *no* survival
   priority: each company targets `totalUsed + ownUnfilled`, so food competes for scarce labour on
   equal terms with luxury. This is the most likely single fix for the over-booking collapse.
2. **Bid-side rationing** — `src/simulation/market/populationDemand.ts:170–172`, the clamp
   `willingPrice = remainingWealth / rate / 1.2`, is literally where the poor get outbid for food.
   The survival tier is already flagged (`SERVICE_TIERS`, `serviceDefinitions.ts:301–307`,
   `mandatoryForOwnConsumption: true`) — exempting it from the wealth clamp (bid at
   `referencePrice` regardless) is the direct "must-buy" hook.
3. **Funding** — whatever the exempted bid spends must be financed; the existing channels are
   `intergenerationalTransfers.ts` and `governmentSupportVolume` (the demand-shock path).

Cheaper alternatives that attack the same inequality: raise `MIN_WAGE` (raises coverage directly),
lower the food price (already spring-pinned to cost), or keep the employment share up (the labour
lever — which only buys ~150 y).


## 17. The (seed scale × labour requirement) map — overseeding raises employment AND wages

16-cell grid, 10 y each, `--seedScaleFactor` × M (M applied equally to both labour axes):
ton = 0.5·M, svc = 0.75·M. Employment share at y10 (and wage = `wageNone`):

| seed \\ M | 1.00 | 1.25 | 1.50 | 2.00 |
|---|---|---|---|---|
| **0.50** | emp .180 w1.00 | emp .279 w1.00 | emp .297 w1.00 | **DEAD y3.75** |
| **1.00** | emp .284 w1.00 | emp .470 **w1.14** | **DEAD y2.92** | **DEAD y2.67** |
| **1.50** | emp **.534** **w1.16** | emp **.524** **w2.20** | **DEAD y3.58** | **DEAD y3.25** |
| **2.00** | emp **.543** **w2.71** | **DEAD y3.00** | **DEAD y3.00** | **DEAD y3.00** |

All survivors have grocery fill 1.00 and ~zero starvation at y10. **The user's hypothesis is
confirmed**: over-seeding the initial capital raises employment *and* wages, and the strongest cell
(seed 2.0, M 1.0) nearly doubles the employment share (.284 → .543) and breaks the wage floor 2.7×
(1.00 → 2.71) **without touching the worker requirement at all**. M buys employment at a lower wage
(seed 1.5: M 1.0 → .534/w1.16; M 1.25 → .524/w2.20); seed scale buys both.

**Boundary mechanism = the water facility.** The failures are not general starvation-by-capacity:
in every dead cell the *water* supply collapses while its demand rises —

- `s1.00-m1.50` (dead): water supply 1.71e6 → 6.1e5 → 5.8e5 → 4.1e5 → 2.0e5 → 6.8e4 → 0, demand
  climbing to 1.55e6; grocery supply follows 2.16e6 → 2.4e5 → 2.0e5 → 5e4 → 0.
- `s2.00-m1.25` (dead): water supply 3.42e6 → 2.5e5 → 5.6e5 → 2.7e5 → 0, demand **tripling**
  1.17e6 → 3.3e6.
- `s1.50-m1.00` (alive): water dips 2.57e6 → 7.7e5 but recovers to 3.5e6 and holds.

`waterFacility` has the largest labour per unit of any facility (300 ton-units → 843 headcount/scale
at the baseline coefficient), so it is the **most exposed link**: when the labour pool is over-booked
it is the first to lose staffing, and its collapse takes the whole food chain with it. This is why
the boundary is not a clean function of either the labour-demand ratio or the food output alone —
it depends on whether the *water* facility keeps enough absolute staffing, which needs seed scale and
M to stay low enough jointly (empirically the surviving corner is M ≤ 1.25 for seed ≥ 1, M ≤ 1.5 for
seed ≤ 0.5).

**Consequence for the goal.** Since 3.1 (allocation priority), 3.2 (bid-side rationing) and 3.3
(funding) are all rejected or insufficient, and the famine reduces to
`coverage = empShare × wage / foodPrice`, the map says: **over-seed to raise both empShare and wage**,
and keep M low (M is what kills the water link). The 200-y persistence runs for the best cells are
`map2-s200-m100`, `map2-s150-m100`, `map2-s150-m125`, `map2-s300-m100`, `map2-s400-m100`.


## 18. 200-y persistence: over-seeding ALONE dissipates, over-seeding + M is durable

Ran the best cells to 200 y (`map2-*`). **Employment share / wage / starvation:**

| run | y5 | y10 | y20 | y50 | y100 | y150 | y200 |
|---|---|---|---|---|---|---|---|
| baseline seed1.0 M1.0 emp | .455 | .285 | .212 | .173 | .136 | .114 | **.098** |
| wage | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| **s1.5-M1.0** emp | .533 | .540 | .321 | .277 | .194 | .165 | **.138** |
| wage | 2.49 | 1.09 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| **s2.0-M1.0** emp | .530 | .556 | .371 | .296 | .296 | .227 | **.181** |
| wage | 4.24 | 2.48 | **1.00** | 1.00 | 1.00 | 1.00 | 1.00 |
| **s1.5-M1.25** emp | .507 | .533 | .544 | **.550** | **.539** | **.541** | .373 |
| wage | 4.85 | 2.12 | 2.23 | 1.79 | 2.21 | 1.94 | 1.00 |

**The user was right about over-seeding alone.** `s2.0-M1.0` heals completely: `workerUtilization`
0.516 → **1.000** by y20, wage 4.24 → **1.00**, tightness → 3.9, `scaleFrac` 0.919 → **0.382** (the
excess capacity is shed), and the employment share decays to .181 by y200 — only marginally above the
baseline .098. Over-seeding per se has no lasting influence. Same for `s1.5-M1.0` (.138).

**But the combination is durable.** `s1.5-M1.25` does *not* heal: `workerUtilization` stays 0.54–0.69,
tightness 34–692, wage 1.79–2.23 and employment share ~0.54 **for 150 years**, with the capital
*growing* (`sumScale` 2.74e4 → 7.47e4, `sumMaxScale` 4.79e4 → 1.06e5) instead of contracting.
Mechanism: M keeps the market tight, so the wage stays above the floor, so household purchasing power
stays high, so demand keeps the capacity in use. Remove M and the market clears (`workerUtil` → 1.0),
the wage falls to the floor, and the whole thing decays as the population compounds. So **the
labour requirement is what makes over-seeded capacity labour-*using* rather than idle-then-shed.**
(It collapses at ~y180.)

**`maxScale` does NOT contract** — the user's premise is inverted: `s2.0-M1.0` `sumMaxScale`
6.04e4 → 5.78e4 (flat) and `s1.5-M1.25` 4.53e4 → 1.06e5 (*grows*). Only the *scale* (utilisation)
contracts. So seeded capacity is never discarded; recovery is always via utilisation.

**Water / wage-bidding: the mechanism works and is fast, but it is not the binding constraint.**
In the dead `s1.00-m1.50` cell: wage 1.03 → 1.12 → 1.24 → 1.34 → 1.43 → 1.53 → 1.64 → 1.72 → 1.92 →
2.12 → 2.33 → 2.64, `wageShortagePressure` 0 → 0.13 → 0.35 → 0.67 → 0.98, `wageQuitRate` 0 → 0.17.
So water's scarcity *does* pull the wage up 2.6× within 2.5 y — but `workerUtilization` still falls
(0.595 → 0.683 → 0.349 → 0.006) and water supply goes 1.71e6 → 2.2e5 → 0. **What blocks it is
`wageCeiling`, the company's ability to pay: it is 0.000 at y0 in the over-built cells** (the whole
capital stock's wage bill exceeds revenue), rising only to 0.144/0.394/0.694 as the population dies.
The firms are already paying *above* their ceiling (loss-making) at the floor wage.
Confirms the user's financial-collapse story: over-building is punished through the wage bill, not
through prices.

**What does not happen: re-orientation.** In the over-built worlds every facility scales down
together (`scaleFrac` falls uniformly) — there is no mechanism by which the survival chains keep
their workers while the luxury chains collapse, which is exactly what the user wants. The absence of
that mechanism is the gap to work on next (and it is a *market* mechanism — prices/profits — not a
global allocator, so it can stay agent-independent).


## 19. The market signal is clear and DOES re-orient — two amplifiers are broken

**The re-orientation happens.** ton1 over 1000 y: groceryChain scale 1,121 → 12,790 (×11.4), waterFacility
514 → 2,261 (×4.4), agriculturalFacility 352 → 3,076 (×8.7) — while retailChain 1,755 → 126 (×0.07)
and educationCenter stays flat (~40). `facilitySignal_retailChain` is **negative** (−0.1396 at y300)
and retail correctly contracts. So the survival chains *do* survive and the rest *do* collapse, exactly
as wanted. The quantity signal works.

**But the price leg is destroyed.** Realised sales differ 100 %-vs-0 %, yet:

| y | grocVolume | retailVolume | grocSellFactor | retailSellFactor | grocNetFactor | retailNetFactor |
|---|---|---|---|---|---|---|
| 300 | 1.415e6 | 0 | 0.9794 | 0.9272 | 0.9998 | 0.9934 |
| 1000 | 1.996e6 | 0 | 0.9784 | 0.9274 | 0.9999 | 0.9682 |

The sell-through factor spans only 0.978 vs 0.927 (both sit near the max cut because
`TARGET_SELL_THROUGH` = 1.1 and *both* under-sell against it), and the cost spring then cancels it:
`netFactor` ≈ **1.000** for grocery and 0.968–0.994 for retail. So a total collapse of demand produces
a ~0–3 % price move. Grocery cannot raise its price to outbid retail for labour; retail cannot cut its
price to clear. The price signal — and with it any wage-bidding difference — is flat.

**And the investment leg reads the wrong quantity.** `facilitySignal_groceryChain` = **0 from y200
onward** while grocery has 2.0e6 unfilled demand and its warehouse overflows (unsold 8.7e6 → 1.56e7),
because `computeDynamicExpansionTarget` targets storage, not sales. The chain with the strongest
realised demand is the one that gets no expansion signal. (Its `maxScale` still grew via the other
paths — 2,078 → 13,230 — but `scaleFrac` sits at 0.97, i.e. capacity is used up as fast as it is
built.)

**And the aggregate rate is the binding constraint.** Over the same 1000 y the population grows ×10.5
while the survival chains grow ×4–11 and *total* employment grows only ×2.7 (3.06e6 → 8.19e6). So even
a perfect reallocation of existing capacity cannot hold the employment share up: capacity must grow at
the population's rate, and its growth is capped by `DYNAMIC_EXPANSION_CAP_FRACTION` = 0.1 per step and
`MAX_SCALE_EXPAND_FRACTION` = 0.025, triggered off storage.

**Conclusion — the two amplifiers to fix (both market mechanisms, no global allocator needed):**
1. **Let price carry scarcity.** Widen the sell-through span / lower `TARGET_SELL_THROUGH` so a 0 %
   vs 100 % sales difference actually moves the price, and stop the cost spring cancelling the whole
   signal for selling facilities. Then grocery can bid above retail for labour by itself.
2. **Make the expansion trigger read realised sales / unfilled demand, not only storage.** Then the
   chain people actually buy is the one that expands, at a rate able to track the population.


## 20. Deep look at the services-side scale control — the asymmetry is the trigger, and it's threshold-based

**The two scale signals are not the same shape.**

- **Products** (`signalComputation.ts:computeFacilityStorageSignal`):
  `error = softClip((min(STORAGE_TARGET_MONTHS·30·maxScale·qty, reachable) − (inventory + horizon·trend)) / zoom)`
  with `zoom = STORAGE_ERROR_ZOOM_MONTHS·30·maxScale·qty` and
  `trend = −sold − depreciated − consumed + produced`. Trigger: a **stock target of 6 months**, and the
  trend carries sales/production/decay. Sensitive and scale-relative.
- **Services** (`serviceFlow.ts:serviceFlowError`):
  `error = min(1, unfilledEMA / 0.25) − decayShare`, with an extra penalty
  `− (decayShare − 0.3)/0.7` whenever `decayShare > SERVICE_FLOW_DECAY_TARGET = 0.3`.
  Trigger: **unfilled demand ≥ 25 % of own demand**. No stock target at all.

So a *product* facility expands when its stock dips below 6 months of production, while a *service*
facility only expands once a **quarter of its demand is going unmet**. The service trigger is far less
sensitive — that is the asymmetry.

**Consequence 1 — in the healthy 200-y run the whole scale-control is INERT, not tracking.** All
signals ≈ 0 and `scaleFrac` sits wherever demand left it (y199):

| facility | scaleFrac | signal | unfilledFrac |
|---|---|---|---|
| groceryChain | 0.769 | +0.003 | 0.002 |
| waterFacility | 0.449 | +0.012 | 0.001 |
| foodProcessor | 0.616 | −0.008 | — |
| logisticsHub | 0.374 | −0.008 | — |
| hospital | 0.591 | +0.000 | 0.001 |
| retailChain | 0.751 | 0.000 | 0.126 |
| educationCenter | 0.842 | +0.003 | — |

unfilled ≈ 0 everywhere, so `error ≈ −decayShare ≈ 0` and nothing expands. 23 % of grocery capacity is
idle and nothing brings it in. **Caveat to the "scale control works fine" reading: it is neutral, not
correcting.** Also, retail did *not* drop to the floor here — it grew (2,990 → 7,086) because the run
is healthy.

**Consequence 2 — in the famine run the decay share cancels the expansion demand.** ton1 at y1000:
unfilled/demand = 2.0e6/4.0e6 = 0.50 → `unfilledNorm` saturates at **1.0**, yet the measured
`facilitySignal_groceryChain` = **0.0000**. Solving `1 − d − (d−0.3)/0.7 = 0` gives **decayShare ≈ 0.59**
— versus 0.004–0.09 in the healthy run. So the two terms cancel almost exactly: *the chain with half
its demand unmet gets a zero expansion signal.* And note the perverse direction — `decayShare =
decayed/produced` **rises as production falls**, so the penalty grows exactly when the facility should
expand.

**Consequence 3 — the reallocation is orders of magnitude too slow to save the dying configs.**
`MAX_SCALE_CONTRACT_FRACTION` = 0.01 (≤1 % of maxScale per contraction step) gated on a
`contractionIntegral` that must exceed `CONTRACTION_INTEGRAL_THRESHOLD` = 30 and decays 0.05/tick.
Empirically retail sheds 93 % over ~centuries (ton1: 1,755 → 951 → 436 → 125 at y30/100/300/1000),
because the signal is 0 at most samples — the contraction fires only intermittently. The dying cells
extinct in **2–3 years**. So the user's "too slow" hypothesis is confirmed, though the lag is
years-to-decades rather than 3 months.

**On the cost spring:** agreed that it is what stabilises over-production (all 42 pinned, `netFactor`
≈ 1.000). Its cost is exactly the other side of that trade: it also cancels the *scarcity* signal
(grocery `netFactor` 1.000 vs retail 0.97 for a 100 %-vs-0 % sales difference), which is why the price
leg cannot drive reallocation. Deliberate trade-off, not a bug.

**Candidates to change:** (a) give services a *stock/backlog* trigger like products instead of the
25 %-unfilled threshold; (b) stop subtracting `decayShare` (or cap it) so a starved service isn't
penalised by its own low production; (c) raise `SERVICE_FLOW_DECAY_TARGET` (0.3) toward the observed
steady-state decay share; (d) speed up contraction (`MAX_SCALE_CONTRACT_FRACTION`) so a dying economy
sheds the doomed chains within a few years.


## 21. Correction: it is NOT a production issue (and was not one)

Conceded. The "food chain stops growing" observation in §19–§20 does **not** explain the famine, and I
conflated two separate things. Decisive evidence at ton1 y1000:

- Offers (supply) **1.76e7** vs demand 3.98e6 — supply is **4.4× demand**, with **1.56e7 unsold**.
- Capacity is fully deployed: grocery `scaleFrac` = **0.967**. `maxScale` is not the constraint.
- **And even at zero markup the food is unaffordable.** price 4.206, `offerP/C` 1.149 → cost floor
  **3.662** (alternative cost measure from `facilityMargin` 0.419: 2.446). Household income per head per
  month = `empShare × wage × 30` = 0.0692 × 1 × 30 = **2.076**:

| sold at | cost per head/month | coverage |
|---|---|---|
| market price 4.206 | 4.206 | **0.494** (matches the measured fill .501) |
| production cost 3.662 | 3.662 | **0.567** |
| margin-implied cost 2.446 | 2.446 | 0.849 |

So **the famine survives the removal of the entire pricing mechanism** — the spring, the markup and the
sell-through span are all irrelevant to it. The population's income is below the cost of its own food
basket. It is an **income/distribution** condition, not output, not capacity, not the scale control.

**So the §20 "signal = 0" finding is a separate (and arguably correct) matter**: with 1.56e7 unsold,
refusing to expand the food chain further is the *right* decision — building more would be waste. It
affects the growth of *labour demand*, not the famine.

**And the counterfactual is already in hand** — `s1.5-M1.25` at y199: `empShare` 0.373, wage 1.000 →
income per head **11.187**/month against a food cost of 4.268 → **coverage 2.62** and starvation
measured at **0**. Same food, same prices, same scale control; only the employment share differs.

**Therefore the whole chain of §13–§20 resolves to one variable.** Output, capacity, the cost spring
and the storage/service signals do not cause the famine; `income per head = empShare × wage` does, and
with wages pinned at `MIN_WAGE` that is `empShare` alone. The labour map's winning cell
(seed 1.5 × M 1.25) is the only configuration examined that holds `empShare` above the required floor
(~0.13 at price 4.2, ~0.57 if you sold food at cost) for a century and a half.


## 22. Literature: we have a *low-level equilibrium trap*, and the standard escape needs a wage-led loop

**Concession on §20/§21 framing.** Targeting storage for a decaying service and targeting its decay
rate *are* the same constraint (steady state `P = C + δ·S` ⇒ `decayShare = decayed/produced = 1 − C/P`
and `S = decayShare·P/δ`; with `SERVICE_DEPRECIATION_RATE_PER_TICK = 0.1` the two are linked by
**stock-in-ticks = 10 × decayTarget**, feasible range 0–10 ticks). My "must be replaced, not retuned"
survives only as a *range* limitation: the decay-share form cannot express a stock target above 10
ticks, so a month-sized target is unrepresentable. Conceptually: same knob. And the user's objection
is right — a `maxScale`-anchored stock target is not satisfied by "hold some stock"; it forces
`P ≥ δ·S_target` regardless of demand, i.e. it pushes utilisation to capacity and makes `maxScale` the
variable. That is exactly the product-side design.

**What the literature says we have.**

| source | what it says | our measurement |
|---|---|---|
| **Nelson (1956), low-level equilibrium trap** (cited on the Big Push page) | per-capita income is held at subsistence because population growth absorbs any gain; escape needs a **critical minimum effort** | empShare 0.069, population compounding, food cost/head 3.66–4.21 vs wage income/head 2.08 |
| **Rosenstein-Rodan (1943); Murphy-Shleifer-Vishny (1989), big push** | multiple equilibria from demand externalities + indivisibilities; escape needs a **discontinuous, coordinated push of a minimum size**, not a marginal nudge | our 16-cell map is discontinuous — cells either hold high employment or die; no gradual path |
| **Cooper-John; New Keynesian coordination failure** | strategic complementarity + demand externality ⇒ multiple equilibria; the low one is an *underemployment* equilibrium and a policy device can move it | the worker-requirement M *is* such a device — it raises the externality until the high state self-sustains (1.5×1.25 → 0.54 for 150 y) |
| **Bistability (control theory)** | two stable states require **positive feedback** plus a **barrier**; the transition needs activation energy | the high state exists but is not self-supporting without both axes |
| **Hysteresis / path dependence** | the system stays low after the shock, and restoring it needs a *larger* push than caused the fall | collapse in 2–3 y, irreversible; the good cell needed both axes from t=0 |
| **Unified growth theory (Galor)** | the Malthusian trap ended only with the **demographic transition** — fertility falling, human capital rising (quality-quantity trade-off) | the model has **no** fertility response to income/education, so the population absorbs every gain — the missing stabiliser-breaker |
| **Labour share / wage-led vs profit-led (Bhaduri-Marglin)** | with markup pricing, a higher wage share raises demand **only if demand is wage-led**; degree of cost pass-through decides | wages are 26 % of revenue while profit is **41 % of GDP** and `profitShareBonuses` = **0** — profit-led, and the profit share leaks out of the household sector |

**Diagnosis: why there is only one attractor.** The loop that *should* create the second equilibrium —
`empShare → income → demand → investment → capacity → labour demand → empShare` — is **neutralised by
cost pass-through**: a wage/employment gain raises costs, the cost spring passes it into the price, and
`coverage = empShare × wage / price` is unchanged. A neutral loop has no self-reinforcing force, so the
only attractor left is the Malthusian one driven by the population. **The second equilibrium requires
making that loop positive — i.e. moving from profit-led to wage-led.**

**Escape levers, in order of expected leverage:**
1. **Break the cost pass-through** (markup as a residual / profit-squeeze rather than a fixed multiple
   of costs) so a wage gain raises real income instead of the price. This is the answer to "how do we
   raise the average wage", and it converts the neutral loop into a positive one.
2. **Distribute profits** — `profitShareBonuses` = 0 with a 41 %-of-GDP profit share; turning it on is
   literally the labour-share lever, and it is currently switched off.
3. **Close the Malthusian stabiliser** — add a fertility response to income/education (Galor).
4. **Push with both axes together at the minimum indivisible size** — one axis alone relaxes back
   (hysteresis).
5. **Service scale anchor** (§20) — adds to the demand externality by raising service labour demand.


## 23. Pass-through measured, and the fair-wage lever tested: it is a NO-OP

**The pass-through elasticity, measured.** Within-run OLS of `ln(grocery price)` on `ln(wage)`:

| run | d ln(price)/d ln(wage) | R² | n |
|---|---|---|---|
| s1.5-M1.25 (wage 1.00–5.20) | **+0.932** | 0.842 | 201 |
| s2.0-M1.0 (wage 1.00–4.62) | **+1.056** | 0.799 | 201 |
| ton1 (wage 1.00–2.01) | **+1.264** | 0.488 | 1001 |

So the price absorbs roughly **0.93–1.26 of any wage increase** — the pass-through is large, which is the substance of the claim. But the loop as a whole is **not dead**: `d ln(coverage)/d ln(empShare)` = **+1.06 to +1.37** (R² up to 0.98). The wage channel is near-neutral; the **employment channel carries the loop**. So the correct statement is: *wage-only* levers are neutralised, employment levers are not.

**The decisive test (50 y, baseline seed 1.0 × M 1.0; y12 means).** `MIN_WAGE` and `WAGE_SHARE` now have env overrides (`MIN_WAGE`, `WAGE_SHARE` in `constants.ts`).

| variant | wage | grocery price | empShare | coverage | fill |
|---|---|---|---|---|---|
| ref (mw 1.0, ws 0.6) | 1.000 | 3.255 | 0.259 | **2.389** | 0.999 |
| MIN_WAGE 1.5 | **1.500** | **4.596** | 0.279 | 2.733 | 0.999 |
| MIN_WAGE 2.0 | **2.000** | **5.902** | 0.267 | 2.717 | 0.999 |
| WAGE_SHARE 0.8 | **1.000** | 3.247 | 0.267 | 2.468 | 0.999 |
| WAGE_SHARE 1.0 | **1.000** | 3.206 | 0.266 | 2.491 | 0.999 |

Three findings:

1. **MIN_WAGE is real but near-neutral and saturating.** +50 % nominal wage → +41 % price → **+14 % coverage**; +100 % wage → +81 % price → **+14 % coverage** (no further gain). The measured pass-through is ≈0.81 per unit.
2. **WAGE_SHARE is a NO-OP**: the wage does not move at all (stays exactly 1.000). Mechanism: `fairWage = WAGE_SHARE × _smoothedWageCeiling` (`workforceDemographicTick.ts:64`), the quit term is `QUIT_FAIRNESS_SENSITIVITY(0.005) × fairnessGap`, the wage step is `churnPressure`-driven, **and it is then capped by `capAtAffordability(wage, ceiling)`**. With the observed wage pinned at MIN_WAGE the ceiling is ≈1.0, so `WAGE_SHARE × ceiling ≤ MIN_WAGE` and the fairness signal can never lift the wage. **The binding parameter is the affordable ceiling — `(revenue − purchases − claimPayments)/workerTicks` — not the fairness sensitivity.** Strengthening the fair-wage/quit term cannot help while the firms can barely afford the floor.
3. **The good cell (1.5 × 1.25) has a higher ceiling** so WAGE_SHARE does bite there: y12 wage 2.354 → 2.539 (+8 %) and coverage 5.187 → 5.762 (+11 %). And `MIN_WAGE 2.0` **killed** the good cell at y3 (the wage starts at MIN_WAGE, so a 2× floor with M 1.25 means a 2× initial wage bill → immediate insolvency).

**So the ranking of levers by measured coverage effect:** employment share (seed × M) **+117 %** (2.389 → 5.19) ≫ MIN_WAGE **+14 %** > WAGE_SHARE **0 % at the floor, +11 % once the ceiling is high**. The road to a higher wage is therefore *through* employment and the firms' affordable surplus, not through the wage-setting rules.


## 24. The fairness channel IS the lever — my "no-op" and "pass-through ≈1" were both wrong

**Conceded: over-building decays** (§18 — `s2.0-M1.0` heals completely, wage → 1.00 by y20), so it is
not a durable lever. Agreed, not counter-productive to abandon.

**Conceded: the fair-wage channel is NOT a no-op — I varied the wrong parameter.** In §23 I changed
`WAGE_SHARE` (the fair-wage *target*); the live knob is `QUIT_FAIRNESS_SENSITIVITY` (how strongly
quits respond to the gap). The mechanism, verbatim:

```ts
QUIT_RATE_CAP = 0.002;                                     // laborMarket.ts
quitPropensity = clamp( QUIT_OUTSIDE_SENSITIVITY(0.05)·exitGap
                      + QUIT_FAIRNESS_SENSITIVITY(0.005)·fairnessGap , 0, 0.002)
fairWage       = WAGE_SHARE · _smoothedWageCeiling          // workforceDemographicTick.ts:64
churnPressure  = WAGE_CHURN_GAIN(3) · (quitRate − QUIT_TARGET_RATE(0.009))
```

The fairness term contributes at most `0.005 × gap` while the outside-option term is ≈ **−0.05**
(`outsideIncome ≈ 0` when there are no vacancies, so `exitGap = −1`). **A 10× deficit**, and the
`max(0, ·)` floor then kills the propensity entirely — which is exactly why `wageQuitRate` = 0 and the
wage sits on the floor. Your diagnosis was right; mine was not.

**The test** (baseline seed 1.0 × M 1.0, `QUIT_FAIRNESS_SENSITIVITY` overridden, y12–15):

| qf | ws | wage | price | coverage | empShare | agg. profit/month |
|---|---|---|---|---|---|---|
| 0.005 (ref) | 0.60 | 1.000 | 3.256 | **2.39** | 0.259 | **+1.38e8** |
| 0.005 | 1.00 | 1.000 | 3.206 | 2.49 | 0.266 | — |
| 0.05 | 1.00 | 1.000 | 3.245 | 2.65 | — | — |
| **0.20** | **0.60** | **1.971** | **3.665** | **6.22** | 0.385 | **−2.40e8** |
| **1.00** | **0.60** | 1.186 | 3.849 | **3.66** | 0.395 | **−1.79e8** |
| **0.20** | **1.00** | **4.804** | **6.060** | **8.47** | 0.356 | +2.1e6 |

Three results:

1. **The channel activates between qf 0.05 and qf 0.20** (quitRate 0 → 0.024) and the wage moves
   1.00 → 1.97 → 4.80. Confirmed: make the fairness term dominate the outside-option term and the wage
   moves, hard.
2. **The pass-through is NOT ≈1.** With `ws 0.6`, `qf 0.20`: wage **+97 %** while the price **−6 %**
   (3.256 → 3.665 at y15 *after* falling first). So the §23 "pass-through ≈0.93–1.06" was almost
   certainly a **common-cause correlation** (tightness driving both the wage and the price
   simultaneously), not a causal pass-through. The causal pass-through when the wage rises via the
   fairness channel is small.
3. **The consequence is large and real: coverage 2.39 → 3.66–8.47**, i.e. **the affordability famine is
   eliminated**, at the baseline seed and M — with no over-building.

**The caveat that must be chased next:** with `ws 0.6` the wage rise is funded out of the profit margin
and **aggregate profit goes negative** (+1.38e8 → −2.40e8/month). With `ws 1.0` the wage is partly
passed on (price 3.90 → 6.06) and aggregate profit stays ≈ 0. So one variant pays for a high real wage
by decapitalising the firm sector, the other by a higher price level. Both raise coverage; which is
sustainable over centuries is the open question — the runs are only at y14–15
(`wage-qf20ws06`, `wage-qf100ws06`, `wage-qf05ws10`, `wage-qf20ws10`, `wage-qf100ws10`).


## 25. QUIT_FAIRNESS_SENSITIVITY saturates above ≈0.2 — the dial is WAGE_SHARE

Four runs launched, `WAGE_SHARE` = 0.6 (held — Nash fair share, not a free dial),
`QUIT_FAIRNESS_SENSITIVITY` ∈ {0.5, 0.75, 1.0, 2.0}, baseline seed 1.0 × M 1.0, 1000 y:
`qfwr-0.5/0.75/1.0/2.0-1000y-s1001`.

**Early read (y7) — all four are the same:**

| qf | wage | ceiling | wage/ceiling | fairWage (0.6·c) | agg. profit/month | deepLoss | nearIns |
|---|---|---|---|---|---|---|---|
| 0.005 (ref) | 1.000 | 1.138 | 0.879 | 0.683 | +1.071e8 | 20.2 | 5.1 |
| 0.5 | 1.091 | 1.480 | 0.738 | 0.888 | +1.257e8 | 18.9 | 4.7 |
| 0.75 | 1.107 | 1.446 | 0.765 | 0.868 | +1.274e8 | 15.7 | 6.3 |
| 1.0 | 1.111 | 1.411 | 0.787 | 0.847 | +1.330e8 | 17.2 | 4.4 |
| 2.0 | 1.129 | 1.457 | 0.775 | 0.874 | +1.230e8 | 17.7 | 5.3 |

**The channel is effectively binary.** Once `qf` is large enough to beat the outside-option term
(≈ −0.05) the wage is driven toward `WAGE_SHARE × ceiling`; as the wage rises the ceiling falls, the
fairness gap closes, and the quit pressure vanishes — so the *equilibrium* is set by `WAGE_SHARE`
alone and `qf` only sets the **speed**. Hence 0.5 → 2.0 gives the same steady state, and testing them
separately buys nothing: **one run above the threshold is enough, and the real dial is
`WAGE_SHARE`.**

**Two encouraging observations (both in the transient, y3–7):**
1. **Aggregate profit stays positive and rises** (+1.07e8 ref → +1.23–1.33e8) while the wage is 9–13 %
   higher. So at this horizon the wage rise is **not** a profit squeeze — it looks
   demand-financed (higher household income → more demand → more profit). That is the wage-led
   mechanism appearing on its own.
2. There is a **clear overshoot-then-relax**: at y3 the wage is ~2.0 against a ceiling of ~1.85
   (`wage/ceiling` = 1.06–1.12, *above* affordability), then it settles to ~1.1 by y7. Worth watching
   for instability.


## 26. Correction accepted: the outside option is a *state*, not a constant — and it is the real engine

`outsideIncome = jobFindingProbability(tightness) × vacancyWage`, with
`jobFindingProbability(t) = 1 − (1 − min(1,t))^SEARCH_HORIZON_TICKS`. Measured:

| run | y | wage | tightN | vacWageN | quitRate |
|---|---|---|---|---|---|
| ref | 6 | 1.000 | **0.037** | 0.83 | **0** |
| ref | 50 | 1.000 | **0** | **0** | 0 |
| ref | 100 | 1.000 | 4.71 | 0.67 | 0 |
| qf 0.5 | 10 | 1.247 | 0.020 | 0.25 | 0.0051 |
| qf 2.0 | 10 | 1.282 | 0.036 | 0.42 | 0.0049 |
| **s1.5-M1.25** | 3 | 3.620 | **41.1** | **3.18** | 0.0479 |
| **s1.5-M1.25** | 50 | 1.794 | **554** | 1.79 | 0.0091 |
| **s1.5-M1.25** | 150 | 1.939 | **692** | 1.71 | 0.0194 |

**The user is right and my "binary" reading was a transient artefact.** In the reference the outside
option is dead *because tightness ≈ 0 and `vacancyWage` ≈ 0* — huge unemployment means there are no
vacancies to poach from, so `exitGap = −1` and the outside term is a constant ≈ +0.05 headwind the
fairness term must beat. In the *tight* cell `tightness` = 33–692 saturates
`jobFindingProbability` at 1, so `outside ≈ vacancyWage × 0.9` = **1.5–3.2**, i.e. the outside term is
the *dominant, large* wage-setting force and the fairness term is only a supplement.

**So the two channels play different roles, and that is the whole mechanism:**

- **Loose market** (unemployment huge): only the fairness term can move the wage — which is why `qf`
  matters there and why the reference is pinned to `MIN_WAGE`.
- **Tight market**: the outside option takes over and is strongly self-reinforcing — a tight market
  ⇒ a high job-finding probability ⇒ a high outside option ⇒ quits ⇒ higher wage ⇒ tighter market.

The fairness channel's job is therefore to **ignite** the transition out of the low state; once the
market tightens the outside option **sustains** it. That is precisely the positive feedback a second
equilibrium requires (§22), and it means `qf` acts as a *threshold/ignition* parameter, not a level:
the four runs may yet diverge if only some of them cross the ignition point — which is exactly what
the 1000 y runs are for.

**On timing: the user is also right that the first phase is the over-build transient.** In the
`s1.5-M1.25` reference the high state only settles around y20–50 and holds to ~y150 (then collapses);
so **the equilibrium read needs ≥150–200 y**, and the current y≤10 windows — including the ones I
drew the "binary" conclusion from — are the un-tuned over-build phase, useful only as a robustness
screen.


## 27. Reader + first long-run state (y15): the ignition has NOT happened yet

`tools/longrun/qfwrRead.py [year ...]` prints wage / ceiling / quitRate / tightness / empShare /
starvation / price / aggregate profit / coverage for the four `qfwr` runs plus both references.

State at y10–15 (all four `qfwr` runs still tracking each other):

| run | y | wage | quitRate | tightN | empShare | aggProfit | coverage |
|---|---|---|---|---|---|---|---|
| ref (qs0.005) | 10 | 1.000 | 0 | 0.023 | 0.285 | +8.7e7 | 2.62 |
| qs0.5 | 10 | 1.247 | 0.0051 | 0.020 | 0.334 | +1.04e8 | 3.84 |
| qs0.75 | 10 | 1.281 | 0.0048 | 0.013 | 0.331 | +1.00e8 | 3.87 |
| qs1.0 | 10 | 1.284 | 0.0055 | 0.010 | 0.330 | +9.9e7 | 3.88 |
| qs2.0 | 10 | 1.282 | 0.0049 | 0.036 | 0.335 | +1.02e8 | 3.91 |
| tight ref 1.5×1.25 | 20 | 2.232 | 0.0384 | **89.3** | 0.544 | +2.28e8 | 5.77 |

**Diagnosis at this stage:** `tightness` in the `qfwr` runs is still **0.01–0.04** — essentially the
same loose market as the reference — so the outside option has **not** re-activated and the ignition
has not occurred. The fairness term is doing all the work (wage +25 %, coverage +45 %), and the
empShare is decaying along the reference's path (0.48 → 0.33). The tight reference reached tightness
**89** only because seed 1.5 × M 1.25 supplies enough labour demand — its empShare is 0.54 versus the
`qfwr` runs' 0.33.

**Implication:** at the baseline seed and M, `qf` alone probably buys a *modest permanent* gain, not a
regime change, because the empShare never gets near the ignition level. The obvious next experiment is
`qf` high × the good cell (seed 1.5 × M 1.25), i.e. capacity to create the tightness and the fairness
channel to convert it into wages. Runs continue to 1000 y; a y50 read is enough to decide whether the
tightness is rising at all before spending the rest.


## 28. Does the ignited state diverge to MAX_WAGE? No — it is a bounded limit cycle

**Measured over 200 y of the ignited cell (seed 1.5 × M 1.25) vs the reference:**

| series | run | mean | sd | **CV** | min | max |
|---|---|---|---|---|---|---|
| wage | ignited | 2.158 | 1.040 | **0.482** | 1.000 | **5.195** |
| wage | ref | 1.000 | 0.004 | 0.004 | 1.000 | 1.083 |
| ceiling | ignited | 3.051 | 1.560 | 0.511 | 0.287 | 8.615 |
| grocery price | ignited | 8.272 | 4.540 | **0.549** | 3.845 | **28.125** |
| grocery price | ref | 3.856 | 0.520 | 0.135 | 3.246 | 11.852 |

**Coverage by decade — ignited: 2.87, 5.77, 5.06, 4.48, 4.44, 4.26, 4.64, 4.34, 3.60, 2.85, 2.63.
Reference: 2.84, 1.95, 1.63, 1.36, 1.09, 1.05, 1.03, 0.92, 0.88, 0.78, 0.75, … 0.51 (y400).**

1. **No divergence to MAX_WAGE.** The wage's 200 y maximum is **5.2** against `MAX_WAGE` = 1000, and
   the `wage/ceiling` ratio stays **0.64–0.83**: the wage is always a fixed fraction *below* the firms'
   affordable surplus. The governor is `capAtAffordability(current + step, ceiling)` — the wage cannot
   outrun the surplus, and the surplus is itself eroded by the wage. **The positive feedback the user
   feared is structurally contained.**
2. **But it is a limit cycle, not a fixed point.** The wage CV is **0.48** and the price CV **0.55**, with
   peaks ~y40 and ~y60 → a period of roughly 20–40 y. The mechanism is the lagged loop
   wage → cost → price → demand → revenue → ceiling → wage. Dividing the decade deltas, the feedback
   gain `d ln(ceiling)/d ln(wage)` is ≈ **0.75–0.94**, i.e. *just below* 1 — which is exactly why the
   system neither converges nor explodes, and why the oscillations are large and slow.
3. **The island of stability is in the real variables, not the nominal ones.** The coverage holds
   **4.26–5.77 for y20–140** while the nominal wage swings 1.0–5.2 and the price 3.8–28. The wage and
   price co-move, so the real wage is stable while the nominal pair cycles. (It finally breaks at ~y180
   → wage 1.00, coverage 2.63.)
4. **At the baseline seed/M the fairness channel does NOT ignite but it DOES arrest the decay.** At
   y20: `qs0.5` coverage **3.37** and empShare **0.34** vs the reference's **1.95** / **0.21** — and the
   reference keeps sliding (0.75 by y200) while `qs0.5` holds ≈3.4. So the fairness channel roughly
   doubles the long-run coverage and halves the employment decay, without reaching the tight market
   (tightness 0.03–0.4 vs the ignited cell's 89–692).

**So the recipe for a stable high-employment island is: enough labour demand (seed/M) to push the
empShare past the ignition threshold, plus a wage that stays a *strict* fraction below the affordable
ceiling (which `WAGE_SHARE` = 0.6 already enforces).** The open risks are the large nominal cycle
(CV ≈ 0.5) and the ~180 y collapse.


## 29. The governor is CONDITIONAL, not structural — the cap disables below MIN_WAGE

```ts
const capAtAffordability = (wage, ceiling) => ceiling >= MIN_WAGE ? Math.min(wage, ceiling) : wage;
```

**When `ceiling < MIN_WAGE` the affordability cap is switched OFF.** The wage is then bounded only by
`MAX_WAGE` and by `WAGE_ADJUSTMENT_RATE` = 0.05 (≤5 %/month, ~80 %/year compounded).

**Measured — the dead-zone is real and it is exactly "labour tight + firms insolvent":**

| run | samples with ceiling < MIN_WAGE | all of them in | tightness there |
|---|---|---|---|
| ignited 1.5×1.25 | 0.5 % (13 samples) | **y0.08–y1.00** | **150 – 36,000** |
| qs0.5 | 3.6 % (14 samples) | y0.08–y1.08 | 4.3 – 3,650 |

Inside that window the wage rises **monotonically with the cap off** while the ceiling is 0.0–0.89:
ignited wage 1.035 → 1.539 (y0.08 → y1.00) and price **3.02 → 14.22 (×4.7 in one year)**; qs0.5 wage
1.001 → 1.145 and price 3.54 → 11.09.

So the answer to the question is: **the containment is conditional, not structural.** It holds
whenever `ceiling ≥ MIN_WAGE` — which is the normal and even the tight state (the ignited cell's
`wage/ceiling` of 0.64–0.83 shows the cap binding with tightness 89–692). It **fails** when the firms'
affordable surplus collapses below `MIN_WAGE`, i.e. when the firm sector is insolvent — and that is
precisely the state a hard squeeze produces. The escape is slow, not instant, because of the 5 %/month
step limit — but over decades it can walk to `MAX_WAGE`, and the price walks with it.

**Test launched:** `qftight-1.0` and `qftight-2.0` (1000 y) = the missing combination, `QUIT_FAIRNESS_SENSITIVITY` high
× seed 1.5 × M 1.25 — both up-pressures (fairness + a live outside option) together, to see whether the
wage escapes when the ceiling drops through `MIN_WAGE`.

**Candidate fix:** make the cap unconditional, e.g. `Math.min(wage, Math.max(ceiling, MIN_WAGE))`, so
the wage can never exceed the affordable surplus while also never being uncapped.


## 30. Audit of ad-hoc control hacks (requested cleanup)

**`capAtAffordability` — what it is and whether it can go.** The composite with its caller is

```
capAtAffordability(w, c)          = c >= MIN_WAGE ? min(w, c) : w
wagePerEdu[e] = max(MIN_WAGE, min(MAX_WAGE, capAtAffordability(w + step, c)))
```

which algebraically equals

```
wagePerEdu[e] = clamp(w + step, MIN_WAGE, min(MAX_WAGE, max(c, MIN_WAGE)))
```

So the branch is nothing but a **floor of `MIN_WAGE` on the cap** — it can be removed outright and
replaced by the single expression. Its only *behavioural* contribution is a **discontinuity**: at
`ceiling = 1.0` the wage is capped; at `ceiling = 0.99` it is **uncapped**. That is a discontinuous
gain in the control law, and it is the unguarded regime measured in §29 (ceiling < MIN_WAGE in
y0–y1 with tightness 150–36,000, wage and price walking up together).

Deeper: a budget constraint implemented as a **hard clip on the controller output** is the anti-pattern
— it silently overrides the controller and creates kinks. The clean form folds affordability into the
*pressure* as an error term (`pressure += gain × (ceiling − wage)/ceiling`), so the loop is smooth with
no clip, no dead zone and no unguarded state.

**Other ad-hoc terms found, by loop:**

*Wage loop (`automaticWorkerAllocation.ts`)*
| term | what it is | verdict |
|---|---|---|
| `capAtAffordability` ternary | floored ceiling, spelled as a branch | **hack** — discontinuous; merge |
| `Math.max(MIN_WAGE, Math.min(MAX_WAGE, ·))` | outer hard clamp; `MAX_WAGE` = 1000 pins a hyperinflation | hard boundary |
| `shortagePressure = shortage²` | convex gain shaping, no derivation | ad-hoc nonlinearity |
| `maxStep = WAGE_ADJUSTMENT_RATE × current` | rate limit *proportional to the current wage* ⇒ geometric growth at the limit | ad-hoc |
| `pressure = shortage² + 3·(quitRate − 0.009)` | sums two dimensionless terms of different scale | ad-hoc mixing |
| the education-ordering loop | post-hoc monotonicity repair of the per-education result | **patch** — hides that the setting can violate ordering |
| `rawCeiling = totalWorkersTicks > 0 ? · : 0` | special case; then the cap disables | minor but interacts with the hack |
| `_smoothedWageCeiling` EMA (0.1) | lags true affordability ⇒ the wage can exceed the true surplus | knob |

*Quit loop (`laborMarket.ts`)*
| term | what it is | verdict |
|---|---|---|
| **`QUIT_RATE_CAP = 0.002`** | hard per-tick cap on the propensity | **hard boundary that CAUSES the §25 saturation — the fairness dial is clipped** |
| `QUIT_TARGET_RATE = 0.009` (monthly) vs the cap 0.002 (per-tick ⇒ 0.06/month) | two rates in different units | latent inconsistency; the churn zero-point is a units coincidence |
| `Math.max(0, …)` on the propensity | floors at 0 | **dead zone**: the fairness term must beat the outside headwind before anything happens |
| `QUIT_OUTSIDE_WAGE_BIAS = 0.9` | 10 % haircut on the outside wage | fudge |
| `tightness × better.share` | ad-hoc composition of two unrelated quantities | ad-hoc |

*Scale control (`automaticProductionScale/constants.ts`)* — `MINIMUM_WORKERS_PER_SCALE = 20`,
`MAX_SCALE_EXPAND_FRACTION = 0.025` **and** `DYNAMIC_EXPANSION_CAP_FRACTION = 0.1` (two different
expansion caps), `MAX_SCALE_CONTRACT_FRACTION = 0.01`, `EXPANSION_AT_CAPACITY_FRACTION = 0.98` and
`CONTRACTION_AT_SCALE_FRACTION = 0.33` (two thresholds), the `CONTRACTION_INTEGRAL_{THRESHOLD 30, MAX
180, DECAY 0.05}` + `EXPANSION_INTEGRAL_THRESHOLD = 30` (a hand-rolled integral controller with a leak
and thresholds), `STORAGE_EXPANSION_RATE = 0.2` / `STORAGE_CONTRACTION_RATE = 0.1`,
`MIN_SCALE_FRACTION = 0.25`, `SOFT_FLOOR_RELAXATION = 0.5`, `EXPANSION_PRICE_INFLATION_THRESHOLD = 3.0`,
`EXPANSION_WORKER_RESERVE_MARGIN = 0.3`.

*Pricing (`automaticPricing.ts` / `constants.ts`)* — `PRICE_FLOOR = 0.01`, `PRICE_CEIL = 1e6`,
**`SPRING_NORMALIZATION = 1/7` (a magic number at the centre of every price in the economy)**,
`automatedCostFloorBuffer = 1.25`, `sellSmoothing` 4 (goods) vs 1 (services),
`TARGET_SELL_THROUGH = 1.1` / `TARGET_FILL_RATE = 0.86`, the EMAs (0.3), `serviceFlowError`'s
`clamp(decayTarget, 0.01, 0.99)` + `UNFILLED_SATURATION = 0.25` + the `over` term, and
**`INPUT_BUFFER_TARGET_TICKS` = 30 (goods) vs 3 (services)** — a 10× asymmetry that directly produces
the "services have no stock anchor" behaviour chased in §20–§21.

**Is the user too harsh? No — three of these are live defects, not style.** (i) the `capAtAffordability`
toggle is a discontinuous gain *and* an unguarded regime; (ii) `QUIT_RATE_CAP` silently clips the
fairness policy dial — it *is* the §25 saturation; (iii) `INPUT_BUFFER_TARGET_TICKS` 30 vs 3 is the
services/goods asymmetry; (iv) `SPRING_NORMALIZATION = 1/7` is an underived constant every price
depends on. Tweaks of this kind are exactly how a model becomes unattributable.

**Suggested method:** per loop, state the controlled variable, the error, the gain and the bounds; label
every term as (a) an identity, (b) a setpoint/knob, or (c) a hack; fold (c) into (b) or delete it. Then
**re-run the key experiments after each removal**, because some conclusions (the qf saturation above
all) may be artefacts of (c) rather than properties of the economy.


## 31. The combination DOES spiral: qftight runs extinct at y3.0 — and the cap is in the path

`qftight-1.0` / `qftight-2.0` (qf high × seed 1.5 × M 1.25) — the two up-pressures together — **both
extinct at y3.00**, while seed 1.5 × M 1.25 with qf 0.005 survives to y200. Death sequence:

| y | wage | ceiling | price | tightN | workerUtil | population | starvation |
|---|---|---|---|---|---|---|---|
| 1.58 | 1.66 | **1.19** | 14.9 | 68.8 | 0.536 | 9.72e6 | 0.277 |
| 2.00 | 1.98 | **1.38** | 26.9 | 41.4 | 0.225 | 8.03e6 | 0.540 |
| 2.42 | 2.39 | 1.67 | 127 | 782 | 0.018 | 3.09e6 | 0.865 |
| 2.83 | 2.80 | **0.00** | 793 | **1.8e6** | 0.000 | 1.2e5 | 0.998 |
| 3.00 | 3.06 | 0.00 | 554 | 1.8e6 | 0.000 | **0** | — |

Three things to read here:

1. **The wage exceeds the ceiling from the start** (1.66 vs 1.19) — the cap does not bind as intended,
   because the metric means are across firms with different per-firm ceilings.
2. **The runaway is in the *price*, not the wage**: the wage rises 1.66 → 3.06 (×1.8) while the price
   runs 14.9 → 1000 (×67). The causal order is **wage push → margin squeeze → the firms stop
   hiring/producing (`workerUtil` 0.54 → 0) → the supply collapses → scarcity spikes the price → the
   population starves and dies → the workforce vanishes → tightness → 1.8e6 → more wage push**. It is a
   production-collapse hyperinflation, not a wage-push one.
3. **The `capAtAffordability` dead-zone is reached in the terminal phase** (`ceiling → 0` at y2.83, so
   the cap switches **off** and the wage is free). The hack the user identified is therefore *on the
   causal path* of this failure.

**Conclusion:** the governor is insufficient by construction — it bounds the *wage* against the
surplus, but the runaway lives in the *price/supply* loop, which has no equivalent brake. And the
conditional toggle removes the wage bound exactly when the surplus collapses. So both of the user's
points hold: the hack should go, and the missing (or misplaced) governor is the real issue.

**Sequence for the cleanup, in order of confidence:** (1) remove the `capAtAffordability` branch
(algebraically a no-op except for the discontinuity); (2) resolve `QUIT_RATE_CAP` 0.002 vs
`QUIT_TARGET_RATE` 0.009 (the §25 saturation is this cap); (3) `INPUT_BUFFER_TARGET_TICKS` 30 vs 3;
(4) `SPRING_NORMALIZATION = 1/7`; (5) decide whether affordability belongs as a *pressure* term rather
than a clip, and whether the price/supply loop needs its own bound.


## 32. Revised audit — 2 real items, 4 conceded (user's review)

**Conceded, with agreement:**

1. **The education-ordering loop is a no-arbitrage condition, not a hack.** Higher education can fill a
   lower-education slot, so `wage(none) ≤ wage(primary) ≤ …` is the arbitrage-free condition (otherwise
   primary workers would all take none jobs). It is also *supposed* to push firms toward hiring
   overqualified workers. (Only note: it is enforced post hoc rather than emerging from the setting —
   acceptable for an identity, cleaner if endogenous.)
2. **The scale-control and pricing constants are the primary system** — setpoints and gains of the
   controller, not hacks layered on top. Agreed, withdrawn.
3. **`INPUT_BUFFER_TARGET_TICKS` 30 vs 3 is not a hack but a domain fact.** Services decay at
   `SERVICE_DEPRECIATION_RATE_PER_TICK = 0.1`, so the achievable buffer is bounded by `1/δ = 10 ticks`
   (~10 days) — a 30-day buffer target is unattainable, and *storage is the wrong concept for
   services*. They need their own treatment (which is what the flow rule is; see §20 for what is
   actually wrong with it — the parameters and the missing capacity anchor, not the asymmetry).
4. **`SPRING_NORMALIZATION = 1/7` is a unit convention** so that `costSpringStrength ∈ [0,1]` is a
   natural dial instead of `[0, 0.14]`. Accepted.

**Remaining real items: two.**

**(1) The ceiling cap makes the wage *statically determined* — the user's diagnosis is exact.**
Per firm the wage is `clamp(pressure-driven step, MIN_WAGE, min(MAX_WAGE, ceiling))`, so its level is set
by the two clamps, not by a balance of forces: **either `MIN_WAGE` or the ceiling** (or `MAX_WAGE` while
the cap is off). Evidence: the reference wage is `1.000` with sd 0.004 for 400 years — pinned at the
floor, carrying no economic information; and the ignited cell's interior values are averages over
heterogeneous firms, not an equilibrium. The user wants the ceiling to be **a force that can be
overcome**, which the current clip makes impossible. My earlier suggestion (make the clamp
unconditional) was *wrong* — it would only make the static determination cleaner.

**(2) The quit loop's hard cap** (`QUIT_RATE_CAP = 0.002`/tick × qf×gap) — the dial saturates (§25), so
above qf ≈ 0.2 the fairness channel is inert. Fix shape: replace the linear term + hard cap with a
smoothly saturating function, so the dial stays continuous.

**Design fork for (1) — the key decision:**

- **A. Antisymmetric affordability force.** Keep everything, drop the clip, add
  `affordabilityPressure = gain × (ceiling − wage)/ceiling` to the pressure. Gives an interior
  equilibrium where tightness, churn and affordability balance — but note that with a *positive* gain
  below the ceiling this still pushes the wage up to the ceiling unless the term is allowed to go
  negative above it, which is a modelling choice, not a derived one.
- **B. Remove the cap entirely; let affordability act indirectly.** The firm's labour demand is its
  slot capacity (scale × workers/scale) and is treated as wage-inelastic, so the direct force is
  *missing*; what exists is indirect and slow — overpaying → losses → scale contraction → fewer slots
  → less shortage → less wage pressure, plus bankruptcy. This is the economically honest option
  (a firm may overpay and accept losses), but it will likely spiral unless the contraction response is
  fast enough — and that is itself an experiment worth running.


## 33. Proxy system built; and the fair-wage force has an exact *inertness criterion*

**`tools/longrun/wageProxy.py`** — 2-state (e, w) proxy of the wage/employment/affordability loop,
calibrated against the measured reference state (`price` 3.92 vs 3.9 measured, `coverage` 0.509 vs
0.50). Encodes: the cost-plus price with pass-through = labour share, affordability
`cov = min(1, e·w·30/(p·basket))`, revenue/worker, ceiling/worker, tightness `τ = τ0·e/(1−e)`, the
outside option, quits, churn, shortage, the wage law, and an employment law (exogenous measured ramp by
default, endogenous optional). Runs in **seconds**, so the wage law can be swept instead of waiting
50–200 y of full simulation.

**Steady-state wage, sweeping `MIN_WAGE` (e ramps 0.47 → 0.065):**

| MIN_WAGE | `clip` (current) | `none` (no cap) | `down` (down-only force) | `symfair` (symmetric at 0.6·c) |
|---|---|---|---|---|
| 0.30 | 0.379 | **1000** | 5.775 | 0.300 |
| 0.50 | 0.632 | **1000** | 5.775 | 0.500 |
| 1.00 | 1.262 | **1000** | 5.775 | 1.000 |
| 2.00 | 2.544 | **1000** | 5.775 | 2.000 |

Four verdicts:

1. **`clip` makes the wage a constant multiple of the floor** (`w ≈ 1.26 × MIN_WAGE` across the whole
   sweep) — the user's "statically determined" is confirmed *quantitatively*: the wage level carries
   no information beyond `MIN_WAGE`.
2. **`none` → the wage pins at `MAX_WAGE` = 1000.** Removing the affordability bound without replacing
   it reproduces the hyperinflation exactly as predicted.
3. **`down` bounds the wage but at an *insolvent* level.** Its rest point is
   `w = c·(1 + (shortage² + churn)/gain)` ≈ 2·c — **independent of `MIN_WAGE`**, so the wage is
   determined by the balance of forces (good) but sits permanently *above* the affordable ceiling
   (bad) unless `afford_gain` is large relative to the up-pressure.
4. **`symfair` pins the wage at the floor in every case** — and that is not a numerical accident, it is
   the **inertness criterion**:

> The fair-wage force is positive only if `WAGE_SHARE × ceiling > MIN_WAGE`, i.e.
> **`ceiling / MIN_WAGE > 1 / WAGE_SHARE = 1.667`** (at `WAGE_SHARE = 0.6`).

**The economy's measured affordability headroom is `ceiling / MIN_WAGE ≈ 1.4 / 1.0 = 1.4` — below the
1.667 threshold.** So the fair-wage norm is **structurally inoperative here**: the fair share of the
surplus (0.6 × 1.4 = 0.84) is *below the legal floor*. That is the root explanation of the §23 "no-op" —
not a tuning problem but an inequality the economy fails, and it reframes the whole wage question:
**the surplus per worker is barely above the subsistence floor, so there is nothing for a wage rule to
distribute.** Any wage-rule change is inert until `ceiling/MIN_WAGE > 1.67`, which requires raising the
surplus per worker (employment/income — the famine problem again) or lowering the floor.

**Proxy caveat:** its absolute ceiling (≈0.2–0.9) sits below `MIN_WAGE` in these runs, i.e. permanently
in the `capAtAffordability` dead zone; the *comparative* results above are robust but the absolute level
needs a ceiling-scale calibration against the real multi-sector aggregate (the real ceiling is not the
food sector's revenue).

## 34. VERIFICATION: the "ceiling" is a profit-margin identity, not an affordability bound

**The user's suspicion was right: `ceiling < MIN_WAGE` is a false reading, and the ceiling is a mirror
of the wage.** Verified two independent ways.

**(a) Accounting identity, confirmed numerically to 3–4 significant figures in every sampled row:**

```
wageCeiling / wage  =  (revenue − purchases − claims) / wages  =  1 + profit / wages
```

because `wageCeiling = (revenue − purchases − claimPayments)/totalWorkersTicks` and
`profit = revenue − wages − purchases − claims`. Checked in `map2-s150-m125`, `map2-s200-m100`,
`map2-s150-m100`, `labour2-ton1`: e.g. `c/w` 1.4242 vs 1.4136, 1.5060 vs 1.5110, 1.6983 vs 1.6965.
The tiny gaps are because `wageCeiling` is a worker-weighted mean over firms while the RHS uses the
aggregate totals.

**So the ceiling is the firm's *zero-operating-profit* bound, ~1.4× the wage — not a food-affordability
bound.** The `capAtAffordability` clip therefore means "do not let the wage rise so far that operating
profit goes negative", i.e. it is a *soft insolvency wall*, and it fires only when `profit < 0`.

**(b) Statistical, over the runs where the wage actually moved:**

| run | wage range | mean c/w | ∂ln(c)/∂ln(w) | ∂ln(p)/∂ln(w) |
|---|---|---|---|---|
| map2-s150-m125 | 1.00 → 5.27 | 1.410 | 0.996 (R²0.81) | 0.926 |
| map2-s200-m100 | 1.00 → 5.13 | 1.502 | 0.859 | 1.051 |
| map2-s150-m100 | 1.00 → 3.86 | 1.413 | 0.765 | 1.132 |
| labour2-ton1 | 1.00 → 1.82 | 1.581 | 0.801 | 1.192 |
| qfwr-2.0 / -0.5 | ~1.0 → 3.7 | 1.312 / 1.340 | ~0.13 | ~0 |
| qftight (death) | 1.11 → 2.81 | **0.566** | 2.47 | **5.10**, coverage −4.1 |

The wage rose 5.3× and the ratio did not move. **`ceiling/wage ≈ 1.4` is a structural profit-share
constant; `ceiling/MIN_WAGE` was measuring the wage itself.** The earlier §33 criterion was right in
form but anchored to the wrong reference.

**Corrected criterion — scale-free and wage-free.** The fair-wage force is positive iff
`WAGE_SHARE × c > w`, i.e. **`WAGE_SHARE > 1/(1+π) = the actual labour share of value added`.**
Measured π = 0.31…0.74 → the critical `WAGE_SHARE` = 0.575…0.763 (0.709 at the mean π = 0.41).
At `WAGE_SHARE = 0.6` the force is a **constant negative** (`1 − 1/(0.6·1.41) = −0.18`) — the fair wage
is *always* below the actual wage, so the channel is **permanently deflationary**, not merely inert.
Above ≈0.71 it is a **constant positive** force → a runaway to `MAX_WAGE`. **Bang-bang, no interior
equilibrium — provably, because `c/w` is scale-free so the force does not depend on the wage level.**

**Confirmed: `ceiling < MIN_WAGE` occurs only (i) in the startup transient (revenue tiny while the wage
sits on the floor) and (ii) in the `qftight` death spiral (`c/w` = 0.566 — the price ran 5.1× per wage
unit, the coverage collapsed 4.1× — a genuine insolvency). Never structurally.**

**Proxy rebuilt on the verified structure and now trustworthy.** `wageProxy.py` uses
`c = w·(1+profit_ratio)`, `desired = labour_coefficient·cov` (χ = 0.13). Reference-state check:

| quantity | proxy | measured |
|---|---|---|
| price | 3.875 | 3.9 |
| ceiling/wage | 1.411 | 1.41 |
| coverage | 0.503 | 0.50 |
| quit rate | 0.000 | 0.000 |
| churn pressure | **−0.0270** | **−0.0270** |

`WAGE_SHARE` sweep (margin fixed at 1.41, critical 0.709): 0.40–0.709 → wage pinned at the floor;
0.73+ → runaway to 1000. **The knife-edge lands exactly on `1/(1+π)`.**

**At the calibrated baseline all four wage laws (clip / none / down / symfair) give w = 1.000**, because
the up-force is *absent*: shortage = 0, quit rate = 0, churn = −0.027. **No wage-law change can lift the
wage out of a slack labour market — the lever is employment/tightness, not the wage rule.** The wage law
only matters once the market tightens, and there it is a bang-bang.

**Reconciliation with §23/§25:** `WAGE_SHARE` was a "no-op" because the critical value is `1/(1+π)` ≈
0.71 and the baseline sits at 0.6; and the "ignition" seen when raising `QUIT_FAIRNESS_SENSITIVITY` is
this same knife-edge reached through the quit channel (the gap it multiplies is the *constant* −0.18).
Since π wanders 0.31…0.74, the critical `WAGE_SHARE` wanders 0.575…0.763 — **the economy straddles its
own instability threshold, which is the origin of the observed oscillation (wage CV 0.48) and of the
divergent long runs.**

**Design consequence:** a wage law whose target is a *share of the ceiling* can never give a stable
interior wage, because the ceiling is proportional to the wage. The target must be anchored to a
**level** — the floor, subsistence, or a real quantity (productivity/employment).


## 35. Two-sector regime map: the wage is a numeraire; the ignition must be built, not found

`tools/longrun/regimeProxy.py` — two-sector toy (food = necessary, services = discretionary) with every
price written as a wedge over the unit labour cost, so the nominal wage is the numeraire. Calibrated at
the reference: `chi_food` = 0.13 workers/unit food/month, `wedge_food = p_food/(chi_food·w·TPM) = 0.994`.

**Numeraire test — the wage cannot move anything real.**
Starting from w0 = 1, 3, 10, 100 gives **identical real outcomes** (e = 0.6375, svc = 1.45227). Because the
service price and the wage both scale with w, the discretionary *volume* is w-free:
`svc = propensity·(e − wedge_f·chi_f)/(wedge_s·chi_s)`. **This falsifies "wages must rise to produce
service demand": a wage rise is a pure relabelling.** No wage law can ignite the regime.

**A. The fate parameter is `wedge_food` (food price / its unit labour cost), threshold = 1:**

| wedge_food | e from famine start | e from affluent start | |
|---|---|---|---|
| 1.100 | 0.001 | 0.077 | collapse |
| 1.020 | 0.021 | 0.483 | |
| **0.994** | **0.066** | 0.635 | **the reference economy** |
| 0.950 | 0.304 | 0.893 | |
| 0.850 | 0.869 | 1.000 | |
| 0.700 | 1.000 | 1.000 | **SINGLE** (low branch removed) |

`wedge_food = 1` means the food price equals exactly its own labour cost — no markup, no non-labour
inputs, no chain leakage, no profit. **The economy sits at 0.994: the entire food price is labour cost,
so there is no surplus in the food chain to fund anything.** Below 1 the low branch rises steeply; below
0.70 the two branches merge (saddle-node removal) and the famine attractor disappears.

**B. The system is genuinely BISTABLE.** Every cell above is BISTABLE except wedge_food ≤ 0.70: the same
parameters give e = 0.066 from a famine start and e = 0.635 from an affluent start.

**C. Cheap services alone do NOT unlock the famine branch.** chi_service 0.35 → 0.05 (7×) leaves the
famine attractor at e = 0.067, svc = 0.000 — because the discretionary income is *exactly zero* until the
food coverage exceeds 1, which needs `e > wedge_food·chi_food = 0.129`. **Food affordability must come
first; services cannot bootstrap themselves.**

**D. Food productivity is the only thing that opens the famine branch — and only a crack.**
chi_food 0.13 → 0.035 moves the famine attractor only from 0.066 to 0.060 with svc 0.000 → 0.072: the
released food workers substitute for the new service workers almost exactly.

**E. The available high-employment equilibrium is bounded — and it is small.** Solving the fixed point
`e = chi_f + (e − wedge_f·chi_f)/wedge_s` analytically:

```
e_H  =  chi_food · (wedge_s − wedge_food) / (wedge_s − 1)
```

At a realistic service markup (wedge_s ≥ 1.1) with chi_f = 0.13 this is **e_H ≈ 0.13** — barely above the
food coefficient. It diverges only as `wedge_s → 1`. The e = 0.637 seen in the numerics exists **only
because wedge_s = 1 exactly**, i.e. a unit-root runaway, not an equilibrium.

**F. The structural missing ingredient — the multiplier.** The circular flow is services → food only: a
service worker's wage is spent on food, so the service sector generates no further service demand and the
feedback is *contractive* (multiplier ≈ 1/wedge_s < 1). A service economy needs the sectors to demand
*each other* (a Leontief/SAM multiplier > 1): services buying services, and the food chain buying
administration, logistics, construction, maintenance. **Without that loop the employed share is capped
near the food labour coefficient, whatever the wage system does.**

## 36. THE REGIME EXISTS — IT IS SHARP, AND IT IS A TRANSIENT (race: the Malthusian drain)

Asked "is there a high-wage/high-demand regime?", the existing runs already answer it. Two clean
clusters, **with nothing in between** (fill is a step function, not a gradient → a saddle-node):

| cluster | fill | empShare | grocery chain | **retail chain** | wage | price | real wage |
|---|---|---|---|---|---|---|---|
| FAMINE | 0.52–0.71 | 0.065–0.093 | 4.3k–11k | **113–290** | 1.000 | 3.9–5.2 | 0.19–0.26 |
| FED | 0.98–1.00 | 0.18–0.49 | 2.0k–11k | **750–23,700** | 1.00–1.89 | 3.5–7.6 | 0.25–0.32 |

**Crossing the gate ignites the service sector: retail grows 20–140× and comes to dwarf the food chain**
(famine `ton=0.625`: grocery 11,060 / retail 169; fed `ton=0.5`: grocery 11,260 / **retail 23,090**).

**What crosses the gate — exactly what the toy said (`coverage = e / (chi·wedge)`):** either a **lower
labour content** or a **higher seeded capacity**. Same seedScale 1.0: `ton` 0.625 → famine (fill 0.544),
`ton` 0.5 → fed (fill 0.985). Same labour rate 0.625: seedScale 1.0 → famine, 1.5 → fed (fill 0.991,
empShare 0.485). And there is an **upper** boundary: seedScale 3–4 → a price runaway (80–110) and a new
collapse (fill 0.38–0.46).

**The real wage is (nearly) invariant across the whole transition** — 0.19–0.26 in famine, 0.25–0.32 fed.
A ~1.3× real-wage move alongside a 4× employment move and a 100× retail move. The numeraire property is
confirmed in the real data, not just the toy.

**But the fed state is a TRANSIENT.** `svc125anchor-10000y` starts fed and decays over ~350 y:

| year | population | employed (abs) | empShare | realWage | grocery out | retail out |
|---|---|---|---|---|---|---|
| 0.1 | 9.8e6 | 4.63e6 | 0.472 | 0.287 | 2010 | 3117 |
| 41.9 | 1.20e7 | 2.21e6 | 0.184 | 0.296 | 1168 | 721 |
| 125.6 | 1.96e7 | 2.43e6 | 0.124 | 0.258 | 2624 | 295 |
| 250.0 | 3.86e7 | 2.87e6 | 0.074 | 0.256 | 4345 | 153 |
| 418.4 | 4.67e7 | 3.05e6 | 0.065 | 0.256 | 4950 | 113 |

**The population grows 4.8× while the ABSOLUTE employment stays flat (~2.2–3.0 M).** The employment
*share* therefore collapses 7× purely demographically → the wage income per head falls → the
affordability falls → the discretionary demand dies → retail shrinks 96% → the famine attractor.

**Chain: fed transient → population grows (affordable food → fertility) → absolute employment fixed →
share falls → per-head income falls → services collapse → famine.** The real wage is constant
(0.253–0.296) through all 418 years, so **no wage system participates in this at all.**

**Conclusion: the high-employment/high-service-demand region is real and reachable but it is not an
attractor — it decays in ~100–300 y, and the decay is Malthusian (population against a fixed absolute
employment). The binding constraint is the fertility/income link, not the wage rule.** The actionable
levers are therefore (a) a demographic response to income (so a higher income does not convert into more
people) and/or (b) letting absolute employment grow with population — not any change to how wages are set.

**Runs launched to refine the gate boundary** (background, 200 y, seedScale 1.0, svc 0.75, seed 1001):
`gate-ton035-200y-s1001`, `gate-ton025-200y-s1001` — to see whether pushing the labour rate below the
`ton = 0.5` gate raises the employment further or triggers the inflation runaway.


**So: where is the high-wage/high-demand region?** It exists only in the corner where (i) the food surplus
is genuinely positive (`wedge_food < 1`) and (ii) the circular multiplier exceeds 1. The current
economy's cost structure (wedge_food ≈ 0.994, multiplier < 1) sits outside that corner, and the map shows
the corner is reached by **pushing the ratios** — food cheap, services labour-intensive, and the sectors
trading with each other — never by lifting the wage. The ignition must be **built into the demand
structure**, not found in the wage rule.



## 37. The recipes question: what the recipes can and cannot determine

**Identity (verified).** In the food-only closure the coverage cancels, giving

```
realWage  ≡  1 / (30 · chi_subsistence)          chi = labour content of the subsistence basket
coverage   =  e / chi_subsistence                 so  empShare/fill = chi + e_optional/fill
```

Measured: famine cluster `empShare/fill` = 0.134–0.169 vs `1/(30·realWage)` = 0.140–0.172 — **exact**,
because there the optional sector is ~absent. Fed cluster: 0.226–0.300 vs 0.104–0.106 — the gap *is* the
optional-sector employment. Confirmed.

**Consequences.**

1. **The real wage and the subsistence labour content are the same dial**, not two. A wage policy cannot
   move the real wage, because the identity pins it to the recipes. (This is §35's numeraire result

## 38. Gate re-verified; and the fertility code (my "recipes don't touch it" was too strong)

**The gate, exactly.** Services appear when the monthly food bill per head falls below the monthly wage
income per head:

```
gate  =  p_food · basket / (e · wage · 30)      services start when gate < 1
```

Measured, and it is cleanly bimodal with a wide empty band around the threshold of 1:

| cluster | gate | fill | retail chain |
|---|---|---|---|
| FAMINE | **1.71 – 2.10** | 0.52 – 0.65 | 113 – 290 |
| FED | **0.28 – 0.67** | 0.98 – 1.00 | 1,774 – 29,000 |

No run sits near 1 — hence the step function. (The user's formulation is correct with "wage" read as the
*monthly* household wage income; the ×30 is the only correction.)

**The scale-down lever is already a *relative* shift.** `LABOUR_PER_TON_PER_TICK` prices *tonnage*;
`LABOUR_PER_SERVICE_UNIT` prices *service units*. So lowering the ton rate shifts labour out of the
**goods** economy (which includes the essential food chain) into the **services** economy — the right
direction, and it demonstrably ignites the services (ton 0.625 → famine, retail 113–290; ton 0.5 → fed,
retail 13,000–29,000). It is *blunt*, however: it also cheapens optional goods. Per-chain labour
intensities would target the essential chain specifically — a refinement of this effect, not a different
mechanism.

**Fertility — verified against code and data, and my §36 wording was too strong.**
`computeBirthsThisTick` = `3.0 × (1 − 0.75·starvation^p) × (1 − 0.5·pollution)`. **There is no income or
education response.** Consequences, confirmed in `svc125anchor`:

| year | pop | fill | starvation | births/mo | deaths/mo |
|---|---|---|---|---|---|
| 0.1 | 9.8e6 | 1.000 | **0.0000** | 16.5k | 18.1k |
| 83.8 | 1.53e7 | 0.961 | **0.0000** | 27.2k | 19.8k |
| 167.4 | 2.49e7 | 0.826 | **0.0000** | 44.4k | 32.5k |
| 209.2 | 3.17e7 | 0.724 | 0.0075 | 56.7k | 41.6k |
| 334.8 | 4.42e7 | 0.576 | 0.2035 | 77.8k | 77.4k |


## 39. `workerRequirements` reworked: explicit labour content + the essential/optional lever

**Why.** `massPerQuantity` is **1 for all 35 resources** (verified: every entry in `resources.ts`). So the
old labour model was literally

```
labour per facility-scale = 0.5 × tonnage + 0.75 × service units
```

i.e. **the labour content of every good was its mass** — a cargo/transport property, not an economic one.
The essential/optional labour split was therefore emergent and unobservable.

**What changed** (`src/simulation/workforce/workerRequirements.ts`):

- `LABOUR_PER_UNIT: Record<LabourLevel, number>` — explicit labour per unit by process level
  (`raw` / `refined` / `manufactured` = 0.5, `services` = 0.75), env-overridable individually
  (`LABOUR_PER_RAW_UNIT`, `LABOUR_PER_REFINED_UNIT`, `LABOUR_PER_MANUFACTURED_UNIT`,
  `LABOUR_PER_SERVICE_UNIT`).
- `ESSENTIAL_GOODS` (Water, Produce, Processed Food, Beverage, Pharmaceutical, Grocery, Healthcare) with
  `ESSENTIAL_LABOUR_FACTOR` / `OPTIONAL_LABOUR_FACTOR`.
- `labourPerUnitOf(resource)` = level basis × class factor; `source` / `internal` / `currency` → 0.
- `LABOUR_PER_TON_PER_TICK` and the mass proxy are gone.

**Exactly neutral by default — verified.** A throwaway check compared `headcountPerScaleFor` against the
old mass formula for every entry: **0 / 42 facilities differ** (both factors default to 1). So the sim is
bit-identical until a lever is turned.

**The audit table** (`tools/longrun/labourProbe.ts`, reworked) now prints per facility the
headcount/scale, the headcount per output unit, and the essential/optional split. What it exposed:

| facility | headcount per output unit | essential share |
|---|---|---|
| foodProcessor | **1.62** | 0.97 |
| beveragePlant | 1.30 | 0.93 |
| agriculturalFacility | 1.01 | 0.96 |
| groceryChain | 0.88 | 1.00 |
| **retailChain** | **0.87** | **0.00** |
| administrativeCenter | 0.79 | 0.00 |
| educationCenter | 0.85 | 0.00 |
| logisticsHub | 0.95 | 0.00 |
| constructionFacility | 1.13 | 0.00 |

**The essential food chain is labour-HEAVY per output unit and the optional services are labour-LIGHT —
the exact inverse of what the regime requires.** A unit of processed food carries ~1.9× the labour of a
unit of retail service. That is now visible and directly tunable, and it explains why the optional sector
cannot absorb the employment.

**The two levers map onto the two conditions in §37:**
`ESSENTIAL_LABOUR_FACTOR ↓` → `chi_essential ↓` → the coverage gate;
`OPTIONAL_LABOUR_FACTOR ↑` → the optional employment multiplier.

**Runs launched** (200 y, seedScale 1.0, seed 1001, svc 0.75 — comparable to qfwr/map2):
`shiftE-050` (E = 0.5), `shiftO-150` (O = 1.5), `shiftEO-050-150` (both).


## 40. Recipe-book tests built on the toy; and two corrections to §39

**Testing infrastructure added.** `labourPerUnitFor(level, essential, essentialFactor, optionalFactor)` is
now a pure exported function (with `labourPerUnitOf` wrapping it with the env constants), so the lever is
unit-testable without touching the environment.

**`src/simulation/planet/recipeBook.test.ts` (11 tests, all passing)** — the toy applied to the two recipe
books:
- the classification covers the subsistence basket and the food chain has a producer for every essential
  good the population consumes;
- every final good has a finite, positive **chain** labour content, and chain ≥ direct (the recursion is
  cycle-guarded);
- **the toy's ordering condition**: the subsistence retail chain is cheaper per unit than the optional one
  (`chainLabourPerUnit(Grocery)` < `chainLabourPerUnit(Retail)`) and than Construction;
- **the toy's gate**: the discretionary sector opens only once the employment share exceeds the subsistence
  labour content (`coverageFor(e, chi) > 1`), and lowering the essential factor moves the gate in the right
  direction;
- the recipe book's labour is weighted towards the optional chains; the two factors are independent.

`tools/longrun/recipeChainProbe.ts` prints the chain labour content per final good (direct vs chain).

**Correction 1 — §39's "inversion" was a direct-labour artefact.** In *chain* terms the ordering is already
correct:

| final good | class | direct/unit | **chain/unit** |
|---|---|---|---|
| Administration | optional | 0.789 | 0.835 |
| Education | optional | 0.849 | 1.294 |
| **Grocery** | **essential** | 0.875 | **1.475** |
| Logistics | optional | 0.947 | 1.497 |
| Healthcare | essential | 0.866 | 2.402 |
| **Retail** | optional | 0.866 | **3.328** |
| Construction | optional | 1.129 | 3.372 |

Retail's chain is heavy because its *inputs* (clothing, furniture, electronics) carry labour. So the
essential→optional ordering the regime needs **already holds**; the §39 table compared direct labour only
and was misleading. The test now pins the chain view.

**Correction 2 — the optional labour factor is NOT an employment lever; it is a stability hazard.**
The toy's algebra: the service employment is
`e_service = propensity · (e − wedge_food·chi_essential) / wedge_service` — **`chi_service` cancels**, because
a more labour-intensive service simply costs proportionally more so fewer units are bought. So raising the
optional coefficient raises the *price*, not the employment. Empirically, and decisively:

| run | at | empShare | fill | wage | price |
|---|---|---|---|---|---|
| baseline books | y172+ | 0.19→0.30 | 0.95–1.0 | 1.0–1.2 | 3.5 |
| **E=0.5** | y35 | holding | **0.99** | 1.00 | — |
| **O=1.5** | y1.08 | 0.47 | **0.730** | 1.38 | **14.9** |
| O=1.5 | y2.42 | 0.06 | **0.000** | 2.51 | **201** |
| O=1.5 | y2.83 | 0.00 | 0.000 | 2.94 | **341** → **population 0** |
| E=0.5 + O=1.5 | y32 | **0.55→0.32** | **1.00** | 1.0–2.1 | — |

**`O = 1.5` alone is a total extinction in 2.83 years**: the price runs 3.4 → 341 (×100) while the wage only
rises 3×, so the real wage collapses and starvation hits 0.998. It is the same price-runaway signature as
`qftight`, now triggered from the *cost* side — and it shows the **service chains are a pass-through
amplifier**: raising a non-essential input's labour inflates the whole chain. The combined run survives only
because the cheaper essentials cushion it.

**So the design guidance is one-sided: lower `ESSENTIAL_LABOUR_FACTOR`; do not raise
`OPTIONAL_LABOUR_FACTOR`.** The essential factor is the gate lever (and holding fill ≈ 1.0 at y35); the
optional factor is a price/stability parameter.

**Caveat:** the earlier `gate-ton035/025` runs were started *before* this change, so they ran with the old
`LABOUR_PER_TON_PER_TICK` semantics (0.35 / 0.25). Their logs carry the old env line; they are valid but
not reproducible under the new env names. `run.ts` now logs the new parameters.

**Starvation is exactly 0.0000 for ~200 years while the fill falls 1.00 → 0.72 and the population grows

## 41. Direct vs chain labour; the service fills; and the essential set closed over the chain

**Direct vs chain.** `direct/unit` = the facility's own crew per unit of its output (`headcountPerScaleFor /
outputQuantity`). `chain/unit` = direct **plus every upstream stage's labour**, per unit of the final good,
accumulated by walking `needs` backwards to the producing facility (cycle-guarded). **The chain figure is
the one the gate needs**, because the consumer price is a markup chain over every stage's cost — so the
food price embodies the *chain* labour content, not the facility's own. For Grocery: direct 0.875, chain
**1.475**.

**The service fills confirm the chain figure predicts who gets served** (baseline `qfwr-2.0`, mean over the
last third; the service markets are the ones where a low fill is a real signal):

| service | chain/unit | fill |
|---|---|---|
| Administration | 0.835 | 0.764 |
| Education | 1.294 | 0.958 |
| **Grocery** | **1.475** | **0.983** |
| **Logistics** | **1.497** | **0.938** |
| Healthcare | 2.402 | 0.951 |
| **Retail** | **3.328** | **0.651** |

## 42. Config cleanup, run cleanup, and the set A/B (in flight)

**The essential set is now a plain constant.** `ESSENTIAL_GOODS` in `workerRequirements.ts` is a hardcoded
16-good food-chain set (the user's choice: Water, Produce, Processed Food, Beverage, Grocery, Pesticide,
Chemical, Crude Oil, Packaging Material, Paper, Plastic, Glass, Logs, Lumber, Limestone, Sand). The
`ESSENTIAL_GOODS` env override and `DEFAULT_ESSENTIAL_GOODS` were removed — the set does not switch at
runtime; a different set is a code edit, tested sequentially. The env surface that *remains*:
`LABOUR_PER_{RAW,REFINED,MANUFACTURED,SERVICE}_UNIT`, `ESSENTIAL_LABOUR_FACTOR`, `OPTIONAL_LABOUR_FACTOR`
(here), plus `MIN_WAGE` / `WAGE_SHARE` / `QUIT_FAIRNESS_SENSITIVITY` (constants.ts).

**Test adaptation.** With the smaller set, `recipeBook.test.ts` now uses a *leak-share* guard instead of a
strict closure-subset guard: `optionalLabourShare(root) < 0.01` for Grocery / Processed Food / Beverage.
That accommodates a deliberately narrower set while still catching a regression — reverting to the old
7-good set gives a share of 0.758 and fails. The user's set gives **0.003** (the only leak is Coal, via
plastics → packaging). 23 tests pass; `tsc`, `eslint`, `prettier` clean.

**Run cleanup.** Stopped the four `qfwr-*-1000y` runs after 5 h (the qf dial is inert — `QUIT_RATE_CAP`
saturation; data preserved to y705–756). Deleted 83 superseded/short-probe result entries (`*-v2`,
`*probe*` excluding the 6000y/10000y runs, the unversioned and `-v3` `diag` runs, stray `.log`/`.pid`):
**52 GB → 39 GB**, 1123 → 1040 entries. Left in place: the long-run families (`diag-*-v4`, `trend*`,
`1agent-8b-rm1000-6000y*`, `10k*`, ~24 GB) because they back the earlier HANDOVER /
AGENT-EXPECTATIONS / WAVE-PREDICTIONS docs — **candidates for a second pass on request.**

**Running (200y, seedScale 1.0, seed 1001):** `ab-grocery` (Grocery only, E=0.5), `ab-food16` (the fixed
default set, E=0.5), `ab-full24` (the 24-good closure incl. the health chain, E=0.5) — just started;
`shiftE-050` y102 (E=0.5, old 7-set), `shiftEO-050-150` y100, `gate-ton035/025` y165/163 (old
`LABOUR_PER_TON_PER_TICK` semantics — not reproducible under the new env names).


## 43. Defaults set to the best-measured config

**Matched-year comparison** (all seedScale 1.0 unless noted; fill = groceryFillRate):

| run | y20 e / fill | y50 | y100 | y200 | y400 |
|---|---|---|---|---|---|
| NEUTRAL (levels 0.5/0.75, seed 1.0, E=O=1) | 0.368 / 1.00 | 0.308 / 1.00 | 0.226 / 1.00 | 0.173 / 1.00 | **0.257 / 0.993** retail 14,350 |
| FAMINE (ton 0.625, seed 1.0) | 0.334 / 1.00 | 0.246 / 1.00 | 0.191 / 1.00 | 0.134 / 0.840 | 0.091 / **0.495** |
| E=0.5 (old 7-good set) | 0.195 / 1.00 | 0.141 / 1.00 | 0.088 / 0.979 | — | — |
| E=0.5 + O=1.5 (old 7-good set) | 0.328 / 1.00 | 0.221 / 1.00 | 0.159 / 1.00 | — | — |
| svc125anchor | 0.214 / 1.00 | 0.172 / 1.00 | 0.136 / 0.923 | 0.100 / 0.760 | 0.066 / 0.539 |
| **levels 0.625/0.9375, seed 1.5, E=O=1** | **0.536 / 0.844** | **0.540 / 0.994** | **0.527 / 0.999** | **0.373 / 1.000** retail 7,064 | — |

**Verdict.** Lowering the essential factor does **not** help — both E=0.5 variants decay faster than the
neutral (0.088 and 0.159 at y100 against the neutral's 0.226). What *does* help is **more labour content
plus more seeded capacity**: a **uniform 1.25× on the level rates** (0.625 / 0.9375) with
**seedScale 1.5** sustains empShare 0.37–0.54 at fill ≈ 1.0 through 200 y — roughly 2× the neutral's
employment at the same year, with a lower real wage per worker (0.235 vs 0.300) but far more workers fed.

**Defaults changed:**

- `LABOUR_PER_UNIT` = raw 0.625, refined 0.625, manufactured 0.625, services 0.9375
  (`src/simulation/workforce/workerRequirements.ts`).
- benchmark `seedScaleFactor` default 1 → **1.5** (`tools/longrun/world.ts`).
- `ESSENTIAL_GOODS` = the fixed 16-good food-chain set (unchanged, user's choice); `ESSENTIAL_LABOUR_FACTOR`
  = `OPTIONAL_LABOUR_FACTOR` = 1.

Verified: `tsc`, `eslint`, `prettier` clean; recipeBook + workerRequirements + production = **70 tests

## 44. Change register, the honest yardstick, and dev/prod

**Change register (uncommitted work).** HEAD is `c4347f12 "Rework service pricing and hiring, tune economy"`,
which already contains the earlier session's service-pricing rework (`automaticPricing.ts` service
sell-through, production-anchored and tick-aligned), the 1-DoF personality, `planet.ts`
`lastSellThroughBase`, the tunings (`AUTOMATED_COST_FLOOR_BUFFER` 1.5→1.25, `TARGET_SELL_THROUGH` 1.2→1.1,
`TARGET_SELL_THROUGH_SERVICES` 0.86→1.1) and `demandShock.ts`. **Uncommitted now:**

| file | change |
|---|---|
| `src/simulation/constants.ts` | `MIN_WAGE` (1.0), `WAGE_SHARE` (0.6), `QUIT_FAIRNESS_SENSITIVITY` (0.005) made env-overridable — **values unchanged** |
| `src/simulation/workforce/workerRequirements.ts` | rework: mass proxy removed; `LABOUR_PER_UNIT` per level (0.5/0.5/0.5/0.75, env-overridable), `ESSENTIAL_GOODS` (16-good food chain), `ESSENTIAL_LABOUR_FACTOR`/`OPTIONAL_LABOUR_FACTOR` (1/1), `labourPerUnitFor`/`labourPerUnitOf`. Behaviour-neutral vs the old mass formula (0/42 facilities differ) |
| `src/simulation/workforce/workerRequirements.test.ts` | 9 tests (adapted + 2 new guards) |
| `src/simulation/planet/recipeBook.test.ts` | NEW, 14 tests: the toy's conditions on the two recipe books, the chain labour content, the leak-share guard |
| `tools/longrun/run.ts` | logs the labour config + the essential set per run |
| new tools | `SESSION-HANDOVER.md`, `labourProbe.ts`, `recipeChainProbe.ts`, `wageProxy.py`, `regimeProxy.py`, `sessionAnalysis.py`, `labourSweepAnalysis.py`, `qfwrRead.py` |
| housekeeping | 83 superseded/short-probe result dirs deleted (52 GB → 39 GB, 1123 → 1040) |

**Reverted (my premature "best" defaults):** the 1.25× level rates and the benchmark `seedScaleFactor`
1.5. So the code sits at the neutral defaults with the new structure.

**`QUIT_FAIRNESS_SENSITIVITY` is at its default 0.005** — never raised. The fairness term is therefore
~inert (0.005 × a gap of ~0.42), which is consistent with the wage being floor-pinned everywhere we
measured. Raising it is a bang-bang: §25 showed it *lifts* the wage (1.00 → 1.97–4.80) because the gap
turns positive whenever `ceiling/wage > 1/WAGE_SHARE`, but the same amplification produced the fatal
runaways. It is not currently part of the config.

## 45. Coverage band: what the data say about "just over 1"

The hypothesis under test: the food sector already generates the maximum labour slots (its demand is a
*bounded* basket, so the food employment saturates at `chi_essential × coverage` and cannot exceed
`chi_essential`), so a coverage just over 1 should be the efficient target and the higher services should
ignite on fluctuations.

**The data (coverage `e·w·30/p_food` vs `groceryFillRate`):**

| run | y20 | y50 | y100 |
|---|---|---|---|
| seed 3.0 / 4.0 | **no data — dies before y20** | — | — |
| seed 1.5 + labour ×1.25 | 5.88 / 0.844 | 4.65 / 0.994 | 4.19 / 0.999 |
| seed 2.0 | 3.80 / 1.000 | 2.88 / 1.000 | 2.70 / 1.000 |
| neutral seed 1.0 | 3.67 / 1.000 | 2.97 / 1.000 | 1.91 / 1.000 |
| seed 1.5 | 3.15 / 1.000 | 2.66 / 1.000 | 1.74 / 1.000 |
| svc125anchor | 1.97 / 1.000 | 1.50 / 1.000 | **1.05 / 0.923** |

**Verdict — the hypothesis is supported, with one correction:**
1. **Above ~1.5 the fill is already 1.000.** Extra coverage buys nothing — over-building is pure cost.
2. **Below ~1.2 the fill starts to slip** (svc125anchor: 1.05 → 0.923) and the run decays to famine.

## 46. The set A/B verdict, and the seed is a ~3.7× over-build

**Set A/B (E = 0.5 on all three, at y170–174):**

| run | empShare | fill | coverage | gate ratio | retail |
|---|---|---|---|---|---|
| ab-grocery (set = {Grocery}) | 0.088 | 0.777 | 0.82 | 1.214 | 257 |
| **ab-food16 (the 16-good set)** | 0.070 | **0.925** | 0.86 | 1.160 | 291 |
| ab-full24 (full closure) | 0.058 | 0.822 | 0.73 | 1.372 | 193 |

**All three decay toward famine** — coverage below 1, fill slipping, retail collapsed to ~200–300. So
**E = 0.5 is harmful regardless of which set is used**, and the set choice matters little: the 16-good set
is the least bad (fill 0.925), the full closure the worst (0.73, an over-aggressive cheapening). **None of
the three is in the high regime.** The high-regime runs we actually have are the earlier ones: the neutral
(coverage 2.58 and fill 0.993 at y400, retail 14,350) and the over-built `map2-s150-m125` (retail 7,064 at
y200).

**The seed is an over-build by construction.** The initial coverage scales with the seed:

| seed | initial coverage (y5) |
|---|---|
| 1.0 | 3.67 |
| 0.75 | 3.10 |

4. **Retail fill** is 0.17 at y2 → 0.88–0.95 by y15 in both: it recovers, so the "worst market" reading of the
   rules refers to the long-run level, not the first years.




**The user's edit:** `QUIT_FAIRNESS_SENSITIVITY` 0.005 → **0.025** (5×), with the env wrappers removed
(`MIN_WAGE` / `WAGE_SHARE` / `QUIT_FAIRNESS_SENSITIVITY` are plain constants again). 0.025 is still
**20–80× below** the values that demonstrably ignited (0.5–2.0), so it is a nudge, not an ignition; and it
is now a code value, so sweeping it needs sequential edits rather than parallel env runs.

**Fix for the ambiguity that caused this:** `run.ts` now logs
`MIN_WAGE=… WAGE_SHARE=… QUIT_FAIRNESS_SENSITIVITY=…` alongside the labour config and the essential set,
so every run's wage-channel setting is on the record.

**Runs:** the five `seedscale-*` runs (launched while qf was still 0.005 — the wrong regime) were killed and
relaunched as `qf025-seed{075,05,035,025}-200y-s1001` at the new default qf = 0.025. The three `ab-*` runs
continue as a qf = 0.005 control for the E/set comparison.

| 0.66 | 2.49 |

So starting **at the gate (coverage ≈ 1) needs a seed of ≈ 0.27**, i.e. **seed 1.0 is a ~3.7× over-build**
— which is exactly why the first ~100 y is transient and why early-year comparisons mislead. **Correction
accepted:** the earlier coverage-vs-outcome table was read off the transient; and the target is the *gate
ratio* `p_food/(e·wage·30)` ≈ 1 — the boundary condition for the discretionary sector — not a comfortable
2× margin.

**Defaults / runs.** Benchmark `seedScaleFactor` default is now **0.5** (clearly below 1), and a low-seed
sweep is running: `seedscale-{066,075,050,035,025}-200y-s1001` (200 y, seed 1001, neutral otherwise).
Together with the three `ab-*` runs that is **8 logical runs**; the gate and shift runs have finished.

**Nuance worth resolving with that sweep:** the boundary is the *separatrix*, not obviously the attractor.
The neutral's coverage *rises* late (1.56 at y200 → 2.58 at y400) instead of decaying to 1, while
`svc125anchor` decays straight through 1 to 0.5 — two basins. The low-seed runs will show which basin the
boundary-adjacent starts land in, and whether sitting at the gate sustains the discretionary sector or
flickers it.

3. **Seed 3.0 / 4.0 die before y20** — "more and we go into famine territory" is literally true; the
   price runaway kills the run.
4. **Correction: "just" over 1 is too close to the cliff.** The coverage oscillates (price/wage CV ≈ 0.5),
   so a mean of ~1.05 puts the troughs below 1 — which is exactly how `svc125anchor` died (it passed
   through 1.05–1.5 and decayed). The safe target is **~1.5–2.5**: comfortably above the gate so the
   troughs stay above it, and no higher, since the fill is saturated by 1.5.

So the efficient target is a coverage of roughly **2**, i.e. of order 2× the gate — not "just over 1", and
certainly not 4–6.

**Runs and seed scale.** Only the three `ab-*` runs were still going; the gate-ton and shift runs have
finished. To test the lower-seed request, `seedScaleFactor`'s benchmark default is now **0.7** and two runs
were launched: `seedscale-066-200y-s1001` and `seedscale-075-200y-s1001` (200 y, seed 1001, neutral
otherwise). Reason: at seed 1.0–1.5 the initial over-build skews the first ~100 y and takes centuries to
relax. Current total: **5 logical runs** (3 `ab-*` + 2 `seedscale-*`). Benchmark-only default — no dev/prod
impact.


**The honest yardstick: real income per head = coverage = `e · w · 30 / p_food`** (food baskets affordable
per head; >1 = fed). This is the quantity the famine is about.

| run | y20 | y50 | y100 | y200 | y400 |
|---|---|---|---|---|---|
| **NEUTRAL (levels 0.5/0.75, seed 1.0)** | 3.67 | 2.97 | 1.91 | 1.56 | **2.58** |
| labour ×1.25, seed 1.0 | 2.97 | 2.08 | 1.41 | **0.95** | 0.65 |
| labour ×1.25, seed 1.5 ("over-built") | 5.88 | 4.65 | 4.19 | 2.63 | — |
| E = 0.5 | 2.85 | 1.99 | **1.09** | — | — |
| E = 0.5, O = 1.5 | 4.82 | 3.04 | 1.88 | — | — |
| svc125anchor | 1.97 | 1.50 | 1.05 | 0.77 | 0.51 |

1. **The neutral is the only config that recovers** (1.56 → 2.58 between y200 and y400) and never leaves
   the fed regime. **It is the best config we are currently aware of — and it is what the code now
   defaults to.**
2. **Increasing the labour content alone is harmful** (coverage 0.95 by y200 — a famine). More
   labour-intensive production per unit makes work but makes the economy poorer per head.
3. **The over-built config looks better at every year** (5.88 → 2.63) but the gain is capacity, not
   economics, and it is untested past y200 — "even more over-building would appear even better", which is
   precisely why the metric must not be the employment share or the fill.
4. **E < 1 is harmful on this metric too** (1.09 vs 1.91 at y100). Lowering the essential factor does not
   buy real income.

**dev/prod.** The *labour* config lives in shared code (`workerRequirements.ts`) and reaches dev and prod
automatically. The *capacity* config does not: the game seeds from
`src/simulation/initialUniverse/targets.ts` (`FACILITY_SCALE_PER_BILLION`), which is **auto-generated by
`tools/facility-growth-model/computeTargets.ts`** — and that generator **reads `workerRequirement`**. So any
change to labour content or intended capacity requires: re-run `computeTargets.ts` → commit `targets.ts` →
re-seed the DB (`npm run db:seed` for dev, the equivalent for prod). The benchmark's `seedScaleFactor` does
**not** touch the game — so the temporary 1.5 default there would have had zero prod effect, which is why
reverting it costs nothing.

pass** (the level change is a uniform rescale, so the relative assertions hold). `best-default-1000y-s1001`
launched with the new defaults to test durability past y200 — the y200 advantage is measured, the y400+
behaviour is not.

**Caveat:** `ab-grocery` and `ab-full24` were launched while the env override still existed. They are
running correctly, but a `--resume` after this cleanup would rebuild them with the default set, so they
must not be resumed.

| **Construction** | **3.372** | **0.663** |

**The prediction holds**: grocery and logistics are filled (0.98 / 0.94) and the two most expensive chains —
retail and construction — are the two worst-served services (0.65 / 0.66). Administration is the exception
(lowest chain, middling fill), so the relation is not monotone, but the extremes confirm it.

**The `O = 1.5` extinction is explained — and it is a classification bug, not a lever effect.** The
subsistence basket's upstream closure contains 24 goods, of which **17 were classified `optional`**
(Chemical, Coal, Crude Oil, Pesticide, Packaging Material, Paper, Plastic, Glass, Logs, Lumber, Limestone,
Sand, Iron Ore, Steel, Cotton, Fabric, Furniture). Because the classification was applied per *good* rather
than per *chain*, the food chain's labour was mostly optional-classified:

| chain | optional-classified share of its labour |
|---|---|
| Grocery | **0.758** |
| Beverage | 0.804 |
| Processed Food | 0.734 |
| Healthcare | 0.727 |
| Pharmaceutical | 0.632 |

So raising `OPTIONAL_LABOUR_FACTOR` inflated ~76 % of the *food* chain's labour → the food price → the
famine → extinction. The path is concrete: `Grocery ← Processed Food ← Chemical + Packaging`,
`Chemical ← Crude Oil`, `Packaging ← Paper ← Logs + Plastic`, `Beverage ← Chemical + Glass + Packaging`,
`Produce ← Pesticide ← Chemical`.

**Fix applied:** `ESSENTIAL_GOODS` is now closed over the subsistence chain (7 → **24 goods**). The food
chains' optional share is now **0.000** across the board, and the split between the two factors is clean.
Two tests guard it: *every upstream input of the subsistence basket is essential*, and *Clothing /
Electronics / IT Devices / Vehicle stay outside the closure*. Defaults stay behaviour-neutral (both factors
1), so the sim is unchanged until a lever moves.

**Caution on "raise the whole level":** scaling `chi` up with a fixed seeded capacity *lowers* the initial
coverage (`coverage₀ = e₀ / chi`), which is exactly what `labour2-ton1` (ton 0.625, a 25 % level raise)
shows — famine. A level raise must be paired with a capacity (`--seedScaleFactor`) increase.

**Tests:** `recipeBook.test.ts` 14 + `workerRequirements.test.ts` 9 = **23 passing**; `tsc` and `eslint`
clean.

4.8×** — i.e. fertility runs at its maximum against a falling standard of living, and only brakes once
starvation registers (fill ≈ 0.55). The births/deaths converge exactly at that point.

So: **the equilibrium is the starvation boundary, by construction.** The recipes *do* move that boundary
(a higher chi → less affordable food → starvation → fewer births) — so they *do* touch the demographic
channel, and §36's "the recipes don't touch it" was too strong. But the recipes cannot prevent the system
settling *at* the boundary, because starvation is the only fertility brake. **A richer famine is
reachable; a stable high-income state is not** — until the fertility has a brake that engages *before*
starvation. That is a one-function fix in `computeBirthsThisTick`.

**So both interventions are required, and they do different jobs:** the recipe shift sets whether the
optional sector can *exist at all* (the ratio condition, optional multiplier > 1), and the fertility
response decides whether a high-employment state *persists* (instead of being consumed by population
growth).

   restated in recipe terms.)
2. **Only the *ratio* matters.** Scaling the whole recipe book uniformly moves the price level and the
   real wage together and leaves the coverage/regime untouched. What moves the regime is the *relative*
   labour content of the essential vs the optional chains — exactly "shift labour from the essential to
   the optional supply chain".
3. **But the mapping is NOT one-way**: `chi_realised` is not a pure recipe constant. The *same* physical
   labour rate (ton = 0.5) gives `chi` = 0.143 in the famine cluster and 0.106 in the fed cluster — so
   the **pricing/markup layer sits between the recipes and the regime** and is an equally strong
   determinant. The observed chain is: recipes → physical labour → prices/markups → real wage → coverage
   → regime, and every link carries its own ad-hoc constant (`SPRING_NORMALIZATION`, the markup, the
   affordability clip). **A recipe-only calibration can therefore be defeated by the pricing layer.**
4. **The coverage is history-dependent** (a unit root in the food-only subsystem — §36's step function
   and the seed-scale sensitivity are its signature). The recipes do not *set* the coverage; the initial
   capacity and the optional-sector closure do.

**Form of the condition the recipes must satisfy** (and it is two numbers, not forty-five recipes):

- the **essential** chain's labour content must be small enough that feeding the whole population does
  not exhaust the employment (`chi_essential < the target employment share`), i.e. it should be
  **mass/input-intensive, labour-light**;
- the **optional** chains must be **labour-intensive** (a high labour share, a low input/resource share)
  so that spending discretionary income actually employs people, i.e. the optional employment multiplier
  must exceed 1.

Everything else in a recipe book is flavour — the regime is set by that one ratio.

## 47. Correction: the high-equilibrium runs had the fairness channel ON

**The `qfwr-*` family is `QUIT_FAIRNESS_SENSITIVITY` = 0.5 / 0.75 / 1.0 / 2.0** (§25 defines the names).
So the runs I had been calling the "neutral" (qfwr-2.0: wage 1.47, empShare 0.29, fill 0.985, retail
23,300 at y172, holding to y756) are **not neutral at all** — they have the fairness channel at **2.0**,
i.e. the wage-lifting lever fully on. That is why the wage sat at 1.36–1.47 instead of the floor.

**Two observed routes into the high equilibrium:**

| route | config | result @y170–200 |
|---|---|---|
| **fairness on** | qf = 0.5–2.0, labour 0.5/0.75, seed 1.0 | empShare 0.22–0.29, fill 0.98–1.00, retail 10.5k–23.3k |
| **over-build** | qf = 0.005 (default), labour ×1.25, seed 1.5 | empShare 0.37–0.54, fill ~1.00, retail 7,064 |

**Consequence for §36 / §44 / §46: those verdicts were measured with the wage channel OFF (qf = 0.005).**
Every run I launched this session inherited that default, which is why they all decayed while the qfwr
family held. The comparisons *within* that set are still valid (the same qf), but the absolute verdicts —
"the neutral decays", "E = 0.5 is harmful", the seed conclusions — **do not transfer to a raised qf and
have to be re-measured.**


## 48. qf = 0.025 is NOT enough — behaviourally identical to 0.005

Four runs at the new default `QUIT_FAIRNESS_SENSITIVITY = 0.025` (seeds 0.75 / 0.50 / 0.35 / 0.25):

| run | y0.1 | y16–18 | y48–53 | y64–71 |
|---|---|---|---|---|
| seed 0.75 | wage **1.0000**, cov 3.87 | 1.0000 / 1.57 | 1.0000 / 1.06 | 1.0000 / 1.06, retail 247 |
| seed 0.50 | 1.0000 / 2.74 | 1.0000 / 1.20 | 1.0000 / 0.97 | 1.0000 / 0.83, retail 147 |
| seed 0.35 | 1.0000 / 1.88 | 1.0000 / 1.18 | 1.0000 / 0.65 | 1.0000 / 0.56, retail 94 |
| seed 0.25 | 1.0000 / 1.34 | 1.0000 / 1.00 | 1.0000 / 0.59 | 1.0000 / 0.54, retail 61 |
| ref qf = 2.0, seed 1.0 | 1.0011 / 4.00 | 1.2420 (y152) / 1.47 | **1.1739 (y305) / 2.20** | 1.3070 (y609), retail **73,600** |

**The wage is exactly 1.0000 at every sample** — the same as at qf = 0.005 (the `ab-food16` control also
shows 1.0000 throughout). So 0.025 buys nothing; all four decay (coverage 3.87 → 1.06 at the best seed,
retail collapsing to 60–250) while qf = 2.0 lifts the wage to 1.24–1.31 and grows retail 24×.

**Also: with the wage channel off, a lower seed decays *faster*** (seed 0.25 → coverage 0.54 by y71; seed
0.75 → 1.06). The initial capacity is then the only support, so the "clearly lower seed" idea cannot help
while qf is inert — it only removes the headroom. The seed question is therefore only meaningful *after*
the wage channel is on.

**The best-known configuration remains the `qfwr` family**: labour 0.5/0.75, seed 1.0, qf = 0.5–2.0 (all
four ignite and saturate — §25 puts the saturation above ≈0.2), giving empShare 0.22–0.29, fill 0.98–1.00
and retail 10.5k–23.3k by y172, holding to y756. `QUIT_FAIRNESS_SENSITIVITY` needs to be at least ~0.5 for
that; 0.025 and 0.005 are indistinguishable.

**Cancelled:** the three `ab-*` runs (qf = 0.005, the E/set comparison) at the user's instruction.
**In flight:** the four `qf025-seed*` runs.

## 49. Does the toy still predict the simulation? Partly — the churn yes, the ignition no

**Settings now in force** (code defaults): `ESSENTIAL_LABOUR_FACTOR` = **0.9**, `OPTIONAL_LABOUR_FACTOR` =
**1.3**, `QUIT_FAIRNESS_SENSITIVITY` = **0.1** (user's 4× step), `LABOUR_PER_UNIT` 0.5/0.75.
Launched: `ef09of13-qf01-seed{10,05}-200y-s1001` (seed 1.0 and 0.5); the four `qf025-*` runs cancelled.
`run.ts` records `MIN_WAGE=1 WAGE_SHARE=0.6 QUIT_FAIRNESS_SENSITIVITY=0.1` per run.

**What holds (verified against the igniting run `qfwr-2.0`):**

- **The churn arithmetic is exact.** Sim: `churnPressure = WAGE_CHURN_GAIN·(quitRate − QUIT_TARGET_RATE)`
  = 3·(0.013152 − 0.009) = **0.0124575**, and the recorded `wageChurnPressure` is **0.0124575**. The toy
  uses the same law. ✔
- **The gate and the floor regime** are reproduced: wage pinned at `MIN_WAGE`, coverage = gate, the step
  transition at coverage 1.
- **The wage rises through the quit channel, not the shortage channel**: in `qfwr-2.0`
  `wageShortagePressure` is 0.00000 at every sample while `wageChurnPressure` runs −0.022 → +0.032 and the
  wage 1.00 → 2.00. ✔ (the toy has both channels.)

**What does not hold — the toy cannot predict the ignition.** In the igniting run both of the toy's quit
drivers are *negative* at aggregate level:

| y | wage | ceiling | fairWage = 0.6·ceiling | vacancyWage | quitRate |
|---|---|---|---|---|---|
| 95.2 | 1.095 | 1.565 | **0.939** | 1.000 | 0.00912 |
| 285.6 | 1.570 | 1.810 | **1.086** | 1.009 | 0.01270 |
| 666.2 | 1.467 | 1.793 | **1.076** | 0 | 0.01677 |

`fairWage` is *below* the wage throughout (so the aggregate fairness gap is negative), and the vacancy
wage is below the wage too (so the exit gap is negative) — yet the sim's voluntary quits run at ~0.013/month
(`voluntaryDeparting`/`employed` = 337,934/20.5 M ≈ 0.016, against the 0.009 target). **The quits come from
the firm-level distribution**: the recorded `wageCeiling` is a worker-weighted *mean*, and a fraction of
firms sit above the fair-wage threshold even when the mean does not.

**Consequences:**
1. The toy is an **aggregate** model of a **heterogeneous** channel, so it predicts the floor where the sim
   ignites. It answers "is the food affordable / is there a gate" but not "does the wage take off".
2. **§37 / §40's "the fairness force is a scale-free bang-bang with no interior equilibrium" is an
   aggregation artefact.** The sim has a stable interior wage (1.2–1.5 for 600 years) precisely because the
   distribution smooths the sign — the aggregate gap being negative is compatible with a positive
   *fraction* of firms igniting.

3. **To predict the ignition the toy needs the distribution**, not the mean: either a per-firm
   `ceiling/wage` spread, or an outside option anchored to the **vacancy wage** (the sim's
   `vacancyWagePrimary` feeds `outsideIncome`) instead of the toy's `0.9 × current wage`, which by
   construction can never exceed the wage.

## 50. Cheaper grocery inputs (user recipe edit) — the subsistence labour fell 36 %

**The change** (user, `productionFacilities.ts`): the grocery chain's inputs got cheaper. Measured with the
probe: grocery **direct** labour/unit 0.875 → **0.740**, **chain** labour/unit **1.475 → 0.948** (−36 %).

**Why this is not a cosmetic fill tweak — it moves the gate.** The chain labour *is* the subsistence
denominator in the toy gate: `coverageFor(supply, subsistence)` opens when the employment share exceeds the
subsistence labour content (`recipeChainProbe`'s chain figure is the one the gate uses, §47). A −36 %
subsistence therefore (a) lowers the gate threshold, so `coverage > 1` is reached at a lower employment
share, and (b) lowers the food price, raising the affordability ceiling `capAtAffordability`. Both push
towards ignition, so the recipe edit and the `QUIT_FAIRNESS_SENSITIVITY` raise (§49) act on the *same*
question from two sides.

**A/B laid out** (identical config: `ESSENTIAL_LABOUR_FACTOR` 0.9, `OPTIONAL_LABOUR_FACTOR` 1.3,
`QUIT_FAIRNESS_SENSITIVITY` 0.1, seed 1.0, 200 y, seed 1001):

| run | recipes | role |
|---|---|---|
| `ef09of13-qf01-seed10-200y-s1001` | old | before (loaded before the edit, so pinned to the old books) |
| `ef09of13-qf01-newgroc-seed10-200y-s1001` | new | after |
| `ef09of13-qf01-seed05-200y-s1001` | old | seed 0.5, old recipes |

**First readings (y2–20, both runs same config; the new-recipe run is at y20/200, the old at y55):**

| y | wage old | wage new | grocery price old | grocery price new | grocery fill | retail fill old | retail fill new | grocery margin old | grocery margin new |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 1.756 | **2.496** | 3.868 | **2.332** | 0.99–1.00 | 0.957 | 0.951 | 0.223 | 0.492 |
| 10 | 1.088 | **2.933** | 2.907 | **1.801** | 1.00 | 0.908 | 0.940 | 0.401 | 0.438 |
| 15 | 2.433 | 2.868 | 3.596 | **1.870** | 1.00 | 0.877 | 0.953 | 0.411 | 0.440 |
| 20 | 1.056 | 1.369 | 2.946 | **1.867** | 1.00 | 0.595 | 0.933 | 0.408 | 0.453 |

1. **The cheaper inputs pass straight through to the price, not the fill.** `facilityPriceOverCost_groceryChain`
   is 1.12 in *both* variants (stable markup), while the market price falls ~3.0–3.9 → ~1.9 (−40 %). The
   grocery *fill* is ~1.00 in both, so grocery was never the binding market (consistent with the rules note:
   grocery is the healthy service market).
2. **The grocery-chain margin rises and steadies**: 0.22–0.41 (volatile, old) → 0.34–0.49 (new).
3. **The wage ignites at `qf = 0.1` in *both* variants** (peaks 2.5–2.9), and it oscillates: the old-recipe run
   walks 1.06 → 2.43 → 1.06 over y10–20, i.e. a **limit cycle**, not a fixed point. So 0.1 is enough where
   0.025 was inert (§48) — the ignition is *not* what the recipe change bought; the fairness raise is.

**Test fix.** `recipeBook.test.ts`'s `chainLabourPerUnit('Grocery') > chainLabourPerUnit('Administration')` was a bakes-in-the-recipe ranking and the edit flipped it
essential-membership guard it actually carried (Chemical, Packaging); the closure property it was named for
is already covered by the leak-share test above it. tsc clean, **70 tests pass**.

## 51. The quit cap was a second ghost — the propensity is a cliff, not a dial

Verified with `tools/longrun/quitProbe.ts` (calls the real `quitPropensity`). `QUIT_RATE_CAP` is **0.01**
now (raised from 0.002); sensitivities 0.05 / 0.1; both gaps clamped to ±1.

**A. Fairness-only** (outside suppressed → `exitGap = −1`):

| fairWage | fairGap | propensity/tick | /month |
|---|---|---|---|
| 1.6 | 0.375 | 0.00000 | 0.00 |
| 2.0 | 0.500 | 0.00000 | 0.00 |
| 2.2 | 0.545 | 0.00455 | 0.14 |
| 2.6 | 0.615 | **0.01000** | 0.30 |
| 3.0 | 0.667 | 0.01000 | 0.30 |

A **hard cliff at fairGap = 0.5**, because the outside term contributes exactly −0.05 and 0.1·fairGap crosses
it there. This is the "equality" — and it is why the measured minimum was `qf = 0.5`: `0.05 / 0.1`.

**B. Outside-only**: 0.0 until a 20 % wage advantage, saturating to the cap by a 50 % advantage. So a 20–50 %
outside gap spans the *entire* dynamic range of the channel.

**C. Scaling invariance**: scaling both sensitivities by k leaves the sign identical for every k → with the cap
in place the dynamics are invariant under common scaling. **"Same ratio, no difference" is exactly right.**

**D. The scale mismatch that causes the cycle:** target `0.009/month = 0.0003/tick` against a term scale of
`0.05/tick` — a ratio of **0.006**. The wage can only rest where the two ±0.05/±0.1 terms cancel to *three
decimals* (a 0.6 % balance). Nothing else holds it, so noise flips the sign and the system runs corner to
corner — the bang-bang, and the missing interior equilibrium of §49 has a *code* cause as well as the
aggregation cause.

**Consequences.**
1. **Yes — a ghost.** The sensitivity-magnitude sweeps were measuring a *threshold in the ratio*, not an
   intensity. The handover had already flagged it (line 1236: "hard boundary that CAUSES the §25 saturation —
   the fairness dial is clipped") and we swept anyway.
2. **Ordering.** Realistically `QUIT_OUTSIDE_SENSITIVITY ≥ QUIT_FAIRNESS_SENSITIVITY` (a better outside offer
   is the primary quit motive). The code has **0.05 < 0.1** — inverted — so the ignition regime is bought by
   letting the secondary motive outvote the primary one. That is a design choice, not a finding.
3. **Bounded? Nominal inflation?** From `qfwr-2.0` (1000 y): the *real* wage (wage/foodPrice) sits at a stable
   0.29–0.30 for 700 y; the aggregate price level drifts 1.56 → 1.90 in 600 y (+0.03 %/y); the wage 1.0 → 2.0.
   So it is **bounded in real terms and mildly inflationary in nominal terms** — but not stable: a ~600 y
   limit cycle takes the wage 1.29 → 3.36 → 1.29 and the real wage 0.24 → 0.69 → 0.24 (a famine-grade squeeze).
   Deleting the cap would not fix that; it would make the ceiling 0.05+0.1 = **0.15/tick ≈ 4.5/month**, i.e.
   every worker quits within a week at the corner.
4. **The constructive fix.** Keep the cap as a physical bound but *shrink the sensitivities into the band*:
   the operating point must sit where `s·gap ≈ QUIT_TARGET_RATE`, i.e. sensitivities of order
   `0.0003–0.001`/tick, not 0.05–0.1. Then the controller has a linear range, the wage has an interior
   equilibrium, and the dials finally act nominally. (Also worth re-checking: is a 0.3/month cap physically
   defensible? 0.01/tick is 30 % of workers per month.)

## 52. The gaps, measured — the outside is maxed *deflationary*, the fairness is never maxed

`tools/longrun/gapProbe.ts` reconstructs both gaps from recorded columns using the real formulas
(`outsideIncome`, `WAGE_SHARE`), over the valid samples (the recorded `tightness*`/`vacancyWage*` are
**exactly 0 in 57 % of samples** — a recording artefact — so the exit-gap stats use the 43 % that carry them).
Reverted sensitivities 0.005 / 0.0025; cap 0.01; the "OLD" column is the pre-revert 0.05 / 0.1 that the three
currently-running `ef09of13-*` runs were launched with.

**`qfwr-2.0` (1000 y, the igniting run):**

| tier | exitGap med (mean) | maxed(<−0.99) | fairGap med (mean) | fairGap>0 | implied quit/mo NEW | implied quit/mo OLD |
|---|---|---|---|---|---|---|
| Primary | −0.657 (−0.556) | 4 % | −0.203 (−0.262) | 8 % | 0.0049 | 0.0078 (1.0 % at cap) |
| Secondary | −0.996 (−0.966) | **73 %** | −0.203 | 8 % | 0.0002 | 0.0000 |
| Tertiary | −0.986 (−0.927) | 42 % | −0.203 | 8 % | 0.0006 | 0.0000 |
| None | −0.318 (−0.327) | 1 % | −0.203 | 8 % | 0.0064 | 0.0131 (1.7 % at cap) |

observed mean `wageQuitRate` = **0.0115/mo** (target 0.009).

**Current-recipe run at the revert's inputs** (`ef09of13-qf01-newgroc`, 820 samples): Primary exitGap med
−0.394, fairGap med −0.403 (18 % positive), implied 0.0136/mo NEW vs 0.0493/mo OLD (7.3 % at cap); observed
0.0070/mo.

**Answers.**
1. **Typical outside gap: deeply negative, and maxed at the −1 clamp in the higher tiers** (−1 means
   `outside ≤ 0`, i.e. no posted vacancy wage at that sample). So the outside channel is a *deflationary pull*,
   not a quit motive — the user's reading is right.
2. **Typical fairness gap: mildly negative, 8–18 % positive, never near +1** — it cannot reach +1 unless
   `wage → 0`, as noted. So **the 0.75 %/tick maximum is never approached**: `atCap = 0.0 %` for the reverted
   pair in every tier and both runs. **The cap is now inert and the dials act nominally.**
3. **Biting level.** The reverted pair's *mean* raw implies 0.005–0.014/mo against a 0.009/mo target — i.e. it
   sits *at* the control target, which is exactly where a graded channel should sit. The pre-revert pair
   instead over-drives 2–7× the target and clips 1–9 % of samples at the cap.
4. **Caveat, and it is §49 again.** The reconstruction is order-of-magnitude only and it does *not* close the
   loop: in `qfwr-2.0` the aggregates imply a quit rate *below* target (deflationary) while that run's wage
   rose for 600 years, and in the current run the aggregate Primary implies 0.0136/mo while the observed is
   0.0070. The ignition lives in the firm-level tails of both gaps — which no tier average and no aggregate
   toy can see. Any judgement of "does it bite" from these numbers is a *level* statement, not an ignition
   statement.

**A/B launched:** `rev-s10-newgroc-200y-s1001` — the reverted 0.005 / 0.0025 at the current recipes and seed.
The three `ef09of13-*` runs remain the pre-revert arm.

## 53. The outside channel is structurally non-positive — §51's "fine balance" was an old-weight artefact

**Measured (`qfwr-2.0`, quantiles of the samples that carry a tightness):**

| tier | tightness | vacancyWage | wage | JFP | outside | exitGap |
|---|---|---|---|---|---|---|
| Primary | 0.004 | 1.000 | 1.724 | 0.057 | 0.051 | −0.970 |
| Primary | 0.047 | 1.000 | 1.405 | 0.512 | 0.461 | −0.672 |
| Primary | 0.331 | 1.000 | 1.160 | **0.998** | 0.898 | −0.226 |
| Secondary | 0.000 | 1.000 | 1.698 | 0.000 | 0.000 | −1.000 |
| None | 0.415 | 1.000 | 1.181 | 1.000 | 0.900 | −0.238 |

1. **The gap is driven by tightness, not by the wage difference.** Where it hits −1 the cause is
   `JFP ≈ 0` (no openings), not a low vacancy wage; and even at a **fully tight market** (`JFP = 1`) with a
   **parity** vacancy wage the gap only reaches **−0.226**, because `QUIT_OUTSIDE_WAGE_BIAS = 0.9` makes a
   parity offer a *worse* offer. The vacancy wage tracks the going wage (essentially always ≈ 1.0), so
   **the outside term is ∈ [−0.005, −0.001] in practice and never positive.**
2. **Therefore the `clampUnit` lower bound is a no-op**: `outside ≥ 0` alone implies
   `(outside − wage)/wage ≥ −1`. The −1 clamp observed in §52 is arithmetic, not a modelling choice.
3. **Consequence — with the reverted pair there is no fine balance, only a threshold.** Because the outside
   term is essentially a small negative constant, `quitPropensity > 0` reduces to
   `fairGap > 2·|exitGap|`, and with `|exitGap| ≈ 0.1–0.26` in a tight market that is **`fairGap ≳ 0.2–0.5`**,
   i.e. a firm whose `ceiling/wage ≳ 2.1` (`fairGap = 1 − 1/(0.6·r)`). **§51's "the terms must cancel to
   three decimals" was an artefact of the pre-revert weights**, where the outside term was 10× larger. The
   reverted pair is far better conditioned: the fairness channel is the *only* positive engine of the wage,
   and it fires on a clean threshold.
4. **User correction accepted.** An exit gap at −1 (no outside chances) *should* close the quit channel even
   when pay is unfair — "you cannot quit for fairness if there is nowhere to go". §52's wording implied a
   defect; it is the intended behaviour.

## 54. Cheaper grocery: healthier — smoothed A/B over y30–90, same config and seed

| metric | OLD recipes | NEW recipes |
|---|---|---|
| grocery/food price | 3.332 | **1.999** (−40 %) |
| grocery fill | 0.998 | 0.998 |
| healthcare fill | 0.955 | **0.990** |
| **education fill** | **0.629** | **0.997** |
| retail fill | 0.544 | 0.610 |
| **real wage** (wage/food) | 0.357 | **0.639** (+79 %) |
| employment share | 0.273 | 0.301 |
| grocery margin | 0.439 | 0.477 |
| retail margin | 0.291 | 0.350 |

**Verdict: yes, healthier — in affordability and in the household service markets.** Three of the four
service markets (the ones where a low fill is a real signal) improve, education dramatically. The path is the
intended one: the ~40 % food-price cut raises the real wage ~1.8×, which frees household income for the
**discretionary** services, and education's fill goes 0.63 → 1.00. Grocery stays saturated (it never was the
constraint); retail remains the weakest market (0.54 → 0.61) and is now the *only* service materially below 1.

**Caveats.** Both runs use the **pre-revert** constants (launched before the revert); the comparison is still
clean because only the recipes differ. Both are ~90–120 y, i.e. still in the transient region (§46). And the
grocery change is a **level** fix, not a stability fix: the real wage still decays in both (0.64 → 0.49 over
y30–90) and the wage still sits near `MIN_WAGE`. The wage means (1.18 vs 1.27) differ within limit-cycle noise
— do not read them.

**Runs:** `ef09of13-qf01-seed10` (old recipes, pre-revert) y119; `ef09of13-qf01-newgroc-seed10` (new recipes,
pre-revert) y87; `rev-s10-newgroc` (new recipes, reverted) y17.

## 55. Is there a contraction to a persistent starvation state? Not starved, but structurally contracting

Tails of the three runs (coverage = `employed/pop × wage × 30 / foodPrice` = food baskets per head; > 1 = fed):

| run | last y | pop | employed | empShare | wage | foodPx | coverage | avgGroceryStarvation |
|---|---|---|---|---|---|---|---|---|
| OLD recipes | 182 | 26.97 M | 5.959 M | 0.221 | 1.005 | 3.710 | **1.79** | 0.0000 |
| NEW recipes | 156 | 23.25 M | 4.502 M | 0.194 | 1.036 | 2.428 | **2.49** | 0.0000 |
| REVERTED | 85 | 15.35 M | 2.318 M | 0.151 | 1.000 | 2.021 | **2.24** | 0.0000 |

1. **The new-recipe run never starves at all; the old-recipe run has small episodes.** Over the full series
   (not the 10-year sampling): new-recipe **max `avgGroceryStarvation` = 0, max `deathsStarvationPerTick` = 0**
   (n = 1879); old-recipe **max = 0.049 and 73 deaths/tick** (n = 2190) — real, but ~200× below the famine
   scale of handover §"0.997 / 1.5e4". Reverted = 0 (n = 1030, y ≤ 85). The population keeps growing in all
   three (10 → 27 M in the oldest). **So the cheaper grocery recipe does not merely raise the average, it
   eliminates the starvation episodes.**
2. **The coverage decay is decelerating, and in the old-recipe run it has turned around**: 4.23 (y10) → 1.55
   (y120) → **1.79 (y182)**. A linear fit is invalid (it would put the crossing at y173, which the run already
   passed while *rising*). The others decelerate too (−1.31, −0.53, −0.45, −0.34, −0.18 … per 10 y early, in
   the reverted run). **No run has crossed coverage 1.**
3. **But the imbalance is structural and visible: the jobs grow slower than the people.** Employed headcount
   +58 % over 172 y (3.77 → 5.96 M) against a population **+170 %**. The employment *share* therefore falls
   0.38 → 0.22 (old) / 0.37 → 0.19 (new) / 0.32 → 0.15 (reverted). The coverage floor is set by this, not by
   a food shortage: grocery fill is 0.998 and the price rises only ~0.4 %/y.
4. **Two levers act on the speed, and the reverted pair makes it worse.** Same recipes, same seed, compared at
   the *same year* (y80): empShare **0.291 pre-revert vs 0.151 reverted**, coverage **4.25 vs 2.25**. The
   reverted run pins the wage at 1.000 (the fairness channel cannot fire because the outside term is
   structurally non-positive, §53) and its employed headcount *shrinks* (3.19 → 2.32 M). So "realistic"
   weights cost the wage lift, and the wage lift is what holds the coverage up — the design tension in one
   line.
5. **The parameter to look at is the bias, not the weights.** `QUIT_OUTSIDE_WAGE_BIAS = 0.9` means a *parity*
   vacancy offer is *always* a worse offer (gap −0.1), so the outside term can never be positive while the
   vacancy wage tracks the going wage — the quit channel is one-sided *by construction*, whichever weights are
   chosen. At bias 1.0 the channel becomes two-sided (parity = 0, premium > 0, its scale set by the JFP), and
   the realistic ordering `outside ≥ fairness` becomes compatible with a wage that can rise. That is a better
   target than re-tuning the sensitivities again.

**Caveat.** 180 y is still the transient region (§46) and the runs carry a ~600 y limit cycle, so
same-year comparisons are the only reliable ones; cross-run slopes are confounded by the seed over-build.

## 56. The bias is realistic; the fall is population dilution; the bank is quietly insolvent

**Correcting §55 point 5.** `QUIT_OUTSIDE_WAGE_BIAS = 0.9` is an *initial willingness* — a 10 % switching
hurdle worth the hassle. So the outside channel is not one-sided; it is a **deadband**: it fires whenever a
posted offer beats the current wage by more than ~11 %. The right question is therefore not the bias but **why
`vacancyWage*` never exceeds the going wage** (firms never outbid each other) — that is what keeps the outside
term dormant.

**Over-build, contraction, or maxScale stagnation?** Facilities tracked from the series (42 of them):

| run | y0.2 | y10 | y30 | y90 | y130 | y170 |
|---|---|---|---|---|---|---|
| `facilityScaleFrac` mean (OLD) | **0.988** | **0.538** | 0.574 | 0.578 | 0.633 | **0.847** |
| jobs (slot capacity) | 5.46 M | 3.39 M | 3.40 M | 3.35 M | 3.63 M | **5.43 M** |
| population | 9.80 M | 10.0 M | 11.2 M | 15.9 M | 20.1 M | 25.4 M |

- **The first decade is entirely the over-build unwind.** The seed starts the facilities at **98.8 % of
  maxScale** and they fall to **53.8 %** within 10 y — a halving. That is the §46 transient, not a contraction.
- **After that it is neither contraction nor maxScale stagnation.** The scale fraction *recovers*, 0.54 (y10)
  → 0.85 (y170), and the jobs grow **+71 %** (3.39 → 5.43 M). The economy sits *below* max and climbs — so it
  is not saturated, and it is not shrinking.
- **It is a demographic race.** Population +190 % against jobs +71 %, so the employment *share* halves by
  dilution. The honest symptom is the **food price roughly doubling** (2.35 → 4.80 by y170, ≈ +2 %/y): food
  per head is falling, and that is what the coverage follows. Not a food *shortage* (grocery fill 0.998) — a
  per-capita squeeze.

**Financials while the employment share falls** (OLD run; interest and write-offs are cumulative — the equity
drop equals interest minus write-offs to 3 digits, so the accounting is consistent):

| y | empShare | debtWriteOffs (cum) | bankruptcies | loanInterest (cum) | **bankEquity** | emergencyLoans (cum) | overLimit loan |
|---|---|---|---|---|---|---|---|
| 0.2 | 0.472 | 0 | 0 | 3.0e5 | **+3.0e5** | 0 | 0 |
| 10 | 0.376 | 2.8e9 | 6 | 8.1e8 | **−1.93e9** | 1 798 | 3.6e9 |
| 90 | 0.228 | 5.2e10 | 91 | 1.26e10 | −3.92e10 | 15 690 | 1.1e9 |
| 190 | 0.215 | **9.2e10** | **129** | 2.21e10 | **−6.64e10** | **21 820** | 7.4e8 |

1. **The bank is insolvent from y10 onwards and stays that way for 180 years**, equity diverging to −6.6e10.
2. **The write-offs run at ~0.47e9/y = 17.6 % of the yearly wage bill** — a large permanent leak — and they
   are **4× the cumulative interest collected**. Firms are *not* near insolvency en masse
   (`companiesNearInsolvent` ≈ 0–5), so this is a continuous flow, not a wave of deaths.
3. **Bankruptcies accumulate steadily** (0 → 129) and **over-limit lending is comparable to the on-book loan
   stock** (`overLimitLoanAmount` 0.6–3.6e9 vs `totalLoans` ≈ 2e9).
4. **There is no solvency constraint on the lender.** That is a modelling gap with a direct consequence: the
   economy is being *held up* by an insolvent, unconstrained bank. "No starvation" is therefore partly a
   property of the lender, not of the real economy — worth remembering before treating the absence of famine
   as a robust result.
5. **The cheaper grocery changes none of this**: the new-recipe run's write-offs and equity are the same or
   slightly worse at the same year. The recipe fix and the bank problem are orthogonal.

## 57. Write-off/GDP is the right scale — and the stagnation has stabilised, the expansion is firing

The write-offs are **bursty** (they jump when a facility is liquidated), so point-in-time ratios swing 0–79 %.
Smoothed as cumulative write-offs over cumulative GDP (trapezoidal on `gdpAnnual`), which is the stable form:

| y | OLD wOff/GDP | OLD int/GDP | OLD int/wOff | OLD equity/GDP | NEW wOff/GDP | NEW int/GDP | NEW int/wOff | NEW equity/GDP |
|---|---|---|---|---|---|---|---|---|
| 20 | 8.8 % | 2.6 % | 0.30 | −1.9 | 10.4 % | 3.9 % | 0.37 | −1.5 |
| 40 | **11.8 %** | 2.4 % | 0.21 | −3.5 | **12.6 %** | 3.9 % | 0.31 | −4.5 |
| 80 | 10.5 % | 2.5 % | 0.23 | −8.4 | 9.8 % | 2.9 % | 0.29 | −5.1 |
| 120 | 9.9 % | 2.4 % | 0.24 | **−10.2** | 10.0 % | 2.8 % | 0.28 | −8.7 |
| 160 | 8.7 % | 2.2 % | 0.25 | −10.0 | 9.0 % | 2.7 % | 0.30 | −8.6 |
| 199 | **7.9 %** | 1.9 % | 0.23 | **−7.0** | 8.6 % (y180) | 2.7 % | 0.31 | −8.7 |

1. **The ~10 % memory is right** — the smoothed write-off/GDP runs 8–12 % and is **improving** (old: 11.8 % at
   y40 → **7.9 % at y199**). GDP is indeed the right denominator: it makes the three quantities comparable.
2. **Interest runs at 0.21–0.31 of the write-offs** — the "1/3" is right, closest in the new run (0.31).
3. **`equity/GDP` is the leverage reading and it peaked at −10.4 (y120–140) and has improved to −7.0/−8.7** —
   the bank's hole is *shrinking relative to GDP* because GDP is outrunning the losses. That is a recovery
   signal, not a worsening one.
4. **The new recipe moved the set point up rather than fixing the leak**: at y20 its GDP is 6.8e9 vs the old
   4.75e9 (**+43 %**) and its coverage is ~2×, but its write-off/GDP is the *same* (~10 %) — orthogonal, as §56
   said. The recipe scales the economy; it does not touch the bank.

**Has the stagnation stabilised? Yes — and the expansion is firing.** End-of-run behaviour:

| run | scaleFrac slope (last ~1 y) | jobs growth | empShare (trough → now) | coverage now | realWage now |
|---|---|---|---|---|---|
| OLD (y199–200) | 0.699 → 0.746 = **+5.3 %/y** | 5.36 → 5.60 M = **+4.4 %/y** | 0.191 (y110) → **0.196** | 1.46 (crash, see below) | 0.25 (crash) |
| NEW (y184.7–185.6) | 0.740 → 0.764 = **+2.7 %/y** | 4.92 → 5.16 M = **+5.3 %/y** | 0.189 → **0.197** | 3.63 → **4.63** | 0.64 → **0.78** |

- **The employment share stopped falling and turned up** (old trough 0.191 at y110; new has just crossed its
  trough), the scale fraction is climbing, the jobs grow 4–5 %/y, and in the new run the coverage and the real
  wage are both *rising* (3.6 → 4.6, 0.64 → 0.78). **The demand caught up and expansion fired — the predicted
  mechanism.**
- **The expansion is intensive only:** the facility count is flat at 42 in both runs — existing plants scale up,
  no new plants appear. If the extensive margin should also open, the candidate-facility signal is where to look.
- **One yellow flag, now resolved:** the old run's final step is a **discrete slam to the wage floor** — 2.076
  → 1.046 in one month (y199.92), leaving the coverage at 1.46 — while employment, population and the scale
  fraction are all *unchanged and expanding*. So it is not an end-of-run artefact: it is the bang-bang cycle's
  downswing, a two-state wage (≈2.1 or ≈1.0), with the capacity expanding straight through it. (Old run
  complete at y200; new at y188; reverted at y115.)


