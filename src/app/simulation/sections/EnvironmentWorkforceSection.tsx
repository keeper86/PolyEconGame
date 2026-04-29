import { MortalityStarvationChart } from '../charts/MortalityStarvationChart';
import { StarvationDynamicsChart } from '../charts/StarvationDynamicsChart';

export function EnvironmentWorkforceSection() {
    return (
        <>
            {/* ---------------------------------------------------------------- */}
            {/* 1. ENVIRONMENT TICK                                               */}
            {/* ---------------------------------------------------------------- */}
            <section id='environment'>
                <h2 className='text-2xl font-bold mt-8 mb-3'>1. Environment Tick (every tick)</h2>
                <p>
                    The environment subsystem models planetary pollution levels and renewable resource regeneration. It
                    runs first in each tick so that freshly regenerated resources are available to facilities in the
                    same tick.
                </p>

                <h3 className='text-xl font-semibold mt-6 mb-2'>1.1 Pollution Decay</h3>
                <p>
                    Each planet tracks three pollution indices — air, water, and soil. At every tick the natural
                    environment removes a portion via a <strong>combined constant + proportional decay</strong>:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`P(t+1) = max(0, P(t) − c − r · P(t))
       = max(0, P(t) · (1 − r) − c)

  P(t)  pollution index at tick t
  c     constant regeneration (from regenerationRates.*.constant)
  r     fractional rate per tick (from regenerationRates.*.percentage)`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>1.2 Renewable Resource Regeneration</h3>
                <p>
                    Resource claims with a positive <code>regenerationRate</code> grow up to{' '}
                    <code>maximumCapacity</code> each tick:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`Q(t+1) = Q(t) + min(regenerationRate, maximumCapacity − Q(t))`}
                </pre>
            </section>

            {/* ---------------------------------------------------------------- */}
            {/* 2. WORKFORCE DEMOGRAPHIC TICK                                     */}
            {/* ---------------------------------------------------------------- */}
            <section id='workforce-demographic'>
                <h2 className='text-2xl font-bold mt-8 mb-3'>2. Workforce Demographic Tick (every tick)</h2>
                <p>
                    The workforce demographic tick runs <em>before</em> the population tick. It applies mortality,
                    disability and retirement directly to active workforce cells and accumulates the counts in a{' '}
                    <code>WorkforceEventAccumulator</code> so that <code>populationTick</code> can reconcile the
                    population demography consistently.
                </p>

                <h3 className='text-xl font-semibold mt-6 mb-2'>2.1 Voluntary Quits</h3>
                <p>
                    A small fraction of every active workforce cohort voluntarily quits each tick and enters the 3-month
                    notice pipeline at slot <code>NOTICE_PERIOD_MONTHS − 1</code>:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`quitters = stochasticRound(active × VOLUNTARY_QUIT_RATE_PER_TICK = 0.0003)
→ voluntaryDeparting[NOTICE_PERIOD_MONTHS − 1]  (slot furthest from release)`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>2.2 Retirement (per-tick, active workers)</h3>
                <p>
                    Workers at or above <code>RETIREMENT_AGE = 67</code> retire with a per-tick probability derived from
                    an annual rate that ramps from 10 % at age 67 to 100 % at age 82:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`annualProb(age) = min(1, 0.10 + (age − 67) × 0.90 / 15)
perTickProb     = 1 − (1 − annualProb)^(1/360)
retirees        = stochasticRound(active × perTickProb)
→ departingRetired[NOTICE_PERIOD_MONTHS − 1]`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>2.3 Workforce Mortality &amp; Disability</h3>
                <p>
                    The same per-tick mortality and disability probabilities used in the population tick (§3) are
                    applied to active workforce cells. Deaths and disabilities are counted in the accumulator so the
                    population tick removes exactly the same people from the corresponding demography cells.
                </p>
            </section>

            {/* ---------------------------------------------------------------- */}
            {/* 3. POPULATION TICK                                                */}
            {/* ---------------------------------------------------------------- */}
            <section id='population'>
                <h2 className='text-2xl font-bold mt-8 mb-3'>3. Population Tick (every tick)</h2>
                <p>
                    The population subsystem maintains a full age-structured demography: a cohort array indexed by age
                    (0–100), each cell broken down by occupation × education × skill. The per-tick update applies
                    mortality, disability, retirement of non-workers, service consumption (grocery buffer), and births.
                </p>

                <h3 className='text-xl font-semibold mt-6 mb-2'>3.1 Mortality</h3>
                <p>
                    Mortality has three additive annual components: age-dependent base, environmental (pollution +
                    disasters), and starvation. The starvation term splits into a linear base amplification and an acute
                    S⁴ term that captures extreme famine lethality:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`m_base(age)    per-year lookup table (~72 year life expectancy)

m_env         = air×0.006 + water×0.00002 + soil×0.00001
              + earthquakes×0.0005 + floods×0.00005 + storms×0.000015

m_starvation_base = m_base(age) × S          (amplifies baseline)
m_acute           = S⁴                       (direct famine deaths)
  S=0   → 0,   S=0.5 → 0.0625,   S=1 → 1.0

m_annual = m_base(age) × (1 + S) + m_env + m_acute
m_tick   = 1 − (1 − m_annual)^(1/360)
deaths   = stochasticRound(cohort × min(0.8, m_tick))`}
                </pre>
                <p className='mt-2 text-sm text-muted-foreground'>
                    Annual mortality contribution of each starvation component for a representative mid-life cohort
                    (base rate 1 %/yr):
                </p>
                <MortalityStarvationChart />

                <h3 className='text-xl font-semibold mt-6 mb-2'>3.2 Grocery Service Consumption &amp; Starvation</h3>
                <p>
                    Each population cohort maintains a <strong>grocery service buffer</strong> (measured in ticks of
                    coverage) that is replenished by purchasing grocery service from the market. Each tick the buffer is
                    drawn down by <code>SERVICE_PER_PERSON_PER_TICK = 1/30</code>. If the buffer runs dry, the shortfall
                    raises the cell-level starvation index S:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`consumed   = min(groceryBuffer, total × SERVICE_PER_PERSON_PER_TICK)
nutritionalFactor = consumed / (total × SERVICE_PER_PERSON_PER_TICK)
shortfall         = clamp(1 − nutritionalFactor, 0, 1)

α = 1 / STARVATION_ADJUST_TICKS  (= 1/30, ~one-month time-constant)
S(t+1) = S(t) + α × (shortfall − S(t))`}
                </pre>
                <p className='mt-2 text-sm text-muted-foreground'>
                    S over 120 ticks: total famine then recovery (red), chronic 50 % supply (blue), full supply (green).
                </p>
                <StarvationDynamicsChart />

                <h3 className='text-xl font-semibold mt-6 mb-2'>3.3 Disability</h3>
                <p>
                    At each tick a fraction of employed workers transitions to <code>unableToWork</code>. The annual
                    disability probability combines age, pollution, natural disasters, and starvation:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`d_pollution  = min(0.5, air×0.0001 + water×0.0001 + soil×0.00002)
d_disasters  = min(0.3, earthquakes×0.00005 + floods×0.000005 + storms×0.0000015)
d_starvation = 0.05 × S²
d_age:  age<15→0.001  |  15–49→0.0005  |  50–59→0.005  |  60–69→0.01
        70–90 → 0.01 + (age−70)/20 × 0.32  (ramp to 0.33)  |  >90→0.33

d_tick = 1 − (1 − (d_pollution + d_disasters + d_starvation + d_age))^(1/360)`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>3.4 Retirement (non-workers)</h3>
                <p>
                    <code>unoccupied</code> and <code>education</code> cells also retire at the same per-tick
                    probability (§2.2). They transition directly to <code>unableToWork</code> without a notice pipeline.
                </p>

                <h3 className='text-xl font-semibold mt-6 mb-2'>3.5 Births</h3>
                <p>
                    Births are computed from fertile women (ages 18–45, assumed 50 % of each cohort), adjusted for
                    starvation and pollution:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`LIFETIME_FERTILITY = 3.0
pollutionReduction = min(1, air×0.01 + water×0.002 + soil×0.0005)

LF_adj = 3.0 × (1 − 0.75 × S⁴) × (1 − 0.5 × pollutionReduction)

birthsPerYear = LF_adj × fertileWomen / (45 − 18 + 1)
birthsPerTick = stochasticRound(birthsPerYear / 360)`}
                </pre>
            </section>

            {/* ---------------------------------------------------------------- */}
            {/* 4. HIRE / FIRE (monthly)                                          */}
            {/* ---------------------------------------------------------------- */}
            <section id='workforce-hire'>
                <h2 className='text-2xl font-bold mt-8 mb-3'>4. Worker Allocation &amp; Hire/Fire (monthly)</h2>
                <p>
                    Hiring and firing happen only at month boundaries (<code>tick % 30 === 1</code>) to prevent
                    excessive workforce churn from tick-level noise.
                </p>

                <h3 className='text-xl font-semibold mt-6 mb-2'>4.1 Allocation Target</h3>
                <p>
                    Automated agents recompute <code>allocatedWorkers</code> by inspecting the last production
                    tick&apos;s results:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`deficit     = max(0, totalRequirement[edu] − exactUsed[edu])
target[edu] = ceil((totalUsed[edu] + deficit) × (1 + ACCEPTABLE_IDLE_FRACTION))

ACCEPTABLE_IDLE_FRACTION = 0.05   (5 % idle buffer above exact demand)`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>4.2 Hiring</h3>
                <p>
                    If active headcount falls below the target, workers are hired from the planet&apos;s{' '}
                    <code>unoccupied</code> pool. New workers are placed at their exact population age (not aggregated
                    as moments):
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`gap = target[edu] − currentActive[edu]
if gap > 0:
    hire min(gap, unoccupied[edu]) workers
    workforce[exact age][edu][skill].active += count`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>4.3 Firing</h3>
                <p>
                    When overstaffed beyond the 5 % buffer, workers are fired youngest-age-first (lowest tenure proxy)
                    and enter the 3-month <code>departingFired</code> pipeline:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`surplus = currentActive − target
if surplus > currentActive × 0.05:
    fire age 0 upward until surplus removed
    → departingFired[NOTICE_PERIOD_MONTHS − 1]   (NOTICE_PERIOD_MONTHS = 3)`}
                </pre>
            </section>
        </>
    );
}
