export function TickOrderSection() {
    return (
        <section id='tick-order'>
            <h2 className='text-2xl font-bold mt-8 mb-3'>15. Tick Ordering Summary</h2>
            <p>Within each tick the subsystems execute in the following order.</p>

            <h3 className='text-xl font-semibold mt-6 mb-2'>Per-Planet Loop</h3>
            <p className='text-sm text-muted-foreground mb-2'>
                Runs independently for every planet. Month-boundary steps run at <code>tick % 30 === 1</code> (start of
                month) or <code>tick % 30 === 0</code> (end of month); year-boundary at <code>tick % 360 === 0</code>.
            </p>
            <ol className='list-decimal list-inside space-y-1'>
                <li>
                    <em>(start of month)</em> <code>resetAgentMetrics</code> — clear per-month counters for agents and
                    forex market makers
                </li>
                <li>
                    <code>environmentTick</code> — pollution decay, renewable resource regeneration
                </li>
                <li>
                    <code>governmentTick</code> — water-fill wealth redistribution to the poorest population cohorts
                </li>
                <li>
                    <code>workforceDemographicTick</code> — voluntary quits, retirement, mortality & disability of
                    active workers (produces event accumulator)
                </li>
                <li>
                    <code>populationTick</code> — applies workforce events to demography; disability / retirement of
                    non-workers; grocery service buffer consumption & starvation update; births
                </li>
                <li>
                    <code>automaticWorkerAllocation</code> — recompute demand targets from last tick results
                </li>
                <li>
                    <code>hireWorkforce</code> — hire / fire to meet targets
                </li>
                <li>
                    <code>claimBillingTick</code> — charge agents for land and resource claim maintenance
                </li>
                <li>
                    <code>maturesLoans</code> — call in loans that have reached maturity
                </li>
                <li>
                    <code>preProductionFinancialTick</code> — working-capital loans & wage payment (firm → households)
                </li>
                <li>
                    <code>intergenerationalTransfersForPlanet</code> — 5-phase family wealth redistribution (grocery
                    buffer gap driven)
                </li>
                <li>
                    <code>updateProductionCostFloors</code> — recompute per-facility cost floor for break-even pricing
                </li>
                <li>
                    <code>automaticPricing</code> — tâtonnement sell-price update per resource per agent; input buy
                    orders with break-even ceiling (services use 5-tick buffer; goods use 30-tick buffer)
                </li>
                <li>
                    <code>marketTick</code> — unified price-priority order-book clearing;{' '}
                    <code>buildPopulationDemand</code> generates service-only household bids (priority: Grocery →
                    Healthcare → Logistics → Education → Retail → Construction → Administrative → Maintenance)
                </li>
                <li>
                    <code>accumulatePlanetPrices</code> — EMA update of reference market prices
                </li>
                <li>
                    <code>constructionTick</code> — advance facility scale-up progress using purchased construction
                    service; unlock new <code>maxScale</code> when complete
                </li>
                <li>
                    <code>productionTick</code> — water-fill worker allocation, resource efficiency, output generation,
                    input consumption, pollution
                </li>
                <li>
                    <code>automaticWageAdjustment</code> — tâtonnement wage adjustment per education level (±2 % based
                    on vacancy rate; runs every tick)
                </li>
                <li>
                    <code>updateAgentProductionScale</code> — signal-based facility scale and construction decisions
                </li>
                <li>
                    <em>(end of month)</em> <code>postProductionLaborMarketTick</code> — advance notice pipelines;
                    release workers to population
                </li>
                <li>
                    <em>(end of year)</em> <code>populationAdvanceYearTick</code> — age all cohorts; education
                    graduation & dropout
                </li>
                <li>
                    <em>(end of year)</em> <code>workforceAdvanceYearTick</code> — workforce cohort aging
                </li>
            </ol>

            <h3 className='text-xl font-semibold mt-6 mb-2'>Inter-Planet Loop</h3>
            <p className='text-sm text-muted-foreground mb-2'>
                Runs once per tick after all per-planet loops complete.
            </p>
            <ol className='list-decimal list-inside space-y-1' start={23}>
                <li>
                    <code>forexMarketMakerPricing</code> — update MM bid/ask prices based on inventory skew
                </li>
                <li>
                    <code>forexTick</code> — clear forex order books for all currency pairs; settle currency exchanges
                </li>
                <li>
                    <code>forexMMRepaymentTick</code> — repay MM bank loans from excess deposits
                </li>
                <li>
                    <code>shipTick</code> — advance ship state machines (loading → transporting → unloading → idle);
                    settle completed contracts
                </li>
                <li>
                    <code>shipbuilderTick</code> — NPC shipbuilder lists completed ships and evaluates new build orders
                </li>
                <li>
                    <code>arbitrageTraderTick</code> — NPC arbitrage traders scan cross-planet price differentials and
                    dispatch ships
                </li>
            </ol>

            <h3 className='text-xl font-semibold mt-6 mb-2'>Design Rationale</h3>
            <p>Several ordering choices are deliberate:</p>
            <ul className='list-disc list-inside space-y-1 mt-2'>
                <li>
                    <strong>Workforce events before population (steps 4–5)</strong>: deaths and disabilities are removed
                    from both the workforce and the demography in the same tick, avoiding double-counting.
                </li>
                <li>
                    <strong>Transfers before pricing (steps 11 & 13)</strong>: dependents receive family wealth before
                    the market opens, so their buying power is reflected in demand signals.
                </li>
                <li>
                    <strong>Market before production (steps 14–17)</strong>: agents sell last ticks inventory first,
                    then produce; this means households receive services the tick after they are produced, and service
                    depreciation acts on unsold inventory between production and the next clearing.
                </li>
                <li>
                    <strong>Construction before production (steps 16–17)</strong>: newly unlocked facility scale becomes
                    available within the same tick that completes the construction, not one tick later.
                </li>
                <li>
                    <strong>Wages before production (step 10)</strong>: firms pay wages before producing, ensuring
                    households have purchasing power in the same tick that goods hit the market.
                </li>
                <li>
                    <strong>Forex and ships after all planets (steps 23–28)</strong>: inter-planet flows depend on final
                    per-planet state; processing them last guarantees consistency.
                </li>
            </ul>
        </section>
    );
}
