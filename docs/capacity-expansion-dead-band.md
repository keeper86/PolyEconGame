# Capacity dead band, the plastic chokepoint, and the fatal grocery stock-out

Two failure modes seen on the `singleAgent` 8B / 1000x benchmark, plus one chronic degradation.
They are easy to conflate; keep them apart.

- **Chronic**: the capacity dead band, which stalls expansions for decades (sections 3-4).
- **Degrading**: the plastic chokepoint, which blacks out maintenance and ratchets condition down.
- **Fatal**: a grocery stock-out, which starves the population before maintenance is involved.

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

## Two separate failures, do not conflate them

The episodes above degrade the economy but do not by themselves end it. Run `gate098-6000y`
eventually died differently, and the distinction matters:

```
year    pop(B)   aFacCond  groceryBuffer  groceryFillRate  maintPlasticEff  maintOutput
221.58  25.59    0.9972    0.823          1.000            1.0000           124,972,077
221.92  25.65    0.9958    0.000          0.000            1.0000           126,522,480
222.17  22.32    0.9955    0.000          0.000            1.0000            80,909,208
223.00  15.04    0.9952    0.000          0.000            1.0000            84,561,481
224.00   0.00    0.8475    0.000          0.000            1.0000                     0
```

Condition stays near 1.0 and maintenance output stays healthy (126M, plastic efficiency 1.0)
while 26.8B people starve in about two years. The trigger is `groceryBuffer` going from 0.823 to
exactly 0 within a tick, taking `groceryFillRate` to 0.

Maintenance output only reaches 0 once the population, and therefore the labour force, is gone.
So **maintenance is a victim of the extinction, not its cause**, and the capacity dead band is a
chronic degradation, not the fatal mechanism.

The fatal mechanism is a grocery stock-out: the buffer is allowed to reach exactly zero, and a
single tick at `groceryFillRate = 0` kills the starving cohort immediately because there is no
multi-year dampening on food mortality. That is the failure to chase next.

## Ruled out

- **Order book.** Verified correct: on no-trade ticks the ask sits strictly above the crowd bid;
  when bid crosses ask the book clears fully.
- **Fill-rate and decay targets.** `TARGET_FILL_RATE_SERVICES = 0.7`,
  `TARGET_SELL_THROUGH_SERVICES = 0.8` and `SERVICE_FLOW_DECAY_TARGET = 0.3` are independent
  agents' own targets, and the bid quantity is a multi-tick buffer, so a fill rate below 1 does
  not mean unmet tick need. The apparent contradiction (huge unsold supply beside unfilled
  demand) follows from the producer being oversized, not from the targets.
- **A price gap.** The price explosion during the episode follows from supply hitting exactly
  zero, not from a bid/ask spread. Supply recovers within months once plastic returns.
- **Capacity being too small.** The maintenance facility carries 4-6x demand-to-supply headroom
  for the first 80 years. It is oversized, not undersized.

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
