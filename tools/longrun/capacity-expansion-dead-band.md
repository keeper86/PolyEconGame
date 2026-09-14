# Capacity dead band, the plastic chokepoint, and the fatal grocery shortfall

Three things seen on the `singleAgent` 8B / 1000x benchmark. They are easy to conflate; keep them
apart.

- **Chronic**: the capacity dead band, which stalls expansions for decades (sections 3-4).
- **Degrading**: the plastic chokepoint, which blacks out maintenance and ratchets condition down.
- **Fatal**: a sustained grocery shortfall fed by an intermittent beverage input, which drains
  the grocery buffer and starves the population while maintenance is still healthy.

## Symptom: the recurring condition collapse

Population grows for ~150 years. On the path it suffers repeated condition collapses; taking the
y156 episode of run `gate098-6000y`, at monthly resolution:

```
year    avgFacCond  maintPrice  maintFill  maintSupply  maintUnfilled
156.33  0.9600       45.05       0.00          0      2.4e+10
156.50  0.8828       83.57       0.00          0      1.0e+11
156.75  0.7170      127.03       0.00          0      1.2e+11
157.08  0.5456      207.41       0.00          0      8.3e+10
158.00  0.7045       73.74       0.35    1.19e+08   2.2e+08
```

Condition falls 0.96 -> 0.51 in about 1.2 years. Maintenance **supply goes to exactly zero**
for roughly five months while unfilled demand reaches 50-100 billion (normal demand is ~9e7,
so 1000x). The facility is not decaying: it is starved. A facility loses 0.5 condition per year,
so 0.96 -> 0.51 is consistent with a full year without repair.

## Mechanism

### 1. A single shared input starves

Maintenance needs steel, electronics and plastic. Around the collapse only plastic fails:

```
year    maintOutput  inputEff(Steel)  inputEff(Electronics)  inputEff(Plastic)
156.25   96525933        1.0000              1.0000               1.0000
156.33          0        1.0000              1.0000               0.0000
156.50          0        1.0000              1.0000               0.0000
157.25   97194970        1.0000              1.0000               1.0000
```

Output follows the plastic efficiency one-to-one. The maintenance facility's own condition
stays at 0.94-0.96 throughout: it is healthy and simply has nothing to consume.

### 2. Why plastic fails: its producer is pinned at its capacity ceiling

Plastic demand multiplies while the plastics factory cannot add capacity:

```
year    plasticPrice  plasticFill  plasticMarketSupply  plasticMarketDemand  plasticsScaleFrac
155.50      9.76         0.041          6.18e+09             2.79e+08             1.0000
156.17     10.13         0.000          7.31e+08             3.06e+08             1.0000
156.42     74.64         0.257          2.47e+08             9.62e+08             1.0000
157.08    193.87         0.148          1.46e+08             9.86e+08             1.0000
157.42    216.64         1.000          4.44e+08             4.39e+08             1.0000
```

`plasticsScaleFrac` is exactly 1.0000 the whole time: the factory runs at its maximum and
never expands. Plastic price rises 22x, demand outruns supply, and the maintenance producer's
plastic buffer drains from 1.25e8 to exactly 0.

### 3. The capacity dead band

The expansion gate required `scale >= maxScale * 0.999` before it would arm:

```js
const atMaxScale = facility.scale >= facility.maxScale * 0.999;
if (atMaxScale && signal > 0 && hrHealthy && storageHealthy) {
    state.expansionIntegral += STORAGE_EXPANSION_RATE;
} else {
    state.expansionIntegral = Math.max(0, state.expansionIntegral - EXPANSION_INTEGRAL_DECAY);
}
```

Two things keep a saturated facility from arming:

- **The PID can freeze just under the gate.** `state.filteredError` decays geometrically
  (`0.7^n`) once the signal reaches zero, so the derivative term leaks an ever-smaller delta
  (`-1.05e-3 -> -5.97e-5 -> -4.77e-8 -> ... -> -5e-39`) and `scale` stops changing within
  float64 resolution at an arbitrary `scaleFrac`, typically 0.9929-0.9931. `atMaxScale` is then
  false and the integral _decays_ instead of accumulating.
- **`signal > 0` is also required**, and at full scale the flow signal is often exactly 0.

Growth is therefore driven by occasional signal excursions rather than by demand, producing long
irregular stalls:

```
Maintenance Facility expansion gaps (years), y150-205:
  gate 0.98:  [3.7, 3.8, 22.9, 3.8, 15.7, 3.9, 18.4, 4.0]
  gate 0.999: [3.7, 3.8, 23.1, 3.8, 24.3, 4.5, 21.2, 3.9, 34.3, 3.9, 10.2, 4.2, 48.1, 4.1, 13.4]
```

The normal cadence is ~4 years for +10%, ahead of ~2.4%/yr demand growth. The 16-48 year stalls
are the pathology.

### 4. Why the degradation is permanent rather than self-correcting

The plastic shortage lasts months, and maintenance supply recovers. But a facility that misses a
year of maintenance loses condition, and `maxMaintenance` ratchets down irreversibly
(`MAX_MAINTENANCE_DEGRADATION_PER_REPAIR_CYCLE` per repair cycle) with `maintenanceStatus`
clamped to it. Each episode permanently lowers the achievable condition of every facility, so
repeated plastic episodes compound.

## The fatal mechanism: a beverage-input shortfall drains the grocery buffer

Run `gate098-6000y` died at y224 with condition near 1.0 and maintenance healthy, so maintenance
is a victim of the extinction, not its cause. A per-tick probe of the same run window (resumed
from the y400 checkpoint with `TICK_PROBE=1`) shows what actually kills it.

Monthly view (from `series.csv`):

```
year    grocDemand    grocSupply    fill   buffer   beverFill
427.83  4,913,994,290  2,861,015,297  0.582  0.036    1.000
428.33  3,349,854,385    384,264,981  0.115  0.548    0.000
428.75  2,940,811,106  2,961,405,814  1.000  0.741    0.053
429.00  4,445,422,073  2,242,752,599  0.505  0.139    0.061
429.50  3,413,939,315  1,031,361,282  0.012  0.510    0.434
```

Grocery supply (~2.8e9) sits persistently below demand (~4.3e9) for months, so the buffer
drains 0.74 -> 0.14 and the population falls 87.2B -> 82.9B. The grocery chain is input-limited:
`market_Beverage_fillRate` is intermittently exactly 0.

Important measurement trap: `groceryTotalSupply` reads exactly 0 in the monthly series at some
ticks, which looks like a month-long market outage. Per-tick data from the probe shows the
opposite:

```
window y429.000-429.083 (one month, 31 ticks):
  effQty0 == 0  :  1 tick
  effQty0  > 0  : 30 ticks, mean offer 2.78e9
whole probe window: 0.9% of ticks have a zero offer
```

The grocery chain sells its whole inventory on most ticks and therefore has nothing to offer on
the next one. Zero offers are sparse single-tick events, not month-long outages; a monthly
sampler can land on one and misreport the month. **Read per-tick data before concluding a market
failed.** The starvation is real, but it comes from a sustained stock deficit, not from a supply
outage or an order-book fault.

## Root cause: intermittent bidding makes the whole chain oscillate

Everything above shares one cause, visible only per tick. Take the Beverage Plant at y429
(resumed y400 checkpoint, `TICK_PROBE=1`, full input columns):

```
tick     offered      sold     inv0        inEff0..4
154440  74,635,241  74,635,241  74,554,305   all 1.0000
154441  74,554,305           0 183,405,841   all 1.0000
154442 183,405,841           0 307,466,324   all 1.0000
154443 307,466,324 307,466,324 128,584,966   all 1.0000
154444 128,584,966 128,584,966 129,786,693   all 1.0000
154445 129,786,693           0 259,722,571   all 1.0000
```

All five inputs are fully available on every tick, and it offers on every tick. But sales clear
only about every third tick: on the middle ticks it sells nothing because **nobody bid**.
Measured over the whole probe:

```
Beverage_Plant : zero offer 0.0% of ticks, inputs 1.0 throughout, output 74M..390M swinging
Water_Facility : zero offer 0.0% of ticks, offers 5.5e11, sells 2.4e6 (236,000x glut)
Grocery_Chain  : zero offer 0.9% of ticks, but inEff1(beverage) == 0 on ~50% of ticks
```

The bid-side driver is `bidStorageTarget`: an agent bids to fill its multi-tick input buffer,
and once the buffer is above target `bidStorageTarget` becomes 0 (see `automaticPricing.ts`,
the `aggregatedBuyTargets` path), so no bid is placed on subsequent ticks until consumption
draws the buffer back down. Bidding is therefore on/off with a period of a few ticks.

The chain closes like this:

```
buyer bids only every few ticks
-> producer sells only on those ticks, inventory and output swing
-> downstream sees inputs arrive lumpily (inEff flips 0 and 1)
-> services cannot smooth it, because they decay at SERVICE_DEPRECIATION_RATE_PER_TICK
-> output of the service oscillates
-> the critical buffer drains below demand for months
-> starvation
```

This is why input "fill rates" for basic commodities like water read 0.0, 0.36, 0.81, 0.0 on
consecutive months while water is oversupplied 236,000x. Those numbers measure per-tick bid
satisfaction on a bursting bid schedule, not scarcity. They are the same sampling alias as the
`groceryTotalSupply = 0` reading, seen from the other side.

So the recurring failure is: **one oscillating bid/sell cycle, propagated through a chain whose
services cannot buffer.** The plastic episode, the maintenance blackout and the grocery shortfall
are all instances of it. The lever is either to damp the bidding cycle or to give services enough
effective buffering that lumpy delivery does not reach the population.

## Ruled out

- **Order book.** Verified correct: on no-trade ticks the ask sits strictly above the crowd bid;
  when bid crosses ask the book clears fully.
- **Fill-rate and decay targets.** `TARGET_FILL_RATE_SERVICES = 0.7`,
  `TARGET_SELL_THROUGH_SERVICES = 0.8` and `SERVICE_FLOW_DECAY_TARGET = 0.3` are independent
  agents' own targets, and the bid quantity is a multi-tick buffer, so a fill rate below 1 does
  not mean unmet tick need. The apparent contradiction (huge unsold supply beside unfilled
  demand) follows from the producer being oversized, not from the targets.
- **A price gap.** The price explosion during the maintenance episode follows from supply hitting
  zero, not from a bid/ask spread. Supply recovers within months once plastic returns.
- **Capacity being too small.** The maintenance facility carries 4-6x demand-to-supply headroom
  for the first 80 years. It is oversized, not undersized.
- **Month-long market outages.** `groceryTotalSupply = 0` in the monthly series is a sampling
  artifact: only 0.9% of ticks actually place no offer, and the zero months shown above contain
  30 selling ticks out of 31. Before concluding that a market failed, read per-tick data.

## Fix and open work

`EXPANSION_AT_CAPACITY_FRACTION = 0.98` replaces the hard-coded 0.999, clearing the band a
settled facility occupies. This is a free parameter with respect to the Spiegler-Naim limit-cycle
condition: `Tw/Tp` derives from `PID_OUT_MAX_UP` and `STORAGE_TARGET_MONTHS` only.

The gate relaxation is necessary but not sufficient:

- **Input-buffer resilience.** The maintenance producer holds only
  `INPUT_BUFFER_TARGET_TICKS_SERVICES = 3` ticks of plastic cover, so a price spike it declines to
  chase empties the buffer within months and takes maintenance output to zero.
- **The `signal > 0` requirement.** A facility pinned at capacity with `signal == 0` still cannot
  arm, so the gate is not the only blocker.
- **Services have no capacity-headroom term** in the flow signal, so a saturated service facility
  registers need only after it has already failed to meet demand.

## The slow oscillator is the fuel refinery's capacity controller

The long-run sawtooth (condition 0.99 -> 0.78 -> 0.99 on a 4-35y period) is driven by the fuel
refinery, not by the fast bid cycle. Fuel is the input of `logisticsHub`
(`{fuel, 90}/tick`), logistics is the input of the whole population-facing chain, so a fuel
collapse propagates: `fuelFill = 0 -> logiSupply = 0 -> logiUnfilled = 100% of demand -> condition
collapse`. On run `head-6000y` the fuel refinery scale swings **mean 4.6M, min 0.33M, max 30.6M
(cv 1.16)**; the same pattern appears as `market_Fuel_fillRate = 0` exactly whenever
`market_Logistics_supply = 0`.

### It is not scarcity

`oilReservoirLeft` moves 209e9 -> 93e9 over 400 years (no depletion), `crudeFill` is often 1.000
while `fuelFill = 0.000`, and `fuelPrice` stays 2-5 (only 204/236 by year 380+). The fuel refinery
is never starved of crude and never sees a scarcity price. The oscillation is in the **controller**.

### Two separate variables: operating `scale` (flow) and capacity `maxScale` (ratchet)

The autoscale block holds two distinct quantities and they must not be conflated:

- **Operating `scale`** is the continuous flow, updated every tick as
  `scale += computePidDelta(signal, state) * maxScale`, clamped to
  `[MIN_SCALE_FRACTION * maxScale, maxScale]` (`automaticProductionScale.ts`). Both rate limits are
  symmetric: `PID_OUT_MAX_UP = PID_OUT_MAX_DOWN = 0.005`, and the PID output saturates for any
  `|signal| >= 0.005 / PID_KP = 0.05`. So `scale` is a **rate-limited ramp that saturates in both
  directions** — a relay, travelling the whole legal range `[0.25, 1.0]` per cycle.
- **Capacity `maxScale`** changes only by the gated expansion jump (`EXPANSION_AT_CAPACITY_FRACTION`,
  expansion integral threshold, funds) plus the rare `processFacilityContraction`. It is a
  **monotone ratchet upward** in normal operation.

Facilities where both columns exist show the relay dwell (fraction of months within 1% of a clamp):

```
ironSmelter : at ceiling 57.2%  at floor 16.0%  mid 26.8%
sandMine    : at ceiling 73.6%  at floor  3.1%  mid 23.3%
coalMine    : at ceiling 69.4%  at floor 11.1%  mid 19.6%
ironMine    : at ceiling 66.9%  at floor 15.5%  mid 17.7%
```

60-75% of the time the operating scale is pinned at the ceiling and only 18-27% is in transit; the
amplitude is set by the clamps (`floor/ceiling = 1/MIN_SCALE_FRACTION = 4.0`, measured 4.0-4.4x),
not by a dynamic gain.

### The cycle grows because maxScale ratchets past demand

The relay amplitude is fixed, but the capacity ratchet is not. `ironSmelter` in the window
y260-300 shows `operScale/maxScale` slamming between 1.000 and 0.250 while `maxScale` only rises
(2.98M -> 3.08M -> 3.37M -> 4.07M). As capacity ratchets up on the surplus half of each cycle and
never comes back down, the plant converges to a fast, shallow relay: the peak keeps climbing
(fuel refinery 1.3M -> 29M, 22x) while the period collapses (34y -> 4y).

```
 #   y     trough      peak      period
 1   99.2      928585   2077778    34.4
 2  208.2     1951082   3756399   108.9
 9  282.8     1808098   7944166    10.7
14  402.2     7555187  19425729     9.3
20  428.1     6929030  29271668     3.9
```

### Measured return-map eigenvalue: the cycle sits on the unit circle

`tools/_cycle_gain.py` fits the sampled return map
`x_k = (scale/maxScale, ln maxScale)` at deep troughs, in the sense of Flieller/Riedinger/Louis,
"Computation and stability of Limit Cycles in Hybrid Systems": a hybrid limit cycle is locally
stable iff the eigenvalues of the sampled map's Jacobian lie **inside** the unit circle. The trough
`scale/maxScale` is pinned to the `MIN_SCALE_FRACTION` floor (median exactly 0.2500 for
`ironSmelter`), so that coordinate is constant on the attractor and the cycle is effectively a 1-D
map in `ln(maxScale)`; its gain is the ratchet entry `a11`.

Per facility on `head-6000y`:

```
facility      cycles  period1  periodN   |lambda|   verdict    A
ironSmelter      73      4.9      3.6      1.004   UNSTABLE   [[0.227,0.013],[0.076,1.003]]
sandMine         75      3.6      3.5      0.969   stable     [[0.244,-0.048],[0.022,0.970]]
coalMine         56      3.9      2.1      0.970   stable     [[0.260,-0.059],[0.027,0.972]]
ironMine         53      4.3      7.0      0.988   stable     [[-0.053,-0.028],[0.464,1.000]]
```

Sweeping every long-run series that carries the `(Scale, MaxScale)` pair
(`tools/_cycle_gain_sweep.py`, 339 facility-cycles over 113 runs) gives **median |lambda| = 0.982,
83/339 above 1.0** (the excess above 1.0 is concentrated in short runs where the OLS fit is
ill-conditioned). Restricting to well-sampled long runs (>= 600y) gives **median 0.980, 35/56 in
[0.95, 1.05], 5/56 above 1.0**. The scatter is facility- and seed-dependent and straddles the unit
circle.

So the cycle is not strongly unstable; it is **marginally stable, sitting on the unit circle**. That
is why the period random-walks (34y -> 4y, then back) instead of either locking or diverging: a
marginal eigenvalue plus noise gives exactly the wandering period and slowly rising peak we see.
The `period_gain` (median 1.02-1.04) is the weak second mode, the sensitivity of the state to the
switching times in the paper's `dx/dt_i` term.

### Fix implied

The relay amplitude is not the problem; the **capacity ratchet** is. `maxScale` changes in only
~1.3% of months (67/5276 for `ironSmelter`), median +5-10% per change, net 12-19x over the run, and
the down-steps are rare (28-70 over the whole run against 39-55 up-steps on the same columns). Gated
expansion fires whenever the operating scale has been pegged at the ceiling with a positive signal,
so a plant that is momentarily short ratchets capacity up, and the down-path almost never undoes it
when the surplus half of the cycle arrives. Because the marginal eigenvalue is at 1, the smallest
push moves a run between the stable and unstable side. Two levers, in order of expected effect:

- **Give the ratchet a down-path.** Capacity contraction is gated behind
  `CONTRACTION_INTEGRAL_THRESHOLD` and bounded by the tiny `MAX_SCALE_CONTRACT_FRACTION = 0.005`,
  so it effectively never fires. A capacity that can only grow turns each surplus half-cycle into
  permanent oversupply and shrinks the period toward the relay's own transit time.
- **Damp the relay so it stops pegging the clamp.** The PID saturates for `|signal| >= 0.5` after the
  PID_KP rescale, so the operating scale is bang-bang rather than proportional, and `atMaxScale` arms the expansion jump
  almost every time the signal turns positive. A wider proportional band (smaller `PID_KP` relative
  to `PID_OUT_MAX`) or a dead-band around the ceiling would stop the short-lived peaks from arming
  expansions.

### Applied

PID gains rescaled 10x to widen the linear band (Spiegler & Naim 5.4, the "lower-than-unity pure
gain" compensation). PID_KP 0.1 to 0.01, PID_KI 0.001 to 0.0001, PID_KD 0.01 to 0.001,
PID_IMAX 0.025 to 0.0025. PID_OUT_MAX stays 0.005 (bounded by the output buffer), so the
saturation point moves from |signal| about 0.05 to about 0.5: the controller now runs in its
proportional region over the operating range and the floor clamp engages far less, which is the
paper's recipe for removing the limit cycle rather than merely damping it. The Tw/Tp guard is
unchanged because it derives from PID_OUT_MAX_UP, not the gains.

### Storage shrink is lethal (negative result)

A 200-year 10M single-agent control at `STORAGE_TARGET_MONTHS=12` survives to the end (condition
drops to 0.613 but population lives) and reproduces the fuel/logistics/condition collapse at y160-180.
The same run with `--storageTargetMonths=6` (the Spiegler-Naim "overdamped" side of the Tw/Tp
band, Tw/Tp = 200/180 = 1.11) goes **population extinct at y94.7**. The 6-month buffer was not the
problem: it was the cushion. Shrinking it halved the inventory a facility holds, so a brief logistics
fill flicker (0.87-0.99, the same relay that is always present) drains the grocery buffer in about one
year and the population starves to zero. The single-echelon OUT-policy stability band does not
transfer to this multi-echelon buffered chain: the 12-month target is load-bearing and must not be
reduced. The fuel/relay oscillation is not removed by shorter lead time, only the resilience to it.

### Phase-plane probe: it is a relaxation oscillator, not a relay (prediction falsified)

`TICK_PROBE=1` per-tick `(smoothedSignal, scaleFrac)` for the fuel refinery (60y single-agent run,
`pid-probe-60y`) shows the true mechanism, and it is a **rate-limited integrator with symmetric
clamps**, not relay-with-hysteresis. I predicted "rate-limited ramp, no hysteresis, on/off at the
same threshold" — half right, and the wrong half is informative:

- The operating scale is a ramp capped at `+/-PID_OUT_MAX` (measured max per-tick dscaleFrac =
  0.00500 exactly) and welded to the `MIN_SCALE_FRACTION` floor (0.2500) and the `maxScale` ceiling.
- There is **no hysteresis**: the on/off threshold is the same in both directions — the scale starts
  climbing when `signal` crosses zero positive and starts falling when it crosses zero negative.
- What looks like hysteresis is **dead time**: the signal `softClip = tanh` saturates and is pinned at
  about `-0.083` (its running minimum) for the whole descent, so the scale slams into the floor and
  sits there while the (saturated) signal slowly re-integrates through zero.
- The escape is not capacity contraction: `contractionIntegral` never arms (stays ~0), `maxScale`
  stays fixed, and the scale only climbs again when the demand signal crosses positive.

So the bang-bang is a **relaxation oscillation**: a slow integrating signal (saturated by tanh,
so the controller loses all proportional information past |error| ~ 2.5x target) driving a
rate-limited, clamp-bounded scale. The known fix for a relaxation oscillator is to remove the
saturation that makes it slow-fast: drop `softClip`'s tanh so the error stays linear, and/or soften
the `MIN_SCALE_FRACTION` wall, so the controller pulls back proportionally instead of slamming
clamp-to-clamp.

### Removed A1 + rebalanced C2 (step 1)

Two hacks removed/balanced, based on the phase-plane + `contractionIntegral` evidence:

- **A1 removed**: the one-sided cross-zero reset `if (signal>0 && integral<0) integral=0` in
  `computePidDelta` is gone. It was the "heal too much contraction" guard that wiped a wound-down
  negative integral the instant demand returned, so the down-path could never accumulate.
- **C2 rebalanced**: `CONTRACTION_INTEGRAL_DECAY` 0.5 -> 0.05 (now symmetric with expansion, so the
  contraction integral no longer leaks away 10x faster than it charges) and
  `CONTRACTION_INTEGRAL_THRESHOLD` 30 -> 15 (the measured peak was 29.9, one tick short of firing).

`MIN_SCALE_FRACTION` floor, `PID_KP` rescale and the expansion-side guards are untouched. Control is
`pid-retune-200y` (12-month, condition collapsed to 0.613 but population survived); experiment is
`pid-remhack-200y`. Prediction: capacity contraction now actually fires, so the fuel refinery stops
being welded to the 0.25 floor and the up-only ratchet asymmetry is removed.

### Result: A1 + C2 fix removes the lethal cascade (condition holds)

`pid-remhack-200y` vs control `pid-retune-200y`, both 200y 10M single-agent:

```
                   min condition   final condition   max logiUnfilled   fuel swing
control (old hacks)    0.613           0.613           5.42e7            18x
experiment (fix)       0.989           0.996           2.39e7            32x
```

Prediction scorecard: **right** that the up-only ratchet was what made a transient shortage
lethal (condition no longer collapses, 0.989 floor vs 0.613). **Wrong** that the relay amplitude
would shrink: the fuel swing went 18x -> 32x because capacity contraction now works, so `maxScale`
shrinks further and the (unchanged) 0.25 floor sits lower, widening the operating-scale swing. The
bang-bang relay is still present and still visits the floor, but it is no longer fatal. Next candidate,
if we want to remove the oscillation itself, is the `MIN_SCALE_FRACTION` floor / the rate-limited
integrating signal - now a benign amplitude question, not a survival question.

### Step 2: soft lower bound (SOFT_FLOOR_RELAXATION = 0.5)

Replaced the hard `Math.max(minScale, ...)` floor with a soft one: below `minScale` the downward
delta is attenuated by `SOFT_FLOOR_RELAXATION` (0.5) instead of being clamped, never below zero.
This removes the relaxation wall the scale slams into, which fed the floor-to-ceiling relay. Run
`pid-softfloor-200y`, baseline for this step is `pid-remhack-200y` (condition holds at ~0.99, no
starvation). Prediction: the operating fraction stops pinning at exactly 0.25 and idles more
graduated; the relay amplitude (fuel swing ~32x on remhack) should shrink. Not a survival question
anymore - this is about taming the remaining bang-bang.

### Step 3: soft ceiling via EXPANSION_AT_CAPACITY_FRACTION 0.98 -> 0.85

The top wall was still hard: `EXPANSION_AT_CAPACITY_FRACTION=0.98` meant the plant had to be
pinned at the ceiling before expansion could arm, which *incentivised* dwelling at maxScale (the
softfloor run showed ceiling dwell rise to 66%). Lowering the gate to 0.85 arms growth while the
plant is 85% utilised, so capacity grows before the scale slams into the ceiling. Runs:
`pid-softfloor-200y` (soft floor only, 0.98) vs `pid-softfloor-0.85-200y` (soft floor + soft
ceiling), baseline `pid-remhack-200y`. Prediction: ceiling dwell falls from ~66% toward the transit
band, and the operating scale stops gluing to 1.0.
