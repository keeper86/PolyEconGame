export function ProductionPostSection() {
    return (
        <>
            {/* ---------------------------------------------------------------- */}
            {/* 9. PRODUCTION TICK                                                */}
            {/* ---------------------------------------------------------------- */}
            <section id='production'>
                <h2 className='text-2xl font-bold mt-8 mb-3'>9. Production Tick (every tick)</h2>
                <p>
                    Each agent&apos;s production facilities are evaluated every tick. The worker allocation problem is
                    solved by a <strong>water-fill (communicating vessels) algorithm</strong> that maximises the minimum
                    fill ratio across all worker slots, with upward cascading for overqualified workers.
                </p>
                <p>
                    Services are handled differently from goods at the output stage: service quantities are{' '}
                    <strong>accumulated as consumed</strong> rather than physically placed in a storage inventory, which
                    means service production interacts directly with the service buffers tracked per-facility and
                    per-cohort.
                </p>

                <h3 className='text-xl font-semibold mt-6 mb-2'>9.1 Age-Dependent Productivity</h3>
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

                <h3 className='text-xl font-semibold mt-6 mb-2'>9.2 Water-Fill Worker Allocation</h3>
                <p>
                    Workers are distributed across job-education slots by a water-fill algorithm. Each worker tier
                    (lowest education first) raises all reachable under-filled slots to a common equilibrium fill ratio
                    before moving to the next tier. Higher-education workers can fill lower slots (overqualification):
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`For each workerEdu in [none, primary, secondary, tertiary]:
  reachable = slots where jobEduIdx ≤ workerEduIdx AND slot not full
  sort reachable by current fill ratio ascending
  find equilibrium ratio that exhausts supply or fills all reachable slots
  assign workers to raise each slot to the equilibrium ratio

workerEfficiency[slot] = effectiveAssigned / (requirement × scale)`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>9.3 Resource Efficiency &amp; Output</h3>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`resourceEfficiency[r] = min(1, available_r / (need_r × scale))
overallEfficiency     = min(workerEfficiencyOverall, min over r of resourceEfficiency[r])

produced = stochasticRound(nominalOutput × scale × overallEfficiency)
consumed = ceil(nominalInput × scale × overallEfficiency)
pollution += pollutionPerTick × scale × overallEfficiency

For services output:
  agent.inventory[serviceResource] += produced   (will decay 20%/tick until sold)`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>9.4 Service Inputs to Production</h3>
                <p>
                    Many production facilities require services (especially logistics and administrative) as inputs.
                    Service inputs are <strong>consumed</strong> from the agent&apos;s service inventory (not removed
                    from a physical stock) in proportion to facility efficiency. If an agent lacks sufficient logistics
                    or administrative service, facility output is reduced exactly like any other input shortage.
                </p>
            </section>

            {/* ---------------------------------------------------------------- */}
            {/* 10. POST-PRODUCTION FINANCIAL TICK                                */}
            {/* ---------------------------------------------------------------- */}
            <section id='financial-post'>
                <h2 className='text-2xl font-bold mt-8 mb-3'>10. Post-Production Financial Tick (every tick)</h2>
                <p>
                    After production, automated agents repay outstanding loans using a{' '}
                    <strong>retained-earnings threshold</strong> so that firms always keep a working-capital buffer
                    before repaying:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`RETAINED_EARNINGS_THRESHOLD = 1.5

retainedThreshold = perTickWage × 1.5
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
                    At every month boundary the three departure pipelines are advanced by one slot. Workers at slot 0
                    (soonest to leave) are released:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`voluntaryDeparting[0] + departingFired[0]  → population unoccupied
departingRetired[0]                        → population unableToWork

Shift pipelines:
  [m] ← [m+1]  for m = 0 … NOTICE_PERIOD_MONTHS−2
  [NOTICE_PERIOD_MONTHS−1] ← 0`}
                </pre>
                <p>
                    This step also rotates the per-agent death and disability event counters (<code>thisMonth</code> →{' '}
                    <code>prevMonth</code>) for observability in the frontend.
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
                    Every cohort at age <em>a</em> is moved to <em>a + 1</em> via a descending loop to avoid aliasing.
                    Cohort 0 is cleared and will be repopulated over the coming year by per-tick births.
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
        </>
    );
}
