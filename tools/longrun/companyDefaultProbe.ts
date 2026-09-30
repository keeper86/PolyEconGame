import fs from 'node:fs';
import path from 'node:path';
import { computeCompanyNetWorth } from '../../src/simulation/agents/governmentAgent';
import { parseRefoundName } from '../../src/simulation/financial/refound';
import { totalOutstandingLoans } from '../../src/simulation/financial/loanTypes';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { getAllFacilities, type Agent, type GameState, type Planet } from '../../src/simulation/planet/planet';
import { educationLevelKeys } from '../../src/simulation/population/education';

const outDir = process.argv[2];
if (!outDir) {
    throw new Error('usage: companyDefaultProbe.ts <results-dir>');
}

const meta = JSON.parse(fs.readFileSync(path.join(outDir, 'checkpoint.json'), 'utf8'));
const state = deserializeSnapshot(fs.readFileSync(path.join(outDir, 'checkpoint.bin'))) as GameState;
const planet: Planet = state.planets.values().next().value as Planet;

console.log(`tick=${state.tick} (y=${(state.tick / 360).toFixed(1)}) agents=${state.agents.size}`);
console.log(
    'name'.padEnd(30) +
        'refnd'.padStart(5) +
        'debt'.padStart(11) +
        'prodValue'.padStart(11) +
        'wages'.padStart(11) +
        'workers'.padStart(9) +
        'needed'.padStart(9) +
        'maxScale'.padStart(9) +
        'maint'.padStart(8) +
        'topProduct'.padStart(18) +
        'price'.padStart(8),
);

const rows: Array<{
    name: string;
    refound: number;
    deposits: number;
    debt: number;
    revenue: number;
    wages: number;
    purchases: number;
    claims: number;
    netCashFlow: number;
    netWorth: number;
    workers: number;
    productionValue: number;
    workersNeeded: number;
    maxScale: number;
    maintenance: number;
    topProduct: string;
    topQuantity: number;
    topValue: number;
}> = [];

state.agents.forEach((agent: Agent) => {
    if (agent.id === planet.governmentId || agent.id === planet.recycler.id) {
        return;
    }
    const assets = agent.assets[planet.id];
    if (!assets) {
        return;
    }
    const acc = assets.lastMonthAcc;
    const { refoundNumber } = parseRefoundName(agent.name);
    const workers = assets.workforceDemography.reduce(
        (sum, cohort) => sum + educationLevelKeys.reduce((eduSum, edu) => eduSum + cohort[edu].active, 0),
        0,
    );
    const facilities = assets.productionFacilities;
    const workersNeeded = facilities.reduce(
        (sum, facility) =>
            sum + Object.values(facility.workerRequirement).reduce((reqSum, req) => reqSum + (req ?? 0), 0),
        0,
    );
    const maxScale = facilities.reduce((sum, facility) => sum + facility.maxScale, 0);
    const maintenance =
        facilities.length > 0
            ? facilities.reduce((sum, facility) => sum + facility.maintenanceStatus, 0) / facilities.length
            : 0;
    const topProduced = Object.entries(acc.producedResources).sort((a, b) => b[1].value - a[1].value)[0];
    rows.push({
        name: agent.name,
        refound: refoundNumber,
        deposits: assets.deposits,
        debt: totalOutstandingLoans(assets.activeLoans),
        revenue: acc.revenue,
        wages: acc.wages,
        purchases: acc.purchases,
        claims: acc.claimPayments,
        netCashFlow: acc.revenue - acc.wages - acc.purchases - acc.claimPayments,
        netWorth: computeCompanyNetWorth(agent, planet, state.shipCapitalMarket),
        workers,
        productionValue: acc.productionValue,
        workersNeeded,
        maxScale,
        maintenance,
        topProduct: topProduced ? topProduced[0] : '-',
        topQuantity: topProduced ? topProduced[1].quantity : 0,
        topValue: topProduced ? topProduced[1].value : 0,
    });
});

rows.sort((a, b) => b.refound - a.refound || a.netCashFlow - b.netCashFlow);

const exp = (value: number): string => value.toExponential(2);
for (const r of rows) {
    const price = r.topQuantity > 0 ? r.topValue / r.topQuantity : 0;
    console.log(
        r.name.padEnd(30) +
            String(r.refound).padStart(5) +
            exp(r.debt).padStart(11) +
            exp(r.productionValue).padStart(11) +
            exp(r.wages).padStart(11) +
            String(r.workers).padStart(9) +
            String(r.workersNeeded).padStart(9) +
            (r.maxScale > 0 ? r.maxScale.toFixed(1) : '-').padStart(9) +
            (r.maintenance > 0 ? r.maintenance.toFixed(3) : '-').padStart(8) +
            (' ' + r.topProduct).padEnd(18) +
            price.toFixed(3).padStart(8),
    );
}

const selected = [...rows.slice(0, 8), ...rows.slice(-3)];
console.log('\n=== per-facility production diagnostics ===');
for (const r of selected) {
    const agentName = r.name;
    let agent: Agent | undefined;
    state.agents.forEach((candidate) => {
        if (candidate.name === agentName) {
            agent = candidate;
        }
    });
    if (!agent) {
        continue;
    }
    const assets = agent.assets[planet.id];
    if (!assets) {
        continue;
    }
    console.log(`\n${agentName} (refounds=${r.refound})`);
    const hr = assets.humanResourcesDepartment;
    console.log(
        `  workforce: active=${r.workers} used=${assets.usedWorkers} unused=` +
            `${Object.entries(assets.unusedWorkers)
                .filter(([, count]) => count > 0)
                .map(([edu, count]) => `${edu}:${count}`)
                .join(',') || 'none'} ` +
            `allocated=${Object.entries(assets.allocatedWorkers)
                .filter(([, count]) => count > 0)
                .map(([edu, count]) => `${edu}:${count}`)
                .join(',') || 'none'}`,
    );
    console.log(
        `  slots: total=${JSON.stringify(assets.totalSlotCapacity)} used=${assets.usedWorkers}`,
    );
    console.log(
        `  HR multiplier=${assets.hrProductivityMultiplier?.toFixed(3)} ` +
            `hrStarvation=${(hr?.hrStarvation ?? 0).toFixed(3)} hrBuffer=${(hr?.hrBuffer ?? 0).toFixed(1)}`,
    );
    for (const facility of getAllFacilities(assets, true)) {
        const req = Object.entries(facility.workerRequirement ?? {})
            .map(([edu, count]) => `${edu}:${count}`)
            .join(',');
        const reqTotal = Object.values(facility.workerRequirement ?? {}).reduce(
            (sum, count) => sum + (count ?? 0),
            0,
        );
        console.log(
            `  facility ${facility.type.padEnd(11)} ${facility.name.padEnd(26)} ` +
                `scale=${facility.scale.toFixed(1)}/${facility.maxScale.toFixed(1)} ` +
                `req/scale={${req}} => nominal=${(reqTotal * facility.scale).toFixed(0)}`,
        );
    }
    if (hr) {
        console.log(
            `  HR dept: scale=${hr.scale.toFixed(1)}/${hr.maxScale.toFixed(1)} maint=${hr.maintenanceStatus.toFixed(3)} ` +
                `req=${JSON.stringify(hr.workerRequirement)}`,
        );
    }
    for (const [shell, facility] of Object.entries(assets.storage.shells)) {
        console.log(`  storage(${shell}): ${JSON.stringify(facility.currentInStorage).slice(0, 220)}`);
    }
    for (const facility of assets.productionFacilities) {
        const res = facility.lastTickResults;
        const resEff = Object.entries(res.resourceEfficiency)
            .map(([name, value]) => `${name}=${value.toFixed(2)}`)
            .join(' ');
        const produced = Object.entries(res.lastProduced)
            .map(([name, qty]) => `${name}:${qty.toFixed(1)}@${(planet.marketPrices[name] ?? 0).toFixed(3)}`)
            .join(' ');
        const consumed = Object.entries(res.lastConsumed)
            .map(([name, qty]) => `${name}:${qty.toFixed(1)}`)
            .join(' ');
        console.log(
            `  ${facility.name} scale=${facility.scale.toFixed(1)}/${facility.maxScale.toFixed(1)} ` +
                `maint=${facility.maintenanceStatus.toFixed(3)} overall=${res.overallEfficiency.toFixed(3)} ` +
                `workerEff=${res.workerEfficiencyOverall.toFixed(3)} costBalance=${res.costBalance.toExponential(2)} ` +
                `wage=${res.wageCosts.toExponential(2)} revenue=${res.revenue.toExponential(2)}`,
        );
        console.log(`      resEff: ${resEff || '-'}`);
        console.log(`      produced: ${produced || '-'}`);
        console.log(`      consumed: ${consumed || '-'}`);
    }
}
const refounded = rows.filter((r) => r.refound > 0);
console.log(
    `\ncompanies=${rows.length} refounded=${refounded.length} maxRefound=${rows[0]?.refound ?? 0} ` +
        `totalDebt=${exp(rows.reduce((s, r) => s + r.debt, 0))} ` +
        `negativeNetWorth=${rows.filter((r) => r.netWorth < 0).length} ` +
        `negativeCashFlow=${rows.filter((r) => r.netCashFlow < 0).length}`,
);
