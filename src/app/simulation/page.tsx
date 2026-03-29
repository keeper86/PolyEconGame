import { Page } from '@/components/client/Page';
import { APP_ROUTES } from '@/lib/appRoutes';
import Link from 'next/link';
import { MortalityStarvationChart } from './charts/MortalityStarvationChart';
import { StarvationDynamicsChart } from './charts/StarvationDynamicsChart';

const TOC = [
    { id: 'overview', label: '0. Overview & Time Units' },
    { id: 'environment', label: '1. Environment Tick' },
    { id: 'workforce-demographic', label: '2. Workforce Demographic Tick' },
    { id: 'population', label: '3. Population Tick' },
    { id: 'workforce-hire', label: '4. Hire / Fire (monthly)' },
    { id: 'financial-pre', label: '5. Pre-Production Financial Tick' },
    { id: 'production', label: '6. Production Tick' },
    { id: 'pricing', label: '7. Agent Pricing (Tâtonnement)' },
    { id: 'buying', label: '7b. Agent Input Buying' },
    { id: 'transfers', label: '8. Intergenerational Transfers' },
    { id: 'market', label: '9. Market Clearing' },
    { id: 'financial-post', label: '10. Post-Production Financial Tick' },
    { id: 'labor-month', label: '11. Labor Market Month Tick' },
    { id: 'population-year', label: '12. Population Year Tick' },
    { id: 'labor-year', label: '13. Workforce Year Tick' },
    { id: 'tick-order', label: '14. Tick Ordering Summary' },
] as const;

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

                {/* Table of Contents */}
                <nav className='mb-8 rounded-md border p-4'>
                    <h2 className='text-lg font-semibold mb-2'>Contents</h2>
                    <ul className='columns-2 gap-x-8 list-none pl-0 text-sm space-y-1'>
                        {TOC.map(({ id, label }) => (
                            <li key={id}>
                                <a href={`#${id}`} className='hover:underline'>
                                    {label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>

                {/* ---------------------------------------------------------------- */}
                {/* 0. OVERVIEW                                                       */}
                {/* ---------------------------------------------------------------- */}
                <section id='overview'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>0. Overview &amp; Time Units</h2>
                    <p>
                        The simulation runs on a single global <code>GameState</code> that holds a list of{' '}
                        <strong>planets</strong> and a map of <strong>agents</strong>. Each agent can operate on
                        multiple planets simultaneously; all per-planet state (workforce, storage, market orders) is
                        held inside <code>agent.assets[planetId]</code>.
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`TICKS_PER_MONTH = 30
TICKS_PER_YEAR  = 360   (= 30 × 12)
FOOD_PER_PERSON_PER_TICK = 1 / 360   (1 ton / person / year)`}
                    </pre>
                    <p>
                        Every tick the top-level <code>advanceTick</code> function iterates over all planets and applies
                        every subsystem in a fixed order. Month-boundary and year-boundary steps run conditionally only
                        when <code>tick % 30 === 0</code> and <code>tick % 360 === 0</code> respectively.
                    </p>
                    <p>
                        Education levels used throughout are: <code>none</code>, <code>primary</code>,{' '}
                        <code>secondary</code>, <code>tertiary</code>. Population cells are indexed by{' '}
                        <code>[age][occupation][education][skill]</code>, where occupations are <code>unoccupied</code>,{' '}
                        <code>employed</code>, <code>education</code>, <code>unableToWork</code>.
                    </p>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 1. ENVIRONMENT TICK                                               */}
                {/* ---------------------------------------------------------------- */}
                <section id='environment'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>1. Environment Tick (every tick)</h2>
                    <p>
                        The environment subsystem models planetary pollution levels and renewable resource regeneration.
                        It runs first in each tick so that freshly regenerated resources are available to facilities in
                        the same tick.
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
                        A small fraction of every active workforce cohort voluntarily quits each tick and enters the
                        3-month notice pipeline at slot <code>NOTICE_PERIOD_MONTHS − 1</code>:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`quitters = stochasticRound(active × VOLUNTARY_QUIT_RATE_PER_TICK = 0.0003)
→ voluntaryDeparting[NOTICE_PERIOD_MONTHS − 1]  (slot furthest from release)`}
                    </pre>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>2.2 Retirement (per-tick, active workers)</h3>
                    <p>
                        Workers at or above <code>RETIREMENT_AGE = 67</code> retire with a per-tick probability derived
                        from an annual rate that ramps from 10 % at age 67 to 100 % at age 82:
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
                        The population subsystem maintains a full age-structured demography: a cohort array indexed by
                        age (0–100), each cell broken down by occupation × education × skill. The per-tick update
                        applies mortality, disability, retirement of non-workers, food consumption, and births.
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>3.1 Mortality</h3>
                    <p>
                        Mortality has three additive annual components: age-dependent base, environmental (pollution +
                        disasters), and starvation. The starvation term splits into a linear base amplification and an
                        acute S⁴ term that captures extreme famine lethality:
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

                    <h3 className='text-xl font-semibold mt-6 mb-2'>3.2 Food Consumption &amp; Starvation</h3>
                    <p>
                        Each population cell maintains its own food <code>inventory</code> (replenished by the market).
                        Consumption is drawn from the personal buffer; if it runs dry the deficit raises the cell-level
                        starvation index S:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`foodConsumed      = min(foodStock, total × FOOD_PER_PERSON_PER_TICK)
nutritionalFactor = foodConsumed / (total × FOOD_PER_PERSON_PER_TICK)
shortfall         = clamp(1 − nutritionalFactor, 0, 1)

α = 1 / STARVATION_ADJUST_TICKS  (= 1/30, ~one-month time-constant)
S(t+1) = S(t) + α × (shortfall − S(t))`}
                    </pre>
                    <p className='mt-2 text-sm text-muted-foreground'>
                        S over 120 ticks: total famine then recovery (red), chronic 50 % supply (blue), full supply
                        (green).
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
                        probability (§2.2). They transition directly to <code>unableToWork</code> without a notice
                        pipeline.
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
                    <p className='mt-2 text-sm text-muted-foreground'>
                        Effective TFR and per-woman annual births as a function of S (no pollution):
                    </p>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 4. HIRE / FIRE (monthly)                                          */}
                {/* ---------------------------------------------------------------- */}
                <section id='workforce-hire'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>4. Worker Allocation &amp; Hire/Fire (monthly)</h2>
                    <p>
                        Hiring and firing happen only at month boundaries (<code>tick % 30 === 0</code>) to prevent
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
                        <code>unoccupied</code> pool. New workers are placed at their exact population age (not
                        aggregated as moments):
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`gap = target[edu] − currentActive[edu]
if gap > 0:
    hire min(gap, unoccupied[edu]) workers
    workforce[exact age][edu][skill].active += count`}
                    </pre>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>4.3 Firing</h3>
                    <p>
                        When overstaffed beyond the 5 % buffer, workers are fired youngest-age-first (lowest tenure
                        proxy) and enter the 3-month <code>departingFired</code> pipeline:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`surplus = currentActive − target
if surplus > currentActive × 0.05:
    fire age 0 upward until surplus removed
    → departingFired[NOTICE_PERIOD_MONTHS − 1]   (NOTICE_PERIOD_MONTHS = 3)`}
                    </pre>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 5. PRE-PRODUCTION FINANCIAL TICK                                  */}
                {/* ---------------------------------------------------------------- */}
                <section id='financial-pre'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>5. Pre-Production Financial Tick (every tick)</h2>
                    <p>
                        The financial subsystem implements a <strong>double-entry monetary system</strong> with a single
                        planetary bank. Money is created exclusively via loan issuance and destroyed via repayment.
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>5.1 Balance Sheet Invariant</h3>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`bank.deposits = Σ agent.deposits + bank.householdDeposits
bank.equity   = bank.deposits − bank.loans`}
                    </pre>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>5.2 Wage Payment</h3>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`1. wageBill = Σ_edu (active[edu] + departing[edu]) × wage[edu]
   DEFAULT_WAGE_PER_EDU = 1.0  (overridable via planet.wagePerEdu)

2. Working-capital loan if deposits < wageBill (MONEY CREATION):
     shortfall        = wageBill − deposits
     bank.loans       += shortfall
     bank.deposits    += shortfall
     agent.deposits   += shortfall

3. Pay wages (firm → household sub-accounts):
     agent.deposits         −= wageBill
     bank.householdDeposits += wageBill   (distributed per workforce cell)`}
                    </pre>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 6. PRODUCTION TICK                                                */}
                {/* ---------------------------------------------------------------- */}
                <section id='production'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>6. Production Tick (every tick)</h2>
                    <p>
                        Each agent&apos;s production facilities are evaluated every tick. The worker allocation problem
                        is solved by a <strong>water-fill (communicating vessels) algorithm</strong> that maximises the
                        minimum fill ratio across all worker slots, with upward cascading for overqualified workers.
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>6.1 Age-Dependent Productivity</h3>
                    <p>
                        The effective headcount of each education level is adjusted by a mean-age multiplier. Departing
                        workers contribute at <code>DEPARTING_EFFICIENCY = 0.5</code>:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`φ_age(μ):
    μ ≤ 18        → 0.80
    18 < μ < 30   → 0.80 + (μ−18) × 0.20/12
    30 ≤ μ ≤ 50   → 1.00
    50 < μ < 65   → 1.00 − (μ−50) × 0.15/15
    μ ≥ 65        → max(0.70, 0.85 − (μ−65) × 0.15/15)

μ = weighted mean age across all workforce cells for that education level`}
                    </pre>
                    <p className='mt-2 text-sm text-muted-foreground'>
                        Age-productivity multiplier across the full age range:
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>6.2 Water-Fill Worker Allocation</h3>
                    <p>
                        Workers are distributed across job-education slots by a water-fill algorithm. Each worker tier
                        (lowest education first) raises all reachable under-filled slots to a common equilibrium fill
                        ratio before moving to the next tier. Higher-education workers can fill lower slots
                        (overqualification):
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`For each workerEdu in [none, primary, secondary, tertiary]:
  reachable = slots where jobEduIdx ≤ workerEduIdx AND slot not full
  sort reachable by current fill ratio ascending
  find equilibrium ratio that exhausts supply or fills all reachable slots
  assign workers to raise each slot to the equilibrium ratio

workerEfficiency[slot] = effectiveAssigned / (requirement × scale)`}
                    </pre>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>6.3 Resource Efficiency &amp; Output</h3>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`resourceEfficiency[r] = min(1, available_r / (need_r × scale))
overallEfficiency     = min(workerEfficiencyOverall, min over r of resourceEfficiency[r])

produced = stochasticRound(nominalOutput × scale × overallEfficiency)
consumed = ceil(nominalInput × scale × overallEfficiency)
pollution += pollutionPerTick × scale × overallEfficiency`}
                    </pre>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 7. AGENT PRICING (TÂTONNEMENT)                                   */}
                {/* ---------------------------------------------------------------- */}
                <section id='pricing'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>7. Agent Pricing — Tâtonnement (every tick)</h2>
                    <p>
                        After production, each automated agent sets its offer price for every resource it produces. The
                        algorithm is a <strong>gradient-descent tâtonnement</strong> that adjusts price based on the
                        previous tick&apos;s sell-through ratio. The offer quantity equals the full current inventory.
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`TARGET_SELL_THROUGH = 0.90   (aim to sell 90 % of offer per tick)
ADJUSTMENT_SPEED    = 0.20

sellThrough  = lastSold / offerQuantity
excessDemand = sellThrough − TARGET_SELL_THROUGH
factor       = clamp(1 + 0.20 × excessDemand, 0.95, 1.05)
newPrice     = clamp(price × factor, 0.01, 1_000_000)

offerQuantity = current storage inventory for this resource`}
                    </pre>
                    <p className='mt-2 text-sm text-muted-foreground'>
                        Price evolution from 1.0 for three sell-through scenarios over 80 ticks:
                    </p>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 7b. AGENT INPUT BUYING                                            */}
                {/* ---------------------------------------------------------------- */}
                <section id='buying'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>7b. Agent Input Buying (every tick)</h2>
                    <p>
                        In the same pricing step, each automated agent also posts <strong>buy orders</strong> for every
                        traded input resource its facilities require. The target is a rolling 30-tick input buffer; the
                        bid quantity equals the current shortfall against that target.
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>Buffer Target &amp; Shortfall</h3>
                        <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
{`INPUT_BUFFER_TARGET_TICKS = 30

targetQty = inputQuantity × facilityScale × 30
shortfall = max(0, targetQty − currentInventory)
bidStorageTarget = currentInventory + shortfall`}
                        </pre>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>Bid Price — Tâtonnement with Break-Even Ceiling</h3>
                    <p>
                        The bid price rises when the previous tick was under-filled (urgency premium), mirroring the
                        sell-side tâtonnement. Crucially, the bid is capped at the{' '}
                        <strong>break-even input price</strong> — the maximum an agent can rationally pay per unit of
                        input before the resulting output no longer covers the cost:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`breakEvenCeiling = Σ(outputQty × outputMarketPrice) / inputQty
  (per facility; agent takes the highest ceiling across all facilities using that input)

On first tick:
  bidPrice = min(marketPrice, breakEvenCeiling)

On subsequent ticks (symmetric two-segment tâtonnement, TARGET_FILL_RATE = 0.90):
  fillRate = lastBought / previousDemand

  fillRate = 0   → factor = PRICE_ADJUST_MAX_UP   (1.05)  — couldn't buy anything, bid up
  fillRate = 0.9 → factor = 1.0                           — at target, no change
  fillRate = 1   → factor = PRICE_ADJUST_MAX_DOWN (0.95)  — always fully filled, bid down

  bidPrice = clamp(bidPrice × factor, 0.01, breakEvenCeiling)`}
                    </pre>
                    <p className='mt-2'>
                        Without this ceiling, agents with access to cheap credit can keep outbidding the market until
                        input prices detach from output values entirely. The ceiling ensures that an agent buying coal
                        to produce steel will never pay more per ton of coal than the steel it generates is worth.
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>Sell-Side Reserve</h3>
                    <p>
                        Sell offers for a resource are additionally reduced by the total input reserve across all
                        facilities — an agent does not sell inputs it still needs for its own next-tick production:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`inputReserve[r] = Σ_facilities inputQuantity[r] × scale × INPUT_BUFFER_TARGET_TICKS
sellableQty     = max(0, inventory[r] − inputReserve[r])`}
                    </pre>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 8. INTERGENERATIONAL TRANSFERS                                    */}
                {/* ---------------------------------------------------------------- */}
                <section id='transfers'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>8. Intergenerational Transfers (every tick)</h2>
                    <p>
                        Family support flows redistribute food inventory (and the wealth used to buy it) between age
                        groups via a multi-modal Gaussian support kernel. Transfers run <em>before</em> market clearing
                        so dependents arrive at the market with their supporters&apos; wealth.
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`Kernel peaks at k × GENERATION_GAP for k = 1, 2
  GENERATION_GAP = 25 years,  SUPPORT_WEIGHT_SIGMA = 6 years

weight(supporter_age → dependent_age) ∝
    Σ_{k=1}^{2} exp(−(dependent_age − supporter_age − k×25)² / (2×6²))

For each supporter with food surplus:
  transfer food to dependents proportional to weight × need × population

Global invariant: Σ all transfers = 0   (purely redistributive, zero-sum)`}
                    </pre>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 9. MARKET CLEARING                                                */}
                {/* ---------------------------------------------------------------- */}
                <section id='market'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>9. Market Clearing (every tick)</h2>
                    <p>
                        The market is a general <strong>price-priority order book</strong> that clears any number of
                        resources. Currently food (agricultural product) is the only traded good; further goods can be
                        added by registering a demand rule. Multiple competing agents each post independent ask orders
                        so market outcomes are driven by competitive pricing.
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>9.1 Ask Orders (Agents)</h3>
                    <p>
                        Each agent with a registered sell offer contributes an ask at its current offer price (set by
                        the pricing step above) and its full current inventory as quantity.
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>9.2 Bid Orders (Households)</h3>
                    <p>
                        Household demand is generated from population demography. Each cohort cell bids to fill its food
                        buffer to a 30-day target, limited by per-capita wealth:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`FOOD_BUFFER_TARGET_TICKS = 30
foodTargetPerPerson = 30 × FOOD_PER_PERSON_PER_TICK

desiredQty    = max(0, foodTargetPerPerson − inventoryPerPerson)
affordableQty = wealthMeanPerPerson / referencePrice
bidQty        = min(desiredQty, affordableQty) × population
reservPrice   = wealthMeanPerPerson / desiredQty   (willing to spend all wealth)`}
                    </pre>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>9.3 Matching &amp; Settlement</h3>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`1. Sort bids  descending  by reservationPrice
2. Sort asks  ascending   by askPrice
3. Walk bids; for each bid fill from cheapest asks where askPrice ≤ bidPrice
4. Trade price = ask price  (seller-price convention)
5. VWAP → planet.marketPrices[resource]

Settlement:
  household inventory[resource] += allocated quantity
  household wealth              −= cost
  agent.deposits                += revenue`}
                    </pre>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 10. POST-PRODUCTION FINANCIAL TICK                                */}
                {/* ---------------------------------------------------------------- */}
                <section id='financial-post'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>10. Post-Production Financial Tick (every tick)</h2>
                    <p>
                        After market clearing, automated agents repay outstanding loans using a{' '}
                        <strong>retained-earnings threshold</strong> so that firms always keep a working-capital buffer
                        before repaying:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`RETAINED_EARNINGS_THRESHOLD = 1.5

retainedThreshold = lastWageBill × 1.5
excessDeposits    = max(0, deposits − retainedThreshold)
repayment         = min(agentLoan, excessDeposits, bank.loans)

agent.deposits −= repayment
agent.loans    −= repayment
bank.loans     −= repayment   (MONEY DESTRUCTION)
bank.deposits  −= repayment`}
                    </pre>
                    <p className='mt-2'>
                        Because revenue is distributed competitively via the order book rather than through a single
                        wage-bill cycle, the money supply does <strong>not</strong> return to zero after each tick.
                        Persistent bank balances and inter-agent wealth divergence accumulate naturally as agents
                        differentiate in profitability.
                    </p>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 11. LABOR MARKET MONTH TICK                                       */}
                {/* ---------------------------------------------------------------- */}
                <section id='labor-month'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>11. Labor Market Month Tick (every 30 ticks)</h2>
                    <p>
                        At every month boundary the three departure pipelines are advanced by one slot. Workers at slot
                        0 (soonest to leave) are released:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`voluntaryDeparting[0] + departingFired[0]  → population unoccupied
departingRetired[0]                        → population unableToWork

Shift pipelines:
  [m] ← [m+1]  for m = 0 … NOTICE_PERIOD_MONTHS−2
  [NOTICE_PERIOD_MONTHS−1] ← 0`}
                    </pre>
                    <p>
                        This step also rotates the per-agent death and disability event counters (<code>thisMonth</code>{' '}
                        → <code>prevMonth</code>) for observability in the frontend.
                    </p>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 12. POPULATION YEAR TICK                                          */}
                {/* ---------------------------------------------------------------- */}
                <section id='population-year'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>12. Population Year Tick (every 360 ticks)</h2>
                    <p>Once per year the entire population ages by one year and education transitions are applied.</p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>12.1 Aging</h3>
                    <p>
                        Every cohort at age <em>a</em> is moved to <em>a + 1</em> via a descending loop to avoid
                        aliasing. Cohort 0 is cleared and will be repopulated over the coming year by per-tick births.
                    </p>

                    <h3 className='text-xl font-semibold mt-6 mb-2'>12.2 Education Graduation and Dropout</h3>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`P_grad(a, L):
  a < graduationAge_L → graduationPreAgeProbability_L ^ (graduationAge_L − a)
  else                → graduationProbability_L

graduates     = floor(count × P_grad)
transitioners = floor(graduates × transitionProbability_L)  → next level
dropouts      = graduates − transitioners                    → unoccupied

P_dropout(a, L):
  a < graduationAge + spread → genericDropoutProbability_L
  a = graduationAge + spread → 0.5
  a > graduationAge + spread → 0.95

Level parameters  (type / graduationAge / P_grad / P_transition / P_dropout):
  none       9    0.90   0.95   0.00
  primary   17    0.75   0.40   0.00
  secondary 22    0.50   0.30   0.06
  tertiary  27    0.10   0.00   0.10`}
                    </pre>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 13. WORKFORCE YEAR TICK                                           */}
                {/* ---------------------------------------------------------------- */}
                <section id='labor-year'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>13. Workforce Year Tick (every 360 ticks)</h2>
                    <p>
                        Once per year the entire workforce cohort array ages by one year, mirroring the population year
                        tick. Workers at <code>MAX_AGE</code> are carried forward until they die or retire:
                    </p>
                    <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                        {`snapshot workforce[MAX_AGE]
for age = MAX_AGE down to 1:
    workforce[age] ← workforce[age − 1]
    if age === MAX_AGE: merge snapshot into workforce[MAX_AGE]
workforce[0] ← empty cohort`}
                    </pre>
                </section>

                {/* ---------------------------------------------------------------- */}
                {/* 14. TICK ORDERING SUMMARY                                         */}
                {/* ---------------------------------------------------------------- */}
                <section id='tick-order'>
                    <h2 className='text-2xl font-bold mt-8 mb-3'>14. Tick Ordering Summary</h2>
                    <p>Within each tick the subsystems execute in the following order:</p>
                    <ol className='list-decimal list-inside space-y-1'>
                        <li>
                            <code>environmentTick</code> — pollution decay, resource regeneration
                        </li>
                        <li>
                            <code>workforceDemographicTick</code> — quits, retirement, mortality &amp; disability of
                            active workers (produces event accumulator)
                        </li>
                        <li>
                            <code>populationTick</code> — applies workforce events to demography, plus disability /
                            retirement of non-workers, food consumption, births
                        </li>
                        <li>
                            <em>(month boundary)</em> <code>automaticWorkerAllocation</code> — recompute demand targets
                            from last tick results
                        </li>
                        <li>
                            <em>(month boundary)</em> <code>hireWorkforce</code> — hire / fire to meet targets
                        </li>
                        <li>
                            <code>preProductionFinancialTick</code> — working-capital loans, wage payment
                        </li>
                        <li>
                            <code>productionTick</code> — water-fill allocation, output, resource consumption, pollution
                        </li>
                        <li>
                            <code>automaticPricing</code> — tâtonnement price update per resource per agent (sell-side
                            offers) and input buy orders with break-even ceiling
                        </li>
                        <li>
                            <code>intergenerationalTransfersForPlanet</code> — Gaussian food/wealth redistribution
                        </li>
                        <li>
                            <code>marketTick</code> — price-priority order-book clearing for all resources
                        </li>
                        <li>
                            <code>automaticLoanRepayment</code> — retained-earnings loan repayment (money destruction)
                        </li>
                        <li>
                            <em>(month boundary)</em> <code>postProductionLaborMarketTick</code> — notice pipeline
                            advance, population transfer of released workers
                        </li>
                        <li>
                            <em>(year boundary)</em> <code>populationAdvanceYearTick</code> — aging, education
                            transitions
                        </li>
                        <li>
                            <em>(year boundary)</em> <code>workforceAdvanceYearTick</code> — workforce cohort aging
                        </li>
                    </ol>
                    <p className='mt-4'>
                        Workforce demographic events (step 2) precede the population tick (step 3) so that deaths and
                        disabilities are removed from both the workforce and the demography consistently in the same
                        tick. Hiring and firing are monthly to prevent tick-level oscillation. The financial bracket
                        (steps 6 and 11) ensures wages are paid before production and loan repayment happens after
                        market revenue is received.
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
