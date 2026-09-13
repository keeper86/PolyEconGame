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
