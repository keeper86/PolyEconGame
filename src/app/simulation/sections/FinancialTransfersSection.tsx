export function FinancialTransfersSection() {
    return (
        <>
            {/* ---------------------------------------------------------------- */}
            {/* 5. PRE-PRODUCTION FINANCIAL TICK                                  */}
            {/* ---------------------------------------------------------------- */}
            <section id='financial-pre'>
                <h2 className='text-2xl font-bold mt-8 mb-3'>5. Pre-Production Financial Tick (every tick)</h2>
                <p>
                    The financial subsystem implements a <strong>double-entry monetary system</strong> with a single
                    planetary bank. Money is created exclusively via loan issuance and destroyed via repayment.
                </p>

                <h3 className='text-xl font-semibold mt-6 mb-2'>5.1 Claim Billing</h3>
                <p>
                    Before wages are paid, <code>claimBillingTick</code> charges agents for land and resource claims
                    they hold. Extraction claims (mines, farms, water rights) incur a per-tick maintenance cost
                    proportional to their current extraction rate:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`For each resource claim owned by agent:
  maintenanceCost = claim.extractionRate × claim.costPerUnit
  agent.deposits  −= maintenanceCost
  planet.bank.deposits += maintenanceCost   (revenue to planet treasury)`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>5.2 Balance Sheet Invariant</h3>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`bank.deposits = Σ agent.deposits + bank.householdDeposits
bank.equity   = bank.deposits − bank.loans`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>5.3 Wage Payment</h3>
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
            {/* 6. INTERGENERATIONAL TRANSFERS                                    */}
            {/* ---------------------------------------------------------------- */}
            <section id='transfers'>
                <h2 className='text-2xl font-bold mt-8 mb-3'>6. Intergenerational Transfers (every tick)</h2>
                <p>
                    Family support flows redistribute wealth between age groups so that dependents (children, elderly)
                    can purchase the grocery service they need to avoid starvation. Transfers run <em>before</em> market
                    clearing so that dependents arrive at the market with their supporters&apos; wealth. The algorithm
                    runs in five phases.
                </p>

                <h3 className='text-xl font-semibold mt-6 mb-2'>Phase 1: Pre-aggregate Cache</h3>
                <p>
                    A lightweight per-<code>(age, occupation, education)</code> aggregate is built to avoid redundant
                    iterations across the demography matrix:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`CellAggregate[age][occ][edu] = {
    pop:           total population in cell,
    wealth:        { mean, variance },   // Gaussian moments
    groceryBuffer: total service units held
}`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>Phase 2: Survivor Surplus</h3>
                <p>
                    For each age ≥ <code>MIN_EMPLOYABLE_AGE = 14</code>, the algorithm estimates how much wealth is
                    reliably transferable. Wealth inequality within the cohort reduces the effective surplus — a highly
                    unequal cohort has many poor individuals who cannot actually contribute:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`naiveSurplus      = max(0, mean_wealth − baseGroceryCost)

cv²               = variance / mean²          (coefficient of variation squared)
alpha             = 1 / (1 + cv²)             (α → 1 for homogeneous cohort)

effectiveSurplus  = alpha × naiveSurplus × population
→ survivalSurplusSnapshot[age]`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>Phase 3: Dependent Needs</h3>
                <p>
                    For each age the grocery buffer gap is converted to a wealth requirement, net of what the cohort can
                    self-fund:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`perCapitaBuffer  = groceryBuffer / population
gap              = max(0, targetPerPerson − perCapitaBuffer)

fillFraction     = min(1, buffer / target)
costGap          = gap × groceryPrice × (1 − fillFraction)   (diminishing urgency)

selfFund         = max(0, wealth.mean)
netNeed          = max(0, costGap − selfFund)
→ survivalNeeds[age]`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>Phase 4: Global Scarcity Matching</h3>
                <p>
                    If aggregate need exceeds aggregate surplus, all transfers are scaled proportionally so no age is
                    singled out:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`totalSupply    = Σ_age survivalSurplus[age]
totalDemand    = Σ_age survivalNeeds[age]
scarcityFactor = min(1, totalSupply / totalDemand)

dependentNeed_scaled[age] = dependentNeed[age] × scarcityFactor`}
                </pre>

                <h3 className='text-xl font-semibold mt-6 mb-2'>Phase 5: Intergenerational Matching</h3>
                <p>
                    For each dependent age (iterated in shuffled order to avoid systematic bias), support weights are
                    computed for every potential supplier age using a <strong>multi-harmonic Gaussian kernel</strong>{' '}
                    with peaks at typical family-generation offsets:
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`supportWeight(Δage):
  For n = −GENERATION_KERNEL_N … +GENERATION_KERNEL_N:
    amplitude = exp(−0.5 × |n|)   if n < 0 (children supporting parents)
              = exp(−0.5 × (n−1)) if n ≥ 0 (parents supporting children)
    target    = n × GENERATION_GAP
    w_n       = amplitude × exp(−(Δage − target)² / (2 × σ²))
  supportWeight = max over n

GENERATION_GAP        = 25 years
SUPPORT_WEIGHT_SIGMA  = 6 years
GENERATION_KERNEL_N   = 2   (considers harmonics at 0, ±25, ±50 years)

Strongest support links:
  Δage ≈ +25  →  parent → child
  Δage ≈ −25  →  adult child → elderly parent
  Δage ≈ +50  →  grandparent → grandchild   (moderate weight)
  Δage ≈ 0    →  sibling → sibling           (moderate weight)`}
                </pre>
                <p>
                    Wealth is debited from supplier cohorts proportional to their <code>effectiveSurplus</code> share
                    and credited to dependent cohorts. The actual credit also refills the dependent&apos;s grocery
                    buffer. The global invariant is maintained: the sum of all transfer matrix entries is zero (purely
                    redistributive).
                </p>
                <pre className='bg-muted p-4 rounded-md text-sm overflow-x-auto'>
                    {`For each dependent age d (shuffled):
  totalWeight = Σ_s supportWeight(s − d) × remainingSurplus[s]

  For each supplier age s:
    share  = (weight[s] / totalWeight) × dependentNeed_scaled[d]
    actual = min(share, remainingSurplus[s])
    debit  supplier cells proportionally → update transferMatrix[s] (negative)
    credit dependent cells proportionally → update transferMatrix[d] (positive)

Zero-sum validation:  Σ transferMatrix ≈ 0`}
                </pre>
            </section>
        </>
    );
}
