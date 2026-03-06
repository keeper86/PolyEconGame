/**
 * Trace the exact money flow through one full tick cycle.
 *
 * Hypothesis: With C_INC=1 and C_WEALTH=0, money flows in a perfect circle:
 *   1. Bank creates loan → firm deposits increase (money creation)
 *   2. Firm pays wages → firm deposits decrease, household deposits increase
 *   3. Households consume everything → household deposits decrease, firm deposits increase (revenue)
 *   4. Firm repays loan → firm deposits decrease, bank loans decrease (money destruction)
 *   Result: net change ≈ 0 each tick.
 *
 * Usage:  npx tsx tools/trace-money-flow.ts
 */

import { seedRng, advanceTick } from '../src/simulation/engine';
import { earth, earthGovernment, testCompany } from '../src/simulation/entities';
import {
    agriculturalProductResourceType,
    putIntoStorageFacility,
    waterResourceType,
} from '../src/simulation/facilities';
import type { GameState } from '../src/simulation/planet';
import {
    preProductionFinancialTick,
    postProductionFinancialTick,
    C_INC,
    C_WEALTH,
} from '../src/simulation/financial/financialTick';

// --- bootstrap ---
seedRng(42);
const earthGovStorage = earthGovernment.assets[earth.id]?.storageFacility;
if (!earthGovStorage) throw new Error('No storage');
putIntoStorageFacility(earthGovStorage, agriculturalProductResourceType, 10_000_000_000);
putIntoStorageFacility(earthGovStorage, waterResourceType, 100_000);

const state: GameState = {
    tick: 0,
    planets: new Map([[earth.id, earth]]),
    agents: new Map([
        [earthGovernment.id, earthGovernment],
        [testCompany.id, testCompany],
    ]),
};

// Run a few ticks to get workers hired
for (let i = 1; i <= 5; i++) {
    state.tick = i;
    advanceTick(state);
}

console.log('=== Financial system parameters ===');
console.log(`C_INC   = ${C_INC}   (marginal propensity to consume from income)`);
console.log(`C_WEALTH = ${C_WEALTH} (marginal propensity to consume from wealth)`);
console.log();

// Now trace tick 6 step by step
state.tick = 6;

// We can't easily split the engine steps, so let's just instrument the bank
// at key moments by running a full tick and checking before/after values.

function snap() {
    const b = earth.bank;
    const govDep = earthGovernment.deposits;
    const coDep = testCompany.deposits;
    return {
        loans: b.loans,
        deposits: b.deposits,
        householdDep: b.householdDeposits,
        equity: b.equity,
        govDeposits: govDep,
        coDeposits: coDep,
        firmTotal: govDep + coDep,
    };
}

// Check state just before tick 6
const before = snap();
console.log('=== Before tick 6 ===');
console.log(`  bank.loans            = ${before.loans}`);
console.log(`  bank.deposits         = ${before.deposits}`);
console.log(`  bank.householdDeposits= ${before.householdDep}`);
console.log(`  firmDeposits (gov+co) = ${before.firmTotal}`);
console.log(`  bank.equity           = ${before.equity}`);
console.log();

// Run the full tick
advanceTick(state);

const after = snap();
console.log('=== After tick 6 ===');
console.log(`  bank.loans            = ${after.loans}`);
console.log(`  bank.deposits         = ${after.deposits}`);
console.log(`  bank.householdDeposits= ${after.householdDep}`);
console.log(`  firmDeposits (gov+co) = ${after.firmTotal}`);
console.log(`  bank.equity           = ${after.equity}`);
console.log();

console.log('=== Net changes ===');
console.log(`  Δ loans             = ${after.loans - before.loans}`);
console.log(`  Δ deposits          = ${after.deposits - before.deposits}`);
console.log(`  Δ householdDeposits = ${after.householdDep - before.householdDep}`);
console.log(`  Δ firmDeposits      = ${after.firmTotal - before.firmTotal}`);
console.log();

// Now run 100 more ticks and track the peak intra-tick bank.loans
console.log('=== Tracking peak bank.loans over 100 ticks ===');
let maxLoans = 0;
let maxLoansTick = 0;
let zeroCount = 0;
let nearZeroCount = 0;

for (let i = 7; i <= 106; i++) {
    state.tick = i;

    // Snapshot before financial tick (after labor market, which runs inside advanceTick)
    // We can't split easily, but we can observe the final state
    advanceTick(state);

    const b = earth.bank;
    if (b.loans > maxLoans) {
        maxLoans = b.loans;
        maxLoansTick = i;
    }
    if (b.loans === 0) zeroCount++;
    if (b.loans < 0.01) nearZeroCount++;
}

console.log(`  Max loans seen: ${maxLoans} at tick ${maxLoansTick}`);
console.log(`  Ticks with loans === 0: ${zeroCount}/100`);
console.log(`  Ticks with loans < 0.01: ${nearZeroCount}/100`);
console.log();

// To truly see the intra-tick peak, we need to instrument the financial tick directly.
// Let's build a minimal test with a known workforce and trace each sub-step.
// We use the real earth entities so we don't need vitest-dependent testHelpers.
console.log('=== Detailed trace: isolated financial cycle with known workforce ===');

import { totalActiveForEdu } from '../src/simulation/workforce/workforceHelpers';

// Use the real earth setup — workers were already hired by the ticks above.
// Count the active workers for the government agent.
const govWorkforce = earthGovernment.assets[earth.id]?.workforceDemography;
const activeWorkers = govWorkforce ? totalActiveForEdu(govWorkforce, 'none') + totalActiveForEdu(govWorkforce, 'primary') + totalActiveForEdu(govWorkforce, 'secondary') : 0;

// Reset bank to zero to get a clean trace
const planet = earth;
const agent = earthGovernment;
planet.bank = { loans: 0, deposits: 0, householdDeposits: 0, equity: 0, loanRate: 0, depositRate: 0 };
agent.deposits = 0;
testCompany.deposits = 0;
// Also reset per-planet deposits
if (agent.assets[planet.id]) (agent.assets[planet.id] as Record<string, unknown>).deposits = 0;
if (testCompany.assets[planet.id]) (testCompany.assets[planet.id] as Record<string, unknown>).deposits = 0;

const gs: GameState = {
    tick: 200,
    planets: new Map([[planet.id, planet]]),
    agents: new Map([[earthGovernment.id, earthGovernment], [testCompany.id, testCompany]]),
};

console.log(`  Workers active (gov, none+primary+secondary): ${activeWorkers}`);
console.log(`  Wage per worker (none): ${planet.wagePerEdu?.none ?? 1}`);
console.log();

console.log('--- Step A: preProductionFinancialTick ---');
const a0 = { loans: planet.bank.loans, dep: planet.bank.deposits, hhDep: planet.bank.householdDeposits, agentDep: agent.deposits };
console.log(`  BEFORE: loans=${a0.loans}, deposits=${a0.dep}, hhDep=${a0.hhDep}, agentDep=${a0.agentDep}`);

preProductionFinancialTick(gs);

const a1 = { loans: planet.bank.loans, dep: planet.bank.deposits, hhDep: planet.bank.householdDeposits, agentDep: agent.deposits };
console.log(`  AFTER:  loans=${a1.loans}, deposits=${a1.dep}, hhDep=${a1.hhDep}, agentDep=${a1.agentDep}`);
console.log(`  → Loan created: ${a1.loans - a0.loans}`);
console.log(`  → Money supply increased: ${a1.dep - a0.dep}`);
console.log(`  → Household deposits increased: ${a1.hhDep - a0.hhDep} (wages received)`);
console.log(`  → Firm deposits net change: ${a1.agentDep - a0.agentDep} (loan + wages paid = net 0)`);
console.log();

console.log('--- Step B: postProductionFinancialTick ---');
const b0 = { loans: planet.bank.loans, dep: planet.bank.deposits, hhDep: planet.bank.householdDeposits, agentDep: agent.deposits };
console.log(`  BEFORE: loans=${b0.loans}, deposits=${b0.dep}, hhDep=${b0.hhDep}, agentDep=${b0.agentDep}`);

postProductionFinancialTick(gs);

const b1 = { loans: planet.bank.loans, dep: planet.bank.deposits, hhDep: planet.bank.householdDeposits, agentDep: agent.deposits };
console.log(`  AFTER:  loans=${b1.loans}, deposits=${b1.dep}, hhDep=${b1.hhDep}, agentDep=${b1.agentDep}`);
console.log(`  → Loan repaid: ${b0.loans - b1.loans}`);
console.log(`  → Money supply decreased: ${b0.dep - b1.dep} (money destruction)`);
console.log(`  → Household deposits decreased: ${b0.hhDep - b1.hhDep} (consumption)`);
console.log(`  → Firm deposits net change: ${b1.agentDep - b0.agentDep} (revenue − repayment)`);
console.log();

console.log('--- Final state ---');
console.log(`  bank.loans            = ${planet.bank.loans}`);
console.log(`  bank.deposits         = ${planet.bank.deposits}`);
console.log(`  bank.householdDeposits= ${planet.bank.householdDeposits}`);
console.log(`  agent.deposits        = ${agent.deposits}`);
console.log(`  bank.equity           = ${planet.bank.equity}`);
console.log();
console.log(`  Perfect circle? loans=${planet.bank.loans === 0}, deposits=${planet.bank.deposits === 0}, hhDep=${planet.bank.householdDeposits === 0}`);
