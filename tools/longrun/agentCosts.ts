import fs from 'node:fs';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { computeCompanyNetWorth } from '../../src/simulation/agents/governmentAgent';
import { TICKS_PER_MONTH } from '../../src/simulation/constants';
import type { Planet, GameState } from '../../src/simulation/planet/planet';

const arm = process.argv[2];
if (!arm) {
    throw new Error('usage: agentCosts.ts <arm>');
}
const state: GameState = deserializeSnapshot(fs.readFileSync(`tools/longrun/results/${arm}/checkpoint.bin`));
const planet = state.planets.values().next().value as Planet;

type Row = {
    name: string;
    netWorth: number;
    output: number;
    cost: number;
    revenue: number;
    costPerUnit: number;
    price: number;
    realizedPerUnit: number;
    outputResource: string;
};

const rows: Row[] = [];
for (const agent of state.agents.values()) {
    const assets = agent.assets[planet.id];
    if (!assets) {
        continue;
    }
    if (agent.id === planet.governmentId || agent.id === planet.recycler.id || agent.agentRole !== undefined) {
        continue;
    }
    let output = 0;
    let outputResource = '';
    let biggest = 0;
    for (const facility of assets.productionFacilities) {
        const tick = facility.lastTickResults;
        if (!tick || facility.produces.length === 0) {
            continue;
        }
        const eff = tick.overallEfficiency ?? 0;
        const qty = facility.produces[0].quantity * facility.scale * eff * TICKS_PER_MONTH;
        output += qty;
        if (qty > biggest) {
            biggest = qty;
            outputResource = facility.produces[0].resource.name;
        }
    }
    if (output <= 0) {
        continue;
    }
    const acc = assets.monthAcc;
    const cost = acc.wages + acc.purchases + acc.claimPayments;
    rows.push({
        name: agent.id.slice(0, 20),
        netWorth: computeCompanyNetWorth(agent, planet, state.shipCapitalMarket),
        output,
        cost,
        revenue: acc.revenue,
        costPerUnit: cost / output,
        price: planet.marketPrices[outputResource] ?? Number.NaN,
        realizedPerUnit: acc.revenue / output,
        outputResource,
    });
}

const f = (v: number): string => (!Number.isFinite(v) ? 'n/a' : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v.toFixed(3));
console.log(`${arm}: agent-level cost per unit vs market price (monthly)`);
console.log('company               netWorth  output/mo    price  cost/unit  realized/unit  verdict   resource');
let over = 0;
for (const r of rows.sort((a, b) => a.costPerUnit / a.price - b.costPerUnit / b.price).reverse()) {
    const verdict = r.costPerUnit > r.price ? 'COST>PRICE' : 'ok';
    if (verdict === 'COST>PRICE') {
        over += 1;
    }
    console.log(
        `${r.name.padEnd(21)}${f(r.netWorth).padStart(9)}${f(r.output).padStart(10)}${r.price.toFixed(3).padStart(9)}` +
            `${r.costPerUnit.toFixed(3).padStart(11)}${r.realizedPerUnit.toFixed(3).padStart(15)}  ${verdict.padEnd(11)}${r.outputResource}`,
    );
}
const losers = rows.filter((r) => r.netWorth < 0);
console.log(
    `\n${rows.length} companies: ${over} with cost/unit > price. ` +
        `Of ${losers.length} negative-net-worth firms, ${losers.filter((r) => r.costPerUnit > r.price).length} have cost/unit > price.`,
);
const winners = rows.filter((r) => r.netWorth >= 0);
console.log(
    `Of ${winners.length} positive-net-worth firms, ${winners.filter((r) => r.costPerUnit > r.price).length} have cost/unit > price.`,
);
