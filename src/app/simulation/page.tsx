import Link from 'next/link';
import { APP_ROUTES } from '@/lib/appRoutes';
import { Page } from '@/components/client/Page';

export default function SimulationPage() {
    return (
        <Page title='Simulation Model'>
            <div className='prose max-w-none'>
                <p className='text-muted-foreground'>
                    This page describes the discrete-time socio-economic simulation that drives PolyEconGame. The model
                    is organized into several subsystems, each updated on its own cadence. The fundamental time unit is
                    the <strong>tick</strong>: 30 ticks constitute one in-game month, and 360 ticks (12 months)
                    constitute one in-game year.
                </p>

                <hr className='my-6' />

                {/* ---------------------------------------------------------------- */}
                {/* 1. ENVIRONMENT TICK                                               */}
                {/* ---------------------------------------------------------------- */}
                <section id='environment'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>1. Environment Tick (every tick)</h2>
                    <p>
                        The environment subsystem models planetary pollution levels and renewable resource regeneration.
                        It runs first in each tick, before production is evaluated, so that freshly regenerated
                        resources are available to facilities in the same tick.
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>1.1 Pollution Regeneration</h3>
                    <p>
                        Each planet tracks three pollution indices — air, water, and soil — each on a scale of{' '}
                        <em>
                            [0, &infin;)
                        </em>{' '}
                        (higher = more polluted). At every tick the natural environment removes a portion of each index
                        via a <strong>combined constant + proportional decay</strong>:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`P(t+1) = max(0, P(t) − c − r · P(t))
       = max(0, P(t) · (1 − r) − c)

where
  P(t)  pollution index at tick t
  c     constant regeneration (index-points per tick, from regenerationRates.*.constant)
  r     fractional regeneration rate per tick (from regenerationRates.*.percentage)`}
                    </pre>
                    <p>
                        The constants encode qualitative differences in how fast each medium self-cleans. Soil
                        regenerates an order of magnitude more slowly than air or water, reflecting real-world
                        remediation timescales (~100 years from heavy contamination).
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>1.2 Renewable Resource Regeneration</h3>
                    <p>
                        Each planet holds a set of <em>resource claims</em>. Claims with a positive{' '}
                        <code>regenerationRate</code> (in units per year) are renewable. Every tick the stored quantity
                        grows up to the claim&apos;s <code>maximumCapacity</code>:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`Q(t+1) = Q(t) + min(R, C − Q(t))

where
  Q(t)  current stored quantity
  R     regeneration rate per tick (annual rate expressed per tick)
  C     maximumCapacity`}
                    </pre>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 2. LABOR MARKET TICK                                              */}
                {/* ---------------------------------------------------------------- */}
                <section id='labor-market'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>2. Labor Market Tick (every tick)</h2>
                    <p>
                        The labor market links each agent&apos;s workforce demand (captured in{' '}
                        <code>allocatedWorkers</code>) to the planet&apos;s available population. Workers are
                        categorized by education level:{' '}
                        <em>none, primary, secondary, tertiary, quaternary</em>.
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>2.1 Voluntary Quits</h3>
                    <p>
                        A small, constant fraction of every active workforce cohort voluntarily quits each tick and
                        enters a 12-month notice pipeline:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`Q = floor(A · q)

where
  A   number of active workers in the cohort
  q   VOLUNTARY_QUIT_RATE_PER_TICK = 0.0001 (fraction per tick)`}
                    </pre>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>2.2 Hiring</h3>
                    <p>
                        If the active headcount for an education level falls below the agent&apos;s target, the system
                        hires the full gap instantly from the planet&apos;s unoccupied population pool:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`gap = allocatedWorkers[edu] − totalActive[edu]
if gap > 0:
    hire min(gap, unoccupied[edu]) workers at tenure year 0

Age moments (mean μ, variance σ²) of newly hired workers are tracked via
the parallel-axis (König–Huygens) formula when merging with existing tenure-0
workers:

μ_new  = (n₁ · μ₁ + n₂ · μ₂) / (n₁ + n₂)
σ²_new = (n₁ · (σ₁² + (μ₁ − μ_new)²) + n₂ · (σ₂² + (μ₂ − μ_new)²)) / (n₁ + n₂)`}
                    </pre>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>2.3 Firing</h3>
                    <p>
                        When overstaffed, the system fires excess workers beginning from the lowest eligible tenure
                        year. Workers in tenure years 0 and 1 (probation) are protected from lay-offs. Fired workers
                        enter the 12-month departing pipeline:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`surplus = totalActive[edu] − allocatedWorkers[edu]
if surplus > 0:
    fire workers starting from tenure year MIN_TENURE_FOR_FIRING = 2,
    ascending, until surplus workers have entered the departing pipeline`}
                    </pre>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>2.4 Worker Allocation Targets</h3>
                    <p>
                        Before the labor market tick, the system re-computes each agent&apos;s{' '}
                        <code>allocatedWorkers</code> target by summing scaled worker requirements across all
                        production facilities on a planet. To prevent runaway hiring, targets are reduced when the
                        idle-worker fraction exceeds <code>ACCEPTABLE_IDLE_FRACTION = 5%</code>:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`demand[edu] = Σ_f (workerRequirement_f[edu] · scale_f)   for all facilities f

if idleFraction > ACCEPTABLE_IDLE_FRACTION:
    target[edu] = demand[edu] · (1 − idleFraction)`}
                    </pre>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 3. POPULATION TICK                                                */}
                {/* ---------------------------------------------------------------- */}
                <section id='population'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>3. Population Tick (every tick)</h2>
                    <p>
                        The population subsystem maintains a full age-structured demography: a cohort array indexed by
                        age (0–100), each cell broken down by education level × occupation. The per-tick update applies
                        mortality, disability, starvation dynamics, and births.
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>3.1 Food Consumption and Starvation</h3>
                    <p>
                        Each person consumes <code>FOOD_PER_PERSON_PER_TICK = 1/360</code> tons of food per tick
                        (equivalent to 1 ton/person/year). A <em>starvation level</em> S ∈ [0, 1] is maintained as a
                        persistent state variable and adjusted every tick based on the nutritional factor:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`nutritionalFactor = foodConsumed / (population · FOOD_PER_PERSON_PER_TICK)
shortfall = max(0, 1 − min(1, nutritionalFactor))

ΔS_increase = shortfall / STARVATION_FULL_DURATION_TICKS   (= shortfall / 30)
ΔS_recovery = nutritionalFactor / RECOVERY_DURATION_TICKS  (only when shortfall = 0)

S(t+1) = clamp(S(t) + ΔS_increase − ΔS_recovery, 0, 1)`}
                    </pre>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>3.2 Mortality Model</h3>
                    <p>
                        Mortality is applied independently to each age cohort. The base annual mortality rate m(age) is
                        taken from an empirical life-table expressed in deaths per thousand. Additional contributions
                        come from pollution, natural disasters, and starvation:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`m_base(age)      from lookup table (per 1 000, calibrated to ~72 year life expectancy)

m_pollution      = air · 0.006 + water · 0.00002 + soil · 0.00001  (annual)
m_disasters      = earthquakes · 0.0005 + floods · 0.00005 + storms · 0.000015  (annual)
m_starvation     = S⁴  (quartic scaling: minimal until near-full starvation)

m_base_starvation(age) = m_base(age) · (1 + 99 · S⁴)   (starvation amplifies base mortality)
m_combined       = min(1, m_base_starvation(age) + m_pollution + m_disasters + m_starvation)

Annual → per-tick conversion (avoids cohort oscillation):
  p_tick = 1 − (1 − m_annual)^(1 / TICKS_PER_YEAR)

survivors = floor(cohort_total · (1 − p_tick))
deaths are distributed proportionally across education × occupation cells
(Hamilton largest-remainder method)`}
                    </pre>
                    <p>
                        The quartic exponent on S ensures that mortality only rises sharply when starvation is severe,
                        reflecting the real-world observation that moderate food insecurity raises morbidity but does
                        not immediately cause mass death.
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>3.3 Births (Fertility Model)</h3>
                    <p>
                        Births are distributed uniformly across ticks. The model uses a simplified cohort fertility
                        applied to the number of women in fertile age (18–45), assumed to be 50 % of each age cohort:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`TFR_base = 2.66   (slightly above replacement to buffer child mortality)
pollutionFertReduction = min(1, air · 0.01 + water · 0.002 + soil · 0.0005)
TFR_adj  = TFR_base · (1 − 0.5 · S) · (1 − 0.5 · pollutionFertReduction)

fertileWomen = 0.5 · Σ_{age=18}^{45} cohort_total(age)

birthsPerYear = floor(TFR_adj · fertileWomen / (45 − 18 + 1))
birthsPerTick = floor(birthsPerYear / TICKS_PER_YEAR)`}
                    </pre>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>3.4 Disability Transitions</h3>
                    <p>
                        At each tick, a fraction of non-disabled workers transitions to{' '}
                        <code>unableToWork</code> due to age-related disability, pollution, or natural disasters:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`d_pollution  = min(0.5, air · 0.0001 + water · 0.0001 + soil · 0.00002)
d_disasters  = min(0.3, earthquakes · 0.00005 + floods · 0.000005 + storms · 0.0000015)
d_age(age):
    age < 15         → 0.001
    15 ≤ age < 50    → 0.0005
    50 ≤ age < 60    → 0.005
    60 ≤ age < 70    → 0.01
    70 ≤ age ≤ 90    → 0.01 + (age − 70) / 20 · 0.32  (linear ramp to 0.33)
    age > 90         → 0.33

d_total = d_pollution + d_disasters + d_age(age)
d_tick  = 1 − (1 − d_total)^(1/360)      (annual → per-tick)
disabled = floor(occupiedWorkers · d_tick)`}
                    </pre>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 4. PRODUCTION TICK                                                */}
                {/* ---------------------------------------------------------------- */}
                <section id='production'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>4. Production Tick (every tick)</h2>
                    <p>
                        Each agent&apos;s production facilities are evaluated every tick. Facility output scales
                        linearly with a composite <em>overall efficiency</em> that is the minimum of worker efficiency
                        and resource efficiency.
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>4.1 Age-Dependent Productivity</h3>
                    <p>
                        The effective number of workers is adjusted by an age-productivity multiplier that peaks for
                        workers aged 30–50 and declines for younger or older workers:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`φ_age(μ):
    μ ≤ 18        → 0.80
    18 < μ < 30   → 0.80 + (μ − 18) · 0.20 / 12    (linear ramp to 1.00)
    30 ≤ μ ≤ 50   → 1.00
    50 < μ < 65   → 1.00 − (μ − 50) · 0.15 / 15    (linear decay to 0.85)
    μ ≥ 65        → max(0.70, 0.85 − (μ − 65) · 0.15 / 15)

where μ is the mean age of the workforce cohort at a given education level`}
                    </pre>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>4.2 Experience (Tenure) Productivity</h3>
                    <p>A separate tenure multiplier rewards long-serving workers:</p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`φ_exp(y):
    y ≤ 0    → 1.0
    0 < y < 10 → 1.0 + y · 0.5 / 10   (linear from 1.0 to 1.5)
    y ≥ 10   → 1.5

where y is the tenure in years of the cohort`}
                    </pre>
                    <p>
                        The combined productivity multiplier for each education level is the weighted average across
                        tenure cohorts:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`φ_age_weighted[edu]  = (Σ_y n_y · φ_age(μ_y)) / (Σ_y n_y)
φ_exp_weighted[edu]  = (Σ_y n_y · φ_exp(y))    / (Σ_y n_y)
φ_combined[edu]      = φ_age_weighted[edu] · φ_exp_weighted[edu]`}
                    </pre>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>4.3 Worker Allocation (Two-Pass)</h3>
                    <p>
                        Worker requirements are filled in two passes to prevent higher-education workers from being
                        consumed before lower slots are matched:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`Pass 1 (exact match):
  For each job-education slot jobEdu:
    bodiesNeeded = ceil(effectiveTarget / φ_combined[jobEdu])
    take = min(bodiesNeeded, remainingWorkers[jobEdu])
    effectiveFilled += take · φ_combined[jobEdu]

Pass 2 (upward cascade — overqualification):
  For each unsatisfied slot jobEdu:
    Walk up through higher education levels candidateEdu > jobEdu:
      bodiesNeeded = ceil(remaining_gap / φ_combined[candidateEdu])
      take = min(bodiesNeeded, remainingWorkers[candidateEdu])
      effectiveFilled += take · φ_combined[candidateEdu]

workerEfficiency[jobEdu] = min(1, effectiveFilled / (requirement · scale))`}
                    </pre>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>4.4 Overall Efficiency and Output</h3>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`resourceEfficiency[r] = min(1, available_r / (need_r · scale))
workerEfficiencyOverall = min over all required jobEdu of workerEfficiency[jobEdu]
overallEfficiency = min(workerEfficiencyOverall, min over r of resourceEfficiency[r])

output = floor(nominalOutput · scale · overallEfficiency)
input consumed = ceil(nominalInput · scale · overallEfficiency)
pollution added = pollutionPerTick · scale · overallEfficiency`}
                    </pre>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 5. LABOR MARKET MONTH TICK                                        */}
                {/* ---------------------------------------------------------------- */}
                <section id='labor-market-month'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>5. Labor Market Month Tick (every 30 ticks)</h2>
                    <p>
                        At every month boundary the departing and retiring pipelines are advanced by one slot. Workers
                        in slot 0 (soonest to leave) are released from the workforce entirely:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`For each tenure cohort c and education level edu:

  1. Release slot 0 of the departing pipeline:
       departing[edu][0] workers return to planet's unoccupied pool
       (fired subset: departingFired[edu][0] — tracked for statistics only)

  2. Release slot 0 of the retiring pipeline:
       retiring[edu][0] workers move to 'unableToWork' in the population

  3. Shift all remaining slots down by 1:
       departing[edu][m] ← departing[edu][m+1]  for m = 0 … NOTICE_PERIOD_MONTHS−2
       departing[edu][NOTICE_PERIOD_MONTHS−1] ← 0
       (same for departingFired and retiring)`}
                    </pre>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 6. POPULATION YEAR TICK                                           */}
                {/* ---------------------------------------------------------------- */}
                <section id='population-year'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>6. Population Year Tick (every 360 ticks)</h2>
                    <p>
                        Once per year the entire population ages by one year and education transitions are applied. The
                        per-tick mortality has already removed deaths; this step only handles cohort shifting and
                        school/work transitions.
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>6.1 Aging</h3>
                    <p>
                        Every cohort at age <em>a</em> moves to <em>a + 1</em>. Cohort 0 (newborns) is reset to zero
                        and will be refilled over the coming year by per-tick births.
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>6.2 Education Graduation and Dropout</h3>
                    <p>
                        For individuals in the <code>education</code> occupation, graduation and dropout probabilities
                        are evaluated:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`Graduation probability at age a for education level L:
  if a < graduationAge_L:
      P_grad(a, L) = graduationPreAgeProbability_L ^ (graduationAge_L − a)
  else:
      P_grad(a, L) = graduationProbability_L

graduates = floor(count · P_grad(a, L))

Of the graduates:
  transitioners = floor(graduates · transitionProbability_L) → advance to next level
  voluntaryDropouts = graduates − transitioners              → become unoccupied

Of those who do NOT graduate (stay students):
  P_dropout(a, L):
      if a < graduationAge_L + spread:  genericDropoutProbability_L  (low)
      if a = graduationAge_L + spread:  0.5
      if a > graduationAge_L + spread:  0.95
  dropouts = ceil(stayers · P_dropout(a, L)) → become unoccupied
  remainers = stayers − dropouts              → stay in education

Education level parameters:
  Level        graduationAge  P_grad   P_transition  P_dropout_generic
  none               9          0.90       0.95           0.01
  primary           17          0.75       0.40           0.02
  secondary         22          0.50       0.30           0.06
  tertiary          27          0.10       0.00           0.10
  quaternary       100          0.00       —              1.00`}
                    </pre>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 7. LABOR MARKET YEAR TICK                                         */}
                {/* ---------------------------------------------------------------- */}
                <section id='labor-market-year'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>7. Labor Market Year Tick (every 360 ticks)</h2>
                    <p>
                        Once per year, tenure advances by one year for all active and departing workers. Additionally,
                        workers whose mean age has reached or exceeded the retirement threshold
                        (RETIREMENT_AGE = 67 years) are transitioned into the retiring pipeline.
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`Tenure advance:
  workforceDemography[MAX_TENURE_YEARS] += workforceDemography[MAX_TENURE_YEARS-1]
  for y = MAX_TENURE_YEARS-1 down to 1:
      workforceDemography[y] ← workforceDemography[y-1]
  workforceDemography[0] ← empty cohort

Retirement (per tenure cohort c, education level edu):
  Uses Gaussian CDF approximation (Abramowitz & Stegun 26.2.17) to estimate
  the fraction of the cohort above RETIREMENT_AGE given age moments (μ, σ²):

      z = (RETIREMENT_AGE − μ) / √σ²
      retireFraction = 1 − Φ(z)     (fraction of cohort above retirement age)
      retirees = floor(active[edu] · retireFraction)

  Retirees enter the retiring pipeline at slot NOTICE_PERIOD_MONTHS−1.
  Age moments are updated to reflect the remaining (younger) workers.`}
                    </pre>
                    <p>
                        Using moments rather than an explicit age distribution allows the system to scale to large
                        populations while retaining a statistically sound representation of workforce aging.
                    </p>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 8. TICK ORDERING SUMMARY                                          */}
                {/* ---------------------------------------------------------------- */}
                <section id='tick-order'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>8. Tick Ordering Summary</h2>
                    <p>Within each tick the subsystems execute in the following order:</p>
                    <ol className='list-decimal list-inside space-y-1'>
                        <li>
                            <code>environmentTick</code> — pollution decay, renewable resource regeneration
                        </li>
                        <li>
                            <code>updateAllocatedWorkers</code> — recompute workforce demand targets
                        </li>
                        <li>
                            <code>laborMarketTick</code> — voluntary quits, hiring, firing
                        </li>
                        <li>
                            <code>populationTick</code> — mortality, births, starvation, disability
                        </li>
                        <li>
                            <code>productionTick</code> — facility output, resource consumption, pollution generation
                        </li>
                        <li>
                            <em>(month boundary only)</em> <code>laborMarketMonthTick</code> — notice pipeline advance
                        </li>
                        <li>
                            <em>(year boundary only)</em> <code>populationAdvanceYearTick</code> — aging, education
                            transitions
                        </li>
                        <li>
                            <em>(year boundary only)</em> <code>laborMarketYearTick</code> — tenure advance,
                            retirement
                        </li>
                    </ol>
                    <p className='mt-4'>
                        This ordering ensures that environmental regeneration is visible to production within the same
                        tick, and that population deaths computed in <code>populationTick</code> are reflected
                        deterministically in workforce counts before the next tick begins.
                    </p>
                </section>

                <hr className='my-8' />
            </div>

            <div className='mt-4'>
                <Link href={APP_ROUTES.root.path} className='btn btn-outline'>
                    Back to Home
                </Link>
            </div>
        </Page>
    );
}
