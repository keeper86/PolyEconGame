export function InterPlanetSection() {
    return (
        <>
            {/* ---------------------------------------------------------------- */}
            {/* 14. INTER-PLANET TICK                                             */}
            {/* ---------------------------------------------------------------- */}
            <section id='interplanet'>
                <h2 className='text-2xl font-bold mt-8 mb-3'>14. Inter-Planet Tick (every tick)</h2>
                <p>
                    After all per-planet loops have run, three global systems execute in sequence:{' '}
                    <strong>forex market clearing</strong>, <strong>forex market-maker repayment</strong>, and{' '}
                    <strong>ship state transitions</strong>. These systems operate across planet boundaries and cannot
                    run inside the per-planet loop.
                </p>

                {/* ---- 14.1 CURRENCIES ---------------------------------------- */}
                <h3 className='text-xl font-semibold mt-6 mb-2'>14.1 Multiple Currencies</h3>
                <p>
                    Each of the seven inhabited planets issues its own currency. Currencies are modelled as a special
                    resource form (<code>form: &apos;currency&apos;</code>) with zero mass and zero volume — they bypass
                    all storage accounting. Agent assets held on a planet are denominated in that planet&apos;s
                    currency; there is no single reserve currency.
                </p>
                <div className='overflow-x-auto'>
                    <table className='text-sm w-full border-collapse'>
                        <thead>
                            <tr className='bg-muted'>
                                <th className='text-left p-2 border'>Planet</th>
                                <th className='text-left p-2 border'>Currency</th>
                                <th className='text-left p-2 border'>Symbol</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                ['Earth', 'Eartho', '€'],
                                ['Gune', 'Wüsten-Dollar', '₩'],
                                ['Icedonia', 'Liquido', '₤'],
                                ['Paradies', 'Paradies-Pesete', '₽'],
                                ['Suerte', 'Scheine', '$'],
                                ['Pandara', 'Naaavi', '₦'],
                                ['Alpha-Centauri', 'Alphas', '₳'],
                            ].map(([planet, currency, symbol]) => (
                                <tr key={planet}>
                                    <td className='p-2 border'>{planet}</td>
                                    <td className='p-2 border'>{currency}</td>
                                    <td className='p-2 border'>{symbol}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ---- 14.2 FOREX --------------------------------------------- */}
                <h3 className='text-xl font-semibold mt-6 mb-2'>14.2 Foreign Exchange Market</h3>
                <p>
                    Each planet hosts a forex market where its residents can buy and sell foreign currencies. The forex
                    market uses the same price-priority order-book engine as the goods market, but clears in a dedicated{' '}
                    <code>forexTick()</code> step. Exchange rates are expressed as units of local currency per unit of
                    foreign currency.
                </p>

                <h4 className='text-lg font-semibold mt-4 mb-2'>Market Makers</h4>
                <p>
                    Three automated market-maker (MM) agents are created per planet. At initialisation each MM receives
                    a working-capital loan from the home bank and seed loans in every foreign currency from the
                    respective foreign banks:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`FOREX_MM_COUNT         = 3     (per planet)
FOREX_MM_WORKING_CAPITAL = 100,000  (home currency, funded by home bank loan)
FOREX_MM_SEED_LOAN     = 100,000  (per foreign currency, funded by that planet's bank)
FOREX_MM_TARGET_DEPOSIT = 100,000  (inventory reference level)`}
                </pre>

                <h4 className='text-lg font-semibold mt-4 mb-2'>Dynamic Spread Pricing</h4>
                <p>
                    Before each forex clearing, <code>forexMarketMakerPricing()</code> updates every MM&apos;s bid/ask
                    prices based on its current inventory level relative to the target. An over-stocked MM narrows its
                    spread to encourage sales; an under-stocked MM widens it to slow purchases:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`inventoryRatio = clamp(inventory / TARGET_DEPOSIT, 0, 2)
skew           = (inventoryRatio − 1) × MAX_SKEW

askPrice = mid × (1 + BASE_SPREAD − skew)   (selling foreign currency)
bidPrice = mid × (1 − BASE_SPREAD − skew)   (buying foreign currency)

BASE_SPREAD = 0.03   (3 % half-spread at neutral inventory)
MAX_SKEW    = 0.02   (up to ±2 % inventory adjustment)

mid is the EMA of the last clearing price (α = 1/30, one-month half-life)`}
                </pre>

                <h4 className='text-lg font-semibold mt-4 mb-2'>Clearing &amp; Settlement</h4>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`1. Collect asks (currency sellers): supply = balance − hold − retainment
2. Collect bids (currency buyers):  demand = storageTarget − currentDeposits
   Scale bids if total cost > available local deposits
3. Sort asks ascending by price, bids descending by price
4. Match until exhausted; trade price = ask price
5. Settlement:
     seller: local currency += revenue,  foreign currency −= sold
     buyer:  local currency −= cost,     foreign currency += bought
6. Clearing price → EMA update (α = 1/30)
7. Record lastMarketResult[currency]: clearingPrice, volume, unfilledDemand`}
                </pre>

                <h4 className='text-lg font-semibold mt-4 mb-2'>Market-Maker Loan Repayment</h4>
                <p>
                    After clearing, <code>forexMMRepaymentTick()</code> repays MM loans from excess deposits, retaining
                    a minimum cushion:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`FOREX_MM_RETAIN_RATIO = 0.5   (retain 50 % of target before repaying)

For each MM on each planet:
  retainFloor = FOREX_MM_TARGET_DEPOSIT × 0.5
  excess      = max(0, deposits − retainFloor)
  repayment   = min(loans, excess)
  deposits    −= repayment
  loans       −= repayment   (symmetric bank update → money destruction)`}
                </pre>

                {/* ---- 14.3 SHIPPING ------------------------------------------ */}
                <h3 className='text-xl font-semibold mt-6 mb-2'>14.3 Shipping</h3>
                <p>
                    Physical goods move between planets via ships operating on <strong>transport contracts</strong>.
                    Ships advance through a state machine each tick in <code>shipTick()</code>, which runs last in the
                    inter-planet sequence.
                </p>

                <h4 className='text-lg font-semibold mt-4 mb-2'>Ship Types</h4>
                <div className='overflow-x-auto'>
                    <table className='text-sm w-full border-collapse'>
                        <thead>
                            <tr className='bg-muted'>
                                <th className='text-left p-2 border'>Category</th>
                                <th className='text-left p-2 border'>Examples</th>
                                <th className='text-left p-2 border'>Cargo Forms</th>
                                <th className='text-left p-2 border'>Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className='p-2 border font-medium'>Transport</td>
                                <td className='p-2 border'>Bulk Carrier, Tanker, Freighter, Reefer, Gas Carrier</td>
                                <td className='p-2 border'>solid, liquid, gas, pieces, frozenGoods</td>
                                <td className='p-2 border'>Speed 5–8; volume 80k–200k (small hull)</td>
                            </tr>
                            <tr>
                                <td className='p-2 border font-medium'>Construction</td>
                                <td className='p-2 border'>Construction Vessel</td>
                                <td className='p-2 border'>Facility components</td>
                                <td className='p-2 border'>Delivers facility prefabs for remote build</td>
                            </tr>
                            <tr>
                                <td className='p-2 border font-medium'>Passenger</td>
                                <td className='p-2 border'>Passenger Liner</td>
                                <td className='p-2 border'>persons</td>
                                <td className='p-2 border'>Transfers workforce; build time 240 ticks</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <h4 className='text-lg font-semibold mt-4 mb-2'>Ship State Machine</h4>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`idle → loading → transporting → unloading → idle

idle:         ship available; agent can assign a contract
loading:      cargo being loaded at origin planet each tick
transporting: ship in transit; travelTime = ceil(1000 / speed) ticks
unloading:    cargo being unloaded at destination each tick
contract settle: reward transferred from poster's escrow to carrier's deposits

MAX_DISPATCH_TIMEOUT_TICKS = 60   (contract auto-aborts if loading not completed)`}
                </pre>

                <h4 className='text-lg font-semibold mt-4 mb-2'>Maintenance &amp; Ship Lifecycle</h4>
                <p>
                    Ships degrade during use and require <strong>maintenance services</strong> (not a separate fuel
                    resource) to keep operating. Degradation is 5× faster when the ship is actively transporting than
                    when idle. After 100 full repair cycles the ship becomes permanently derelict.
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`degradationRate:  transporting → 5×, idle → 1×
maintenanceCost:  consumed from agent's maintenance service inventory each tick
qualityFactor:    effective ship value = baseValue × qualityFactor − maintenancePenalty`}
                </pre>

                <h4 className='text-lg font-semibold mt-4 mb-2'>Ship Market</h4>
                <p>
                    Ships can be bought and sold on a per-type ship market. Price discovery uses an{' '}
                    <strong>EMA (α = 0.3)</strong> over recent trade prices. Bids and asks are matched by highest
                    surplus (offer − ask) first:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`SHIP_MARKET_EMA_ALPHA        = 0.3
SHIP_MARKET_MAX_TRADE_HISTORY = 100

effectiveValue = baseValue × qualityFactor − maintenanceCostPenalty
trades matched by: max(offer − ask) first`}
                </pre>
            </section>
        </>
    );
}
