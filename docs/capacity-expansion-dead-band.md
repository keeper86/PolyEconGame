# Capacity expansion dead band

## Symptom

Facilities stalled for decades without expanding, despite demand growing every year.
Measured on the `singleAgent` 8B / 1000x benchmark, resuming the y150 checkpoint:

```
Maintenance Facility: +10% expansions at y150.0, y153.3, y157.4, then nothing until y184.5
                      (a 27.1 year gap while scaleFrac stayed at 1.0000)
```

Dead-band occupancy — share of ticks spent at `0.99 <= scale/maxScale < 0.999`, the band in
which the expansion gate is closed:

| facility              | dead band | at capacity | below 0.99 |
| --------------------- | --------- | ----------- | ---------- |
| Maintenance Facility  | 36.6%     | 63.4%       | 0.0%       |
| Construction Facility | 17.7%     | 70.1%       | 12.3%      |
| Grocery Chain         | 5.3%      | 10.3%       | 84.4%      |
| Glass Factory         | 0.4%      | 97.4%       | 2.3%       |

The facilities that stall are the ones that live permanently at their ceiling.

## Mechanism

Three effects stack.

### 1. The PID freezes `scale` by floating-point exhaustion

```js
state.filteredError = PID_D_ALPHA * signal + (1 - PID_D_ALPHA) * state.filteredError; // alpha = 0.3
```

When `signal` becomes 0, `filteredError` decays geometrically (`0.7^n`) and never reaches zero.
The derivative term keeps emitting an ever-smaller delta:

```
delta: -1.05e-3 -> -5.97e-5 -> -4.77e-8 -> -3.80e-11 -> ... -> -5e-39
scale: 693718.98 -> 693579.91, then frozen (updates fall below float64 resolution)
```

`scale` ends up pinned at an arbitrary `scaleFrac` just under the gate, with `delta * maxScale`
far below the smallest representable change to `scale`.

### 2. The signal is exactly zero while the facility has capacity headroom

`serviceFlowError` measures _planet-wide market_ unfilled demand, not this facility's own
shortfall. Once the market clears and decay is covered, the error is exactly 0 — regardless of
how little spare capacity the facility has.

The result is a perverse oscillation:

```
scaleFrac 1.0000 -> signal +0.72   (scale clamped at capacity, so demand shows as unfilled)
scaleFrac 0.9930 -> signal  0.00   (market clears, no signal, scale frozen)
```

The facility is effectively rewarded for sitting below full capacity.

### 3. The gate demands a state the controller never produces

```js
const atMaxScale = facility.scale >= facility.maxScale * 0.999;
if (atMaxScale && signal > 0 && hrHealthy && storageHealthy) {
    state.expansionIntegral += STORAGE_EXPANSION_RATE;
} else {
    state.expansionIntegral = Math.max(0, state.expansionIntegral - EXPANSION_INTEGRAL_DECAY);
}
```

Expansion requires `scaleFrac >= 0.999`, but with `signal = 0` the controller has no reason to
move `scale` at all. The integral therefore _decays_ rather than accumulating, and expansion can
never arm. `PID_OUT_MAX_UP` is 0.005, so the 0.999 threshold sat inside a band the controller
can freeze in.

## Fix

Relax the gate to `EXPANSION_AT_CAPACITY_FRACTION = 0.98`, clear of the band a settled facility
actually occupies.

This is a free parameter with respect to the Spiegler-Naim limit-cycle condition: `Tw/Tp` is
computed from `PID_OUT_MAX_UP` and `STORAGE_TARGET_MONTHS` only, so changing the expansion gate
cannot affect it.

## Notes

- Services must not use storage-based signals: with `SERVICE_DEPRECIATION_RATE_PER_TICK = 0.1`
  the steady-state stock is bounded near one tick of output, so the 12-month storage target is
  unreachable and its error is permanently ~0.76. Flow-based signalling (`updateServiceFlowSignal`)
  is correct for them. The storageless path is already clean in code: no facility produces both
  goods and services, and the service selector always takes the flow branch.
- The remaining, deeper issue is that the service signal has no capacity-headroom term, so a
  saturated facility gets no positive signal when the market happens to clear. Fixing the gate
  unblocks expansion; it does not remove the perverse incentive.
