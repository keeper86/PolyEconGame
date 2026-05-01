export function OverviewSection() {
    return (
        <>
            {/* ---------------------------------------------------------------- */}
            {/* 0. OVERVIEW                                                       */}
            {/* ---------------------------------------------------------------- */}
            <section id='overview'>
                <h2 className='text-2xl font-bold mt-8 mb-3'>0. Overview &amp; Time Units</h2>
                <p>
                    The simulation runs on a single global <code>GameState</code> that holds a set of{' '}
                    <strong>planets</strong> and a map of <strong>agents</strong>. Each agent can operate on multiple
                    planets simultaneously; all per-planet state (workforce, storage, market orders) is held inside{' '}
                    <code>agent.assets[planetId]</code>.
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`TICKS_PER_MONTH = 30
TICKS_PER_YEAR  = 360   (= 30 × 12)
SERVICE_PER_PERSON_PER_TICK = 1 / 30   (1 unit grocery / person / month)`}
                </pre>
                <p>
                    Every tick the top-level <code>advanceTick</code> function iterates over all planets and applies
                    every subsystem in a fixed order. Month-boundary and year-boundary steps run conditionally only when{' '}
                    <code>tick % 30 === 1</code> (start of month) or <code>tick % 30 === 0</code> (end of month) and{' '}
                    <code>tick % 360 === 0</code> (end of year) respectively.
                </p>
                <p>
                    The game simulates <strong>7 inhabited planets</strong>, each with its own currency. Multi-planet
                    trade is settled by an inter-planet <strong>forex market</strong> that runs after all per-planet
                    loops. Physical goods between planets move via <strong>ships</strong> operating on transport
                    contracts.
                </p>
                <p>
                    Education levels used throughout are: <code>none</code>, <code>primary</code>,{' '}
                    <code>secondary</code>, <code>tertiary</code>. Population cells are indexed by{' '}
                    <code>[age][occupation][education][skill]</code>, where occupations are <code>unoccupied</code>,{' '}
                    <code>employed</code>, <code>education</code>, <code>unableToWork</code>.
                </p>
            </section>

            {/* ---------------------------------------------------------------- */}
            {/* 0b. SERVICES PRODUCT TIER                                         */}
            {/* ---------------------------------------------------------------- */}
            <section id='services'>
                <h2 className='text-2xl font-bold mt-8 mb-3'>0b. Services — The Fourth Product Tier</h2>
                <p>
                    Goods in the economy are organised into four tiers: <em>raw materials</em>, <em>refined goods</em>,{' '}
                    <em>manufactured goods</em>, and — the newest tier — <strong>services</strong>. Services are
                    intangible: they have zero mass and zero storage volume, so they are never physically transported.
                    They are the most labour-intensive output, requiring large skilled workforces to produce.
                </p>
                <p>
                    <strong>Population only demands services.</strong> Households never bid on raw, refined, or
                    manufactured goods directly. Those goods flow entirely through business-to-business supply chains
                    that ultimately feed into service facilities, which convert them into the eight services households
                    consume.
                </p>

                <h3 className='text-xl font-semibold mt-6 mb-2'>The Eight Service Types</h3>
                <div className='overflow-x-auto'>
                    <table className='text-sm w-full border-collapse'>
                        <thead>
                            <tr className='bg-muted'>
                                <th className='text-left p-2 border'>Service</th>
                                <th className='text-left p-2 border'>Role</th>
                                <th className='text-right p-2 border'>Buffer Target (ticks)</th>
                                <th className='text-right p-2 border'>Consumption Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className='p-2 border font-medium'>Grocery</td>
                                <td className='p-2 border'>Prevents starvation; highest survival priority</td>
                                <td className='text-right p-2 border'>30</td>
                                <td className='text-right p-2 border'>1/30 per person/tick</td>
                            </tr>
                            <tr>
                                <td className='p-2 border font-medium'>Healthcare</td>
                                <td className='p-2 border'>Reduces mortality &amp; disability rates</td>
                                <td className='text-right p-2 border'>4</td>
                                <td className='text-right p-2 border'>1/30 per person/tick</td>
                            </tr>
                            <tr>
                                <td className='p-2 border font-medium'>Logistics</td>
                                <td className='p-2 border'>Material flow; required by many production chains</td>
                                <td className='text-right p-2 border'>4</td>
                                <td className='text-right p-2 border'>1/30 per person/tick</td>
                            </tr>
                            <tr>
                                <td className='p-2 border font-medium'>Education</td>
                                <td className='p-2 border'>Workforce skill advancement</td>
                                <td className='text-right p-2 border'>2</td>
                                <td className='text-right p-2 border'>1/30 per person/tick</td>
                            </tr>
                            <tr>
                                <td className='p-2 border font-medium'>Retail</td>
                                <td className='p-2 border'>Consumer goods distribution</td>
                                <td className='text-right p-2 border'>10</td>
                                <td className='text-right p-2 border'>1/30 per person/tick</td>
                            </tr>
                            <tr>
                                <td className='p-2 border font-medium'>Construction</td>
                                <td className='p-2 border'>Enables facility scale-up (see §8b)</td>
                                <td className='text-right p-2 border'>2</td>
                                <td className='text-right p-2 border'>1/60 per person/tick</td>
                            </tr>
                            <tr>
                                <td className='p-2 border font-medium'>Administrative</td>
                                <td className='p-2 border'>Bureaucratic overhead for complex operations</td>
                                <td className='text-right p-2 border'>3</td>
                                <td className='text-right p-2 border'>1/45 per person/tick</td>
                            </tr>
                            <tr>
                                <td className='p-2 border font-medium'>Maintenance</td>
                                <td className='p-2 border'>Equipment &amp; infrastructure upkeep</td>
                                <td className='text-right p-2 border'>3</td>
                                <td className='text-right p-2 border'>1/30 per person/tick</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <h3 className='text-xl font-semibold mt-6 mb-2'>Fast Decay</h3>
                <p>
                    Services stored in an agent&apos;s inventory depreciate rapidly each tick. This creates strong
                    pressure to match production volume with current demand — over-production is automatically
                    penalised:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`SERVICE_DEPRECIATION_RATE_PER_TICK = 0.20   (20 % of inventory lost per tick)

effectiveInventory(t+1) = inventory(t) × (1 − 0.20)

An unsold stockpile halves in ≈ 3 ticks; goods inventories do not decay.`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>Service Buffers vs Goods Inventory</h3>
                <p>
                    Population cells maintain a per-service <strong>buffer</strong> (denominated in ticks of coverage)
                    rather than a mass-based inventory. Each tick the buffer is drawn down by the consumption rate; the
                    market refills it. The buffer directly feeds starvation and disability calculations — if the grocery
                    buffer runs dry, starvation starts rising immediately.
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`buffer(t+1) = buffer(t) − SERVICE_PER_PERSON_PER_TICK × population   (consumption)
            + allocatedFromMarket(t)                                    (purchase)

Starvation is only driven by the Grocery service buffer; other services
affect mortality and disability but not the starvation index S.`}
                </pre>
            </section>
        </>
    );
}
