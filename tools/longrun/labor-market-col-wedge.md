# Labour-Market Cost-of-Living Wedge — Design Spec

Status: PROPOSED — for review before implementation.

## Problem

`hireWorkforce.ts:103` sets the hire acceptance threshold to

```
threshold = max(costOfLiving, outsideIncome)
```

`costOfLiving` is the per-tick cost of mandatory service consumption (grocery,
healthcare etc.) against live market prices.

When `WAGE_SHARE` drops (0.6 → 0.5), company wage walls fall faster than consumer
prices, pushing low-education wages below `costOfLiving`. Workers then refuse work at
what the constrained wage can offer, feeding a self-reinforcing spiral:

1. wages drop below CoL,
2. offers refused (accept probability → 0),
3. production collapses → goods scarcer → CoL rises,
4. more offers refused → aggregate collapse.

Observed in the dev run as ~5 % employment with labour-starved producers.

## Design constraint

The CoL term is simultaneously:
- the stabiliser that prevents a general race toward `MIN_WAGE` in slack labour
  markets (a firm cannot push wages below subsistence), and
- the brake that turns `WAGE_SHARE` steps explosive.

Merely deleting `costOfLiving` hands all wage-setting to the employer-side PID and the
outside option — exactly the regime where a `MIN_WAGE` collapse becomes possible. It
needs a replacement that preserves worker-side wage power without reintroducing the
external-price coupling.

## Framing

The model is effectively a Diamond-Mortensen-Pissarides search economy. Job acceptance
should rest on the worker's **relative wage expectation against the current offer
distribution**, damped by duress from unemployment. `costOfLiving` is the wrong anchor
for this because it is absolute, consumer-price-derived, and converges slower than
wages.

Workers are homogeneous cohorts (no per-worker search duration), so unemployment
pressure must enter via aggregate tightness — which `LaborMarket` already tracks.

## Proposed replacement

Two design objections to the earlier draft (which anchored the reservation to the
unemployment-transfer and hence to `wagePerEdu.none`):

1. **Self-reference.** `supportValue = INSURANCE_RATE × wagePerEdu.none` tracks the
   very wages it is asked to underpin. Companies set wages → `wagePerEdu` follows →
   the floor follows wages → the floor is a lagging echo, not an anchor. In the limit it
   collapses the whole labour market onto one (low) fixed point → `MIN_WAGE`.
2. **The user's key observation (fix 2):** a worker that stays unemployed long enough
   must eventually take *any* job, even below their immediate cost of living. Compulsion
   from duration, not an instant subsistence floor, is what resolves the CoL trap: CoL
   may set the reservation *at first*, but it must erode as joblessness extends.

The earlier draft's insurance/shorter-floor is therefore dropped as an anchor. Instead,
the reservation is (a) anchored to the **other-firms opportunity ladder** (the only
wage signal that is not trivially self-referential in a multi-employer economy), and
(b) **eroded by expected unemployment duration**, so the collapse state "worker refuses
forever below CoL" is impossible.

Concretely, in `hireWorkforce.ts`, for each `(educationLevel, worker)`:

```ts
// Expected weeks (search draws) until this worker edu finds *any* reachable job,
// already computable from LaborMarket data:
expectedWaiting  = 1 / max(ε, jobFindingProbability(reachableTightness[edu]))
durationDiscount = pow(WAGE_DURATION_DECAY, expectedWaiting)   // <1, falls with joblessness

// Worker takes a job if the offered wage clears a *decayed* reservation:
reservationWage  = WAGE_ACCEPT_FRACTION *
                     referenceWage[edu] *
                     durationDiscount

threshold        = reservationWage          // NO costOfLiving term; NO insurance term
```

`probToAccept = acceptProbability(wage, threshold)` stays unchanged.

Interpretation. Only two effects remain:

1. **Reference-ladder anchoring** — `WAGE_ACCEPT_FRACTION × referenceWage[edu]`.
   This is what a worker of that education normally expects to earn. In a
   multi-employer economy `referenceWage` is not self-referential: a single firm
   cannot drag the whole ladder down because other firms are profitable at their own
   ceilings. The fraction encodes "I won't work for much less than the going rate
   for my qualifications while jobs are easy to find."
2. **Duration erosion** — `durationDiscount`. The harder jobs are to find (low
   `jobFindingProbability`, long expected waiting), the lower the reservation falls.
   A long-unemployed cohort eventually takes any job above the legal minimum. This
   is the mechanism that stops CoL from being a *permanent* labour lock: it only
   shapes the reservation at the moment of first offer, never as an unconditional
   refusal floor.

`costOfLiving` plays no role in job acceptance — it remains in reporting and
consumption `fill` only. `outsideIncome` still feeds `quitPropensity` and the
"better offer / poaching" channel and stays untouched.


## How this prevents the observed `WAGE_SHARE = 0.5` collapse

| What changes vs. today | Current (`threshold = max(CoL, outside)`) | Proposed (`threshold = reference×duration`) |
|---|---|---|
| `WAGE_SHARE` step → wages fall | wage drops below CoL → refuses → lockout | reservation tracks the wage ladder, erodes with joblessness |
| Real price index lags wages | CoL unchanged → threshold stuck above wage | CoL not in the accept path at all |
| scarcity → prices up → CoL up | CoL chases prices up, more refusals | CoL no longer feeds the accept decision |
| long unemployment pool | stays refused (accept floor constant) | reservation erodes; eventually any above-minimum wage hires |
| race to `MIN_WAGE` | prevented only by CoL (which is the collapse trigger) | prevented while productive demand exists: employers bid wages up via `shortage²` and ref the ladder; only a genuine demand collapse drives wages to the legal floor (a macro outcome, not a labour-controller failure) |

## Parameters (starting defaults, relative to existing per-tick wage units)

| constant | suggested | purpose |
|---|---|---|
| `WAGE_DURATION_DECAY` | `0.8` | reservation erodes as expected waiting grows; 0.8 → after 5 expected search-weeks reservation halves |
| `WAGE_ACCEPT_FRACTION` | `0.8` | worker expects ≥80% of the going tier rate when jobs are instant |

`ACCEPT_BASE` and `WAGE_ACCEPT_SCALE` stay unchanged. The government `UNEMPLOYMENT_INSURANCE_RATE_*` constants are *not* read by the labour market — they feed `governmentSupportTick` only, unchanged.


### Implementation notes

- `LaborMarket` already exposes `reachableTightness[edu]` and
  `reachableVacancyWage[edu]`. `reachableVacancyWage[edu]` is computed in
  `computeLaborMarket` from cumulative reachable vacancies of that worker education
  scale-weighted by each contributing agent's *own-edu* wage. It is the best
  aggregate "what this tier of worker currently earns/looks at" signal short of a
  dedicated planet-level record. Use it as `referenceWage`.
- `outsideIncome` = `jobFindingProbability(tightness) × vacancyWage` already drives
  both `quitPropensity` (better-offer leaving) and the accept decision. Keep it.
- In `hireWorkforce.ts`, `costOfLiving` is still computed once per call via
  `computeCostOfLiving(planet)` but must stop feeding the `threshold` line.
- Leave `computeCostOfLiving` in `serviceDefinitions.ts` untouched — the dashboard,
  `worker.ts` telemetry, and `newsAgent` still read it.

## Migration & validation

1. Change the `threshold` in `hireWorkforce.ts` to the wage-relative reservation and
   delete `costOfLiving` from that line.
2. Update `hireWorkforce.test.ts` expectations that assume CoL is the binding
   acceptance floor.
3. Add focused unit tests:
   - a job paying at the going tier rate is always accepted in a tight market
   - high unemployment (low reachable tightness) *erodes* the reservation — a below-going-rate wage that was refused first is later accepted as expected waiting grows
   - a job offering a large premium over the going tier rate is accepted even when a high CoL would previously have blocked it (the former collapse trigger)
   - with every firm posting below CoL, hiring still happens after enough unemployment duration (the refusal spiral is gone)
4. Run the `WAGE_SHARE = 0.5` world. Expected: employment no longer collapses — the
   lower share leads to a lower but *stable* labour equilibrium rather than labour
   rationing.
5. If the resulting wage floors feel too weak (tendency toward `MIN_WAGE` when
   labour is abundant), raise both `WAGE_ACCEPT_FRACTION` toward `1.0` and
   `WAGE_DURATION_DECAY` toward `0.95`, which restore worker-side reserve power.

## Trade-offs and consequences

- **Physical affordability is no longer a direct labour-supply constraint.** If the
  total wage bill is too low for households to buy what is produced, that now shows
  up as aggregate-demand contraction, not as labour refusal. Removing refusal removes
  one automatic stabiliser that otherwise blocked the WAGE_SHARE-collapse regime.
- Wages are set by employer-side bidding (`shortage²` in `automaticWageAdjustment`)
  plus relative worker expectations (`referenceWage`). In a single-employer
  monopsony the reference ladder still comes from that one firm, so there is nothing
  else to push wages above the floor except demand-driven capacity growth. This is a
  known limitation shared by all pure search/labour models; multi-employer worlds are
  unaffected.
- All new levers are wage-relative, so the design stays invariant to an arbitrary
  price level. This is the property the current CoL anchor lacks, and the reason the
  WAGE_SHARE step was able to crash the whole labour market.




