export function PricingMarketSection() {
    return (
        <>
            {/* ---------------------------------------------------------------- */}
            {/* 7. AGENT PRICING (TÂTONNEMENT)                                   */}
            {/* ---------------------------------------------------------------- */}
            <section id='pricing'>
                <h2 className='text-2xl font-bold mt-8 mb-3'>7. Agent Pricing — Tâtonnement (every tick)</h2>
                <p>
                    After transfers, each automated agent sets its offer price for every resource it produces. The
                    algorithm is a <strong>gradient-descent tâtonnement</strong> that adjusts price based on the
                    previous tick&apos;s sell-through ratio. The effective sell quantity is calculated as inventory
                    minus a retainment amount (reserved for production inputs).
                </p>
                <p>
                    Services and goods use the same tâtonnement logic but with different <strong>buffer targets</strong>
                    : services target a 3-tick inventory buffer (reflecting their fast 20 %/tick decay), while goods
                    typically target a 10-tick buffer.
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`TARGET_SELL_THROUGH = 0.90   (aim to sell 90 % of offer per tick)
ADJUSTMENT_SPEED    = 0.20

effectiveQuantity = max(0, inventory − offerRetainment)
sellThrough  = lastSold / effectiveQuantity
excessDemand = sellThrough − TARGET_SELL_THROUGH
factor       = clamp(1 + 0.20 × excessDemand, 0.95, 1.05)
newPrice     = clamp(price × factor, 0.01, 1_000_000)

Buffer targets:
  Services  → 3 ticks   (rapid decay means small buffer is optimal)
  Goods     → 10 ticks  (slower decay tolerates larger buffer)

offerRetainment = reserved amount for production inputs (calculated from facility needs)`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>Service Depreciation Effect on Pricing</h3>
                <p>
                    Because unsold services lose 20 % of their value per tick, agents observe that their effective
                    sell-through appears high even at moderate prices — the decay forces aggressive pricing. Agents that
                    produce more services than they can sell see inventory shrink quickly regardless of price, which
                    feeds back into the tâtonnement as a high sell-through signal, causing prices to rise until
                    production matches demand.
                </p>
            </section>

            {/* ---------------------------------------------------------------- */}
            {/* 7b. AGENT INPUT BUYING                                            */}
            {/* ---------------------------------------------------------------- */}
            <section id='buying'>
                <h2 className='text-2xl font-bold mt-8 mb-3'>7b. Agent Input Buying (every tick)</h2>
                <p>
                    In the same pricing step, each automated agent also posts <strong>buy orders</strong> for every
                    traded input resource its facilities require. The target is a rolling 30-tick input buffer; the bid
                    quantity equals the current shortfall against that target.
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
                    sell-side tâtonnement. Crucially, the bid is capped at the <strong>break-even input price</strong> —
                    the maximum an agent can rationally pay per unit of input before the resulting output no longer
                    covers the cost:
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
                    Without this ceiling, agents with access to cheap credit can keep outbidding the market until input
                    prices detach from output values entirely. The ceiling ensures that an agent buying coal to produce
                    steel will never pay more per ton of coal than the steel it generates is worth.
                </p>

                <h3 className='text-xl font-semibold mt-6 mb-2'>Sell-Side Reserve</h3>
                <p>
                    Sell offers for a resource are additionally reduced by the total input reserve across all facilities
                    — an agent does not sell inputs it still needs for its own next-tick production:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`inputReserve[r] = Σ_facilities inputQuantity[r] × scale × INPUT_BUFFER_TARGET_TICKS
sellableQty     = max(0, inventory[r] − inputReserve[r])`}
                </pre>
            </section>

            {/* ---------------------------------------------------------------- */}
            {/* 8. MARKET CLEARING                                                */}
            {/* ---------------------------------------------------------------- */}
            <section id='market'>
                <h2 className='text-2xl font-bold mt-8 mb-3'>8. Market Clearing (every tick)</h2>
                <p>
                    The market is a general <strong>price-priority order book</strong> that clears all resources in a
                    single unified pass. Crucially, market clearing now runs <em>before</em> production — agents sell
                    last tick&apos;s output, then produce the next batch. This means that service inventories available
                    at the start of each tick were produced in the previous tick and may already be partially decayed.
                </p>
                <p>
                    <strong>Population bids only on services.</strong> Physical goods are traded exclusively between
                    agents (B2B). This separates the household demand signal cleanly from production input markets.
                </p>

                <h3 className='text-xl font-semibold mt-6 mb-2'>8.1 Ask Orders (Agents — goods &amp; services)</h3>
                <p>
                    Each agent with a registered sell offer contributes an ask at its current offer price (set by the
                    pricing step above) and its sellable inventory (after input reserve deduction) as quantity. Services
                    offered are additionally reduced by the 20 %/tick depreciation applied before the market runs.
                </p>

                <h3 className='text-xl font-semibold mt-6 mb-2'>8.2 Bid Orders (Households — services only)</h3>
                <p>
                    Household demand is generated in a single pass over the demography. Each cohort cell allocates its
                    available wealth sequentially across the eight services in strict priority order —{' '}
                    <strong>wealth exhausted by one service leaves nothing for lower-priority services</strong>:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`Priority order (household settlement sequence):
  1. Grocery         (survival; drives starvation index S)
  2. Healthcare      (reducesmortality & disability)
  3. Logistics       (infrastructure dependency)
  4. Education       (workforce advancement)
  5. Retail          (consumer goods)
  6. Construction    (infrastructure demand side)
  7. Administrative  (bureaucratic overhead)

For each cohort cell, for each service in priority order:
  bufferDeficit  = max(0, bufferTarget − currentBuffer)
  if bufferDeficit = 0: skip (buffer full)

  willingPrice   = marketPrice × 1.25 × (bufferDeficit / bufferTarget)
  affordableQty  = remainingWealth / willingPrice
  bidQty         = min(bufferDeficit, affordableQty) × population

  remainingWealth −= bidQty × willingPrice / population
  place bid(resource, bidQty, willingPrice)`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>8.3 Matching &amp; Settlement</h3>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`1. Sort bids  descending  by reservationPrice
2. Sort asks  ascending   by askPrice
3. Walk bids; for each bid fill from cheapest asks where askPrice ≤ bidPrice
4. Trade price = ask price  (seller-price convention)
5. VWAP → planet.marketPrices[resource]

Household settlement:
  cohort.services[resource].buffer += allocatedQty / population
  cohort.wealth.mean               −= cost / population

Agent settlement:
  agent.inventory[resource] −= soldQty
  agent.deposits             += revenue`}
                </pre>
            </section>

            {/* ---------------------------------------------------------------- */}
            {/* 8b. CONSTRUCTION TICK                                             */}
            {/* ---------------------------------------------------------------- */}
            <section id='construction'>
                <h2 className='text-2xl font-bold mt-8 mb-3'>8b. Construction Tick (every tick)</h2>
                <p>
                    After the market has cleared (so households have had the chance to purchase construction service),{' '}
                    <code>constructionTick</code> advances any pending facility scale-ups. This makes facility expansion
                    a multi-tick process driven by the availability of purchased construction service.
                </p>

                <h3 className='text-xl font-semibold mt-6 mb-2'>Facility Expansion State Machine</h3>
                <p>When an agent orders a facility scale-up, the facility moves into a construction state:</p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`ConstructionState = {
    constructionTargetMaxScale:           number,  // goal scale after expansion
    totalConstructionServiceRequired:     number,  // total service units needed
    maximumConstructionServiceConsumption: number,  // max units consumed per tick
    progress:                             number,  // cumulative investment so far
}

Each tick:
  consumed = min(availableConstructionService, maximumConsumption)
  progress += consumed
  agent.services.construction -= consumed

  if progress ≥ totalRequired:
    facility.maxScale  = constructionTargetMaxScale
    constructionState  = null   (expansion complete)`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>Construction Cost by Facility Tier</h3>
                <p>
                    The total construction service required for each unit of scale increase is proportional to a
                    tier-specific base multiplier:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`Cost per scale unit (approximate):
  Raw extraction      → base ×100
  Refined processing  → base ×200
  Manufactured goods  → base ×400
  Services            → base ×300
  Storage             → base ×150
  Management          → base ×250
  Ship construction   → base ×500

totalRequired ≈ (baseMultiplier × scale^1.1) / scale + 100`}
                </pre>
                <p>
                    Because construction consumes construction <em>service</em>, which itself requires a functioning
                    construction facility, bootstrap scenarios (first facility on a new planet) require either a starter
                    stock of service or a manual injection. Ships can deliver pre-stockpiled construction service from
                    another planet.
                </p>
            </section>
        </>
    );
}
