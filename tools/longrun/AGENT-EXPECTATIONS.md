# Agent expectations vs. what the runs show (2026-10-02)

Premise under test: **the system should survive if every node behaves well enough — there
is no principal shortage.** So any failure is a *behaviour* failure, and it should be
visible as a gap between what an agent ought to do and what it measurably does.

Numbers below are from `compfix10k-s1001` (default, y5–249) via `waveAnalysis --laws`,
`--phase` and a column probe; the behavioural columns are 30-tick samples.

## Physical side is not the constraint (measured)

| quantity | mean | p10 | p90 | reading |
|---|---|---|---|---|
| `foodChainFillRatio` | 0.995 | 1.000 | 1.000 | delivery is complete on average |
| `existentialFillRatio` / `nonExistentialFillRatio` | 0.995 / 0.995 | 1.0 | 1.0 | no systematic rationing |
| `workerUtilization` | 0.995 | 1.000 | 1.000 | **no idle labour — no reserve anywhere** |
| `facilitiesBelowFullMaintenance` | 0 | 0 | 0 | maintenance never starved |
| `avgStorageStarvation` | 0.008 | 0 | 0.017 | input storages are essentially never starved |

So the premise holds on average: goods are delivered and maintained. The failures are
therefore behavioural, and four expectations are measurably violated.

## Follow-up measurements (2026-10-02, default run)

### The price is a ratchet, not a float — measured

Monthly retail price steps (n = 2990):

| statistic | value | reading |
|---|---|---|
| kurtosis of Δln p | **24.8** (3 = normal) | spikey, bang-bang |
| share of months with \|Δln p\| < 0.5 % | 0.36 | frozen |
| share with \|Δln p\| > 5 % | 0.22 | jumping |
| share of all movement carried by the largest 5 % of months | **0.39** | a few jumps dominate |
| `priceFloorHits` > 0 | 2 % of months (max 2) | the hard floor almost never binds |
| `priceCeilHits` > 0 | 0 % | the ceiling never binds |

Relaxation after a price jump — **there is none**:

| after a move | +3 y | +6 y | +12 y | +24 y |
|---|---|---|---|---|
| > 3 % up (n = 434) | **+7.4 %** | +8.4 % | +11.2 % | **+15.9 %** |
| > 6 % up (n = 283) | +8.6 % | +9.7 % | +12.3 % | +18.8 % |

A shortage does not raise the price and then let it fall — it raises the *cost base*
(pass-through 0.82) and the price stays there. The spring is upward-only
(`PMAX_UP` 1.05 vs `PMAX_DOWN` 0.95, brake zone below 1.5×cost active in 89 % of ticks,
ceiling never hit), so the only downward force is the sell-through term, whose authority
is R² 0.002. Structurally upward-biased.

### Categories: food is fine, discretionary is unprotected — measured

Elasticity of `ln(volume/pop)` w.r.t. `ln(foodPrice/income)`:

| category | elasticity | R² | category | elasticity | R² |
|---|---|---|---|---|---|
| Grocery (food) | **−0.48** | 0.15 | Furniture | −0.08 | 0.00 |
| Healthcare | −0.78 | 0.11 | Vehicle | −0.14 | 0.02 |
| Logistics | −0.87 | 0.25 | Electronics | −0.20 | 0.01 |
| Retail (non-food) | −1.57 | 0.13 | Clothing | −0.21 | 0.03 |
| ProcessedFood | −0.57 | 0.08 | Education | −0.35 | 0.00 |

Food's −0.48 is a plausible food elasticity. But the discretionary goods sit at −0.1…−0.25
with **R² < 0.03 — indistinguishable from zero**, i.e. they are *not* visibly cut when food
gets dear, while food itself is cut (relative food spend bears the adjustment). There is
**no priority ordering (food first, luxuries cut first)** in the model.

### No saving propensity — measured

`intergenSurplus` = 0.0000 in every window, including calm ones;
`wealthMonthsMean` 0.054 months (p10 0.013). The buffer variable exists and is structurally
zero. Budget feasibility during the y86–101 famine: `livingCostMonthly` 11.9 against
`livingCostMonthlyFull` 38.6 — i.e. ~31 % of the full basket affordable, against 18 % in
y110–130 (the windows differ in population and price level, so this ratio is not a clean
rationing measure).

## Violated expectations

### 1. Households should self-insure — they hold ~1.6 days of wealth
`wealthMonthsMean` mean **0.054 months**, p10 **0.013**, p90 0.133. With ~1.6 days of
buffer (p10 = 0.4 days) any income interruption is instantaneous starvation, which is why
the famines are cliffs rather than declines. `agentsInDistress` ≈ 0.002 → the distress
mechanism almost never fires before the cliff.

### 2. Household demand should respond to price — the *wanted* demand is insensitive
`ln(wanted demand/pop)` vs `ln(price/income)`: coefficient **+0.06**, R² 0.25 (i.e. flat));
the *realised* volume vs the same ratio: **−0.44**, R² 0.16. Households want the same
quantity at any price; the only adjustment is a budget gate. There is no substitution and
no smoothing, so a price spike passes straight through to starvation
(`starvationSevereFraction` is in phase with `foodPrice`, coherence 0.05).

### 3. Firms should manage inventory with price — the price is pinned by the cost floor
| measure | value |
|---|---|
| `dln(price)/mo` vs sell-through error `(1−ST/1.2)` | 0.018, **R² 0.002** |
| share of ticks with price/cost ≤ 1.5 (spring brake zone) | 0.89 |
| share ≤ 1.2 | 0.24 |
| cost pass-through `dln(price)` vs `dln(cost)` | 0.82, R² 0.25 |

The pricing rule exists and is implemented, but the floor spring dominates it: the offer
price is held inside the brake zone 89 % of ticks and follows cost, so the sell-through
signal — the mechanism that should clear a glut — has no authority (R² 0.002). Goods
cannot be cleared by price; the only remaining clearance is quantity.

### 4. Loss-making agents should contract or exit — they neither exit nor stop
| measure | value |
|---|---|
| `existentialAtLowerBoundFacilities` | **0 always** (never reaches min scale) |
| `existentialNegativeProfitFacilities` | mean 0.37, max 7 |
| `companiesDeepLoss` | mean **12.6** of ~40, p90 **20** (≈31 %, p90 50 %) |
| `companiesContracting` | mean 22.4 (p10 14, p90 30) |
| `expansionBlockedByProfit` | mean 0.085, max 12 |

A third to a half of companies are in deep loss on average and *keep producing* at or
below cost, financed by transfers/loans (no exit path, min scale never reached). Note the
contradiction with expectation 3: they don't cut losses by stopping, and they don't cut
losses by pricing either.

### 5. The core defect: buffer and actuator timescales mismatch by ~1.5–2 orders of magnitude

Measured on the default run (monthly samples; the storage error is recovered by inverting
the controller's own signal, `inventory_months = 3 − atanh(signal)`, since zoom = 1 month
of capacity):

| node | storage held | target | spread |
|---|---|---|---|
| grocery | **2.97 months** | 3 | p10 2.64, p90 3.25 — inside [2,4] months 93 % of the time |
| food processor | 3.31 | 3 | p10 1.94, p90 5.66 — 67 % |
| limestone quarry | 2.95 | 3 | **p10 0.04**, p90 6.00 — only 19 %, signal saturated 74 % of ticks |

So the "scale goes with storage" premise holds tightly, and the *target* buffer is honoured
downstream — but the *raw-material* storages empty (p10 = 0.04 months).

The actuator, however, is slow: the median operating-scale move is **0.16 %/month**
(grocery) and **0.42 %/month** (food processor), max 2–3 %/month. Moving 40 percentage
points of scale therefore takes **95–250 months (8–20 years)**. The nominal PID limit
(0.002/tick = 6 %/month) is 15–40× faster than the realised response because the signal is
small (sd 0.31) and the gates cap it.

**Buffer covers 3 months; the response needs 8–20 years.** That mismatch is the structural
defect: the excursions necessarily exceed the buffer, so the *nonlinear* walls fire — the
price floor/ratchet, the profit gate, the contraction gate — and those are what kill the
economy. It also explains why a damping-based story kept failing: our ζ ≈ 0.05–0.07 is not
the binding constraint; the safety margin is.

### 6. Collapse is a multi-year process, not a blip — confirmed

Longest unbroken runs (months) before each extinction:

| run | end | fill<0.5 | fill<0.8 | severe>5 % | fatal>0.5 % |
|---|---|---|---|---|---|
| default | y249.2 | 33 | **107** | 114 | 42 |
| springlow | y151.7 | 44 | 44 | 27 | 34 |
| groceryspring | y292.6 | 45 | 96 | 26 | 35 |
| zoom2 | y182.9 | 52 | **128** | 75 | 17 |
| pairlm | y69.9 | 29 | **127** | 25 | 27 |
| floor 1.0 (survives) | y300 | 20 | 72 | 42 | 14 |

Every extinction is preceded by 8–10.7 years of production below 80 % of demand. No death
in any run followed a short outage. The surviving floor-1.0 arm still has multi-year
episodes — it just recovers from them.

### 7. Constructive interference — confirmed, with roles

Affordability = `foodPrice` / per-capita income, split into a fast band (residual) and a
slow band (40-year centred mean). Percentile of each at famine onsets:

| run | onsets | fast-band pct | slow-band pct | both > p70 | independent expectation |
|---|---|---|---|---|---|
| default | 12 | **0.89** | 0.61 | 0.42 | 0.09 |
| floor 1.0 | 16 | **0.87** | 0.72 | 0.50 | 0.09 |
| groceryspring | 29 | **0.84** | 0.74 | 0.59 | 0.09 |

The fast band triggers, the slow band modulates: co-occurrence is 5–6× more frequent than
independent, and the onsets happen 25–31 y after the slow-band minimum (random: 20 y).

### 8. Neighbour visibility — supported, but only at the investment horizon

Correlating the downstream outcome with the neighbour's *public* state:

| neighbour signal (5-year means) | r vs food-chain fill | r vs maxStorageStarvation |
|---|---|---|
| `facilityMaxScale_limestoneQuarry` | 0.08 | **−0.45** |
| `facilityMaxScale_coalMine` | 0.09 | **−0.43** |
| `facilityScaleFrac_limestoneQuarry` (operating) | −0.17 | — |
| `facilityScaleFrac_coalMine` (operating) | 0.09 | — |

The neighbour's **capacity** (maxScale) carries information about the sustained shortage
(r ≈ −0.45, the expected sign); its momentary **operating scale** does not. The
fill-rate route is a dead end (|r| ≤ 0.12, and fill is ≈0.995 almost always — a censored
target, so that test is weak by construction).

Conclusion for the model change: a neighbour signal is worth adding to the **investment**
decision (2.5 %/yr ramp, 5-month authorisation gate), where the timescales match — not to
the fast inventory PID, where the local buffer already decouples the nodes.
### 9. The contraction gate sheds capacity far too eagerly (paired round)



`pairlm` lowered the contraction authorisation threshold from 15 to 5 (a 5-month wait →
1.7 months) in a world otherwise identical to `pairctl` from y50. Result: extinct at
y69.92, 20 years later. Mechanism (measured, y52–69): raw-material facilities shed
40–75 % of their **capacity** (`facilityMaxScale_copperMine` 0.25×, `limestoneQuarry`
0.40×, `coalMine` 0.48×, sand 0.55×, cotton 0.57×, iron 0.65×) while their *utilisation*
rose (copper 1.37×), i.e. they ran flat out on a capacity that no longer existed. Coal
×3.8, retail food ×3.2, severe starvation ×10.6, population ×0.70, then death. The
expansion gate can only rebuild at 2.5 %/yr what the contraction destroyed at 1 %/yr with
a 3× shorter authorisation. So the two gates must not be symmetric: the contraction arm
needs a *longer* memory and/or a smaller shrink step, and a shrink should be recoverable.

Expected behaviour for a firm: shed *output*, not *capacity*, while the loss is cyclical;
only write capacity down when the loss persists for years. Measured: capacity is written
down within months.

### 10. The inventory controller's lead sets the dominant timescale (paired round)

Same paired world, `--storageTrendMonths` 1 month → 10 days: the dominant foodPrice mode
moved from **T 11.9 y to T 56.9 y** (a factor 4.8) with a 1.41× noisier signal and a 1.4×
famine rate, while the operating-scale gain stayed put (0.996×). So the fast inventory
loop and the slow capital loop are not separable: the inner loop's *phase lead* decides
which timescale the economy rings at. The measured reality contradicts the earlier
"the wave is the slow capital loop" framing.

### 11. The capacity controller should damp — instead it is anti-phase

`--laws`: `dln(scale)/yr = a + b·signal` gives b 0.179, R² 0.71 for the grocery (0.170 /
0.63 for the food processor) — so the storage signal *is* used, the controller works. But
b falls to 0.048 (R² 0.15) when the realised margin falls to 0.5 (the gate): the
corrective loop loses authority exactly when it is needed. And `--phase` at the dominant
mode T = 14.2 y shows `existentialContractionIntegral` at −6.3 y and
`companiesProfitable` at −5.6 y against `foodPrice` — i.e. **profitability and contraction
pressure are about half a period out of phase with the price.** Because expansion is
profit-gated, the capacity response therefore arrives half a period late: the classic
negative-damping term that sustains the oscillation.

## What "behaving well enough" would look like (candidate single changes, one at a time)

1. A household buffer (`wealthMonthsMean` ≫ 0.05) so an income dip is not instant hunger.
2. A price that can move *below* the brake zone when sell-through says glut — decouple the
   floor from the offer so the controller regains authority (this is exactly what the
   `--costFloorBuffer` arms probe).
3. An exit/floor-low path for deep-loss agents (min scale reached, or capacity written
   down) so over-capacity is actually shed.
4. Phase alignment of the investment signal (shorten the capacity response so it is less
   than half a period behind the price, or damp it when the margin is thin).

Items 1–3 are *behavioural* changes, not resource changes, which is the point: the runs
show no principal shortage, so the fix must be in the decision rules.
