# To Spiegler & Naim, on "Investigating sustained oscillations in nonlinear production and inventory control models"

Dear Dr Spiegler, Dr Naim,

We are not supply-chain researchers. We build a macro-economic simulation (Planetary Economy Game):
a population of households, firms and a bank on a planetary surface, with production facilities that consume
intermediate resources and produce outputs into finite storage. Each facility is autonomous: nobody sets its
production rate or its capacity. Both are governed by a local feedback loop that is, structurally, your
APIOBPCS with the demand term replaced by a storage error.

We found your paper while hunting a bug that has cost us weeks, and your model described our failure so
precisely that we want to report what we measured back to you. Two things may interest you: (1) our system
is multi-echelon, has two nonlinearities per node rather than one, and runs orders of magnitude slower than
your loop relative to its lead-time -- all three break assumptions your analysis makes; (2) despite that,
your predictions held to the point that we could read the regime off our data before we could explain it.

## What our loops look like

Per facility and per tick, in your notation:

    inventory   : storage of the produced resource
    target      : STORAGE_TARGET_MONTHS (3) x TICKS_PER_MONTH (30) x maxScale x output quantity
    error       : (target - inventory) / target                      <- your inventory error, normalised
    CLIP #1     : error := clamp(error, -1, +1)                      <- a hard saturation
    controller  : PID (Kp=0.1, Ki=0.001, Kd=0.01, filtered derivative, anti-windup)
    CLIP #2     : control output := clamp(control, -0.01, +0.1)/tick <- ASYMMETRIC 10:1 rate limit
    scale       : scale := clamp(scale + control x maxScale, 0.1 x maxScale, maxScale)
    lead-time   : the storage target looks 90 ticks ahead (Tp ~= 3 months)

So we have your non-negativity/saturation CLIP (CLIP #1 and the scale floor), plus a second, strongly
asymmetric rate limit (CLIP #2) that has no analogue in your model.


## The observation that sent us to your paper

On an 80-year run with a constant, fully autonomous controller -- no external demand variation at all, a
single producing agent, 8 billion households -- four coupled facilities oscillate in lockstep and never
settle. Measured over years 74-80 at 6-tick resolution:

    facility                 median sellThrough   median price/cost-floor   operating-scale swing
    Food Processor           -0.068               0.001                     11.0x
    Agricultural Facility     0.025               1.030                     10.3x
    Pesticide Plant           0.000               1.017                     11.0x
    Oil Refinery              0.020               0.950                     10.5x

For the agricultural node specifically: its inputs are never scarce (arable land, water and pesticide input
efficiencies are exactly 1.0000 at every sampled tick), it never has a worker deficit, and its PID error
signal sits pinned at the clamp. Its capacity (maxScale) is CONSTANT at 1.205e6 while its operating scale
swings between 1.47e5 and 1.205e6 -- an 8x excursion -- producing into inventory of ~1.5e10 units that it
cannot sell.

That is your Section 5 result stated in our data: an autonomous system, no exogenous forcing, sustained
oscillation. Your sentence "even for an autonomous production and inventory control system, limit cycles do
occur and this periodic behaviour occurs due to non-negativity constraint in the ordering rule" was the first
explanation we had that did not require an external trigger. We had spent weeks looking for one.

## Where we confirm you, quantitatively

**Section 4.1 -- the describing-function gain collapses as amplitude grows.** Your N_A falls from 1 to 0.5 as
the input amplitude passes the clip's linear range. Our signal is pinned at the clamp for the entire
oscillation, i.e. permanently in the N_A < 1 regime. Before reading you we had interpreted "signal == 1
forever" as a symptom of a wrong target. Your framework says it is the oscillator itself.

**Section 5.2, Eq. 22 -- the stability band is Tw >= 0.5 Tp.** This is the result that was most useful and
most uncomfortable. Our effective correction rate is PID_OUT_MAX_UP = 0.1 of full scale per tick, so the loop
can traverse its range in about 10 ticks. Our lead-time horizon is 90 ticks. Tw/Tp ~= 0.11, i.e. roughly
five-fold BELOW the lower edge (0.5) of the limit-cycle band, in the region your Figure 6e marks as possibly
unstable by encirclement. Consistently, our scale does not merely cycle -- it runs 1.205e6 -> 1.47e5 inside
four months, a factor 8, and is bounded only by our hard MIN_SCALE_FRACTION = 0.1 floor rather than by any
dynamic equilibrium. We believe a designer reading Eq. 22 would not have built our loop this way.

**Section 5.3 -- stability of the limit cycle.** You show all limit cycles from the ordering nonlinearity are
stable (A_do > B_do and 0.5 Tp <= Tw <= 0), so perturbation returns the system to the cycle and waiting does
not help. Our long runs match: the oscillation persists for decades at constant amplitude rather than
decaying, and it survived a 10x reduction we made to an unrelated production artefact. We would have wasted
more weeks expecting decay.

**Section 5.4 -- the compensation ranking, and the warning.** Your ordering (lead 1.2 <= beta <= 2.5, or pure
gain k < 1, are effective; lag beta < 1 is harmful; excessive lead beta ~ 3 reintroduces oscillation) matches
our experience that undifferentiated "more damping" does not converge. We had been adding damping and
observing both improvement and regression depending on where we put it, without a theory for which. Your
amplitude-phase picture explains both outcomes at once.

## Where our system differs, and where your assumptions break

We want to be explicit about this rather than over-claim a confirmation.

1. **Three nonlinearities, not one.** Besides your CLIP we have the asymmetric 10:1 rate limit (CLIP #2), and
   a price floor: our market will not let a price fall below a fraction of the production cost floor. That
   last one is a nonlinearity in a completely separate loop (price -> demand -> inventory), with no analogue
   in APIOBPCS. Under your own recommendation to isolate nonlinearities one at a time, we treat it as a
   possible second, independent oscillator.

2. **Asymmetry is not a perturbation for us, it is the design.** Our up-rate is 10x the down-rate. This is
   precisely the asymmetric case you flag in Section 4.1 -- second harmonic present, describing function
   less accurate, N_B rising with amplitude, and simulation required. Our excursion shape is a slow 4-month
   ramp followed by a fast collapse, i.e. a relaxation oscillation, which is what we would expect from a
   multi-valued describing function. Your method does not cover this symmetric assumption, and we did not
   see how to apply it without that caveat.

3. **Multi-echelon coupling with independent loops.** Four facilities upstream/downstream of one another each
   run their own copy of this controller. When we cross-correlate their monthly series we find weak,
   largely contemporaneous correlation (0.23-0.39 at lag 0-3 months), not a clean propagating wave. Our
   reading is that these are NOT one limit cycle propagating upstream as in your Section 6 point 4, but
   several independent cycles that phase-lock because each node's output is the next node's input. We could
   not distinguish these with your single-echelon framework, and we would be glad to know whether you
   consider that distinction decidable.

4. **The physical CLIP is not innocent for us.** Your Section 6 point 3 concludes the shipment/capacity
   constraint causes no limit cycles because it is physical rather than informational, and advises the
   designer not to worry about it. Our capacity adaptation (maxScale) ratchets up while the operating scale
   sits at its ceiling during the boom half of the cycle, and does not ratchet back down during the
   contraction. Net effect over 80 years: total job-slot capacity grows 5.8x while employment grows 1.9x, so
   the ratio of employed workers to available jobs falls from 1.41 to 0.455. The facility then cannot staff
   itself, its production falls, and the economy collapses. Your separation is correct in the control sense
   -- the capacity constraint adds no pole and no phase lag to the ordering loop -- but in our system the
   capacity variable is itself an accumulator driven by the cycle, and the cycle's duty cycle determines how
   much it accumulates. We would describe the physical constraint as a rectifier: it does not oscillate, it
   converts the oscillation into a one-way drift. We are aware this is close to what your own N_B term
   already describes (Eq. 9/14: the asymmetric clip produces a DC bias proportional to the signal mean), so
   we do not claim the mechanism as novel -- but we did not find the case where the DC bias lands on a STATE
   variable that has its own slow dynamics rather than on the order rate itself. We would be grateful for
   your view on whether the N_B analysis extends to that, or whether it needs a separate treatment.

## What we are doing next, following your recommendations

Applying your Section 5.4 remedies to our controller, in your priority order: replacing the hard clamp with a
soft saturation (tanh) so the loop stays in the N_A ~= 1 region, symmetrising and slowing the rate limit so
that Tw is no longer an order of magnitude below Tp, and adding an anticipation (lead) term. We will treat
the capacity ratio above as the acceptance test, on the hypothesis your Section 6 point 3 implies: if the
drift is a rectified consequence of the oscillation, it should shrink once the oscillation is removed. If it
does not, the single-nonlinearity assumption does not hold for us and the price floor is genuinely a second
oscillator.

## Why we are writing

Your paper appears to be the only work we found that treats this class of failure analytically rather than as
tuning. For practitioners like us the value was diagnostic: it gave us a regime test (Tw against Tp), a
mechanism (describing-function gain collapse at the clip), and a taxonomy of compensations with a warning
about which ones backfire. We would encourage the extension you mention in your conclusion -- "assessing the
impact of other nonlinearities in the ordering rule, such as fixed and variable production capacity" -- and we
would specifically ask for the case where the capacity variable accumulates the cycle rather than merely
bounding it, since that appears to be what turns a bounded oscillation into a long-run structural failure in
our system.

We are happy to share the traces, the reproduction harness, and the parameter values behind every number
above.

Kind regards,

The Planetary Economy Game project

