import fs from 'node:fs';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { computeCompanyNetWorth } from '../../src/simulation/agents/governmentAgent';
import { computeLoanConditions } from '../../src/simulation/financial/loanConditions';
import type { GameState, Planet } from '../../src/simulation/planet/planet';

const arm = process.argv[2];
if (!arm) {
    throw new Error('usage: companyDump.ts <arm-name> [topN]');
}
const topN = Number(process.argv[3] ?? 12);

const dir = `tools/longrun/results/${arm}`;
const state: GameState = deserializeSnapshot(fs.readFileSync(`${dir}/checkpoint.bin`));
const planet = state.planets.values().next().value as Planet;
console.log(
    `${arm}: tick ${state.tick} (y${(state.tick / 360).toFixed(0)}), planets ${state.planets.size}, agents ${state.agents.size}`,
);

type Row = {
    name: string;
    netWorth: number;
    profit: number;
    wages: number;
    deposits: number;
    runway: number;
    loans: number;
    collateral: number;
    maxLoan: number;
    rollover: number;
    facilities: string;
    signals: string;
};

const rows: Row[] = [];
let companies = 0;
for (const agent of state.agents.values()) {
    const assets = agent.assets[planet.id];
    if (!assets) {
        continue;
    }
    if (agent.id === planet.governmentId || agent.id === planet.recycler.id || agent.agentRole !== undefined) {
        continue;
    }
    companies += 1;
    const netWorth = computeCompanyNetWorth(agent, planet, state.shipCapitalMarket);
    const acc = assets.monthAcc;
    const profit = acc.revenue - acc.wages - acc.purchases - acc.claimPayments;
    const conditions = computeLoanConditions(agent, planet, state.shipCapitalMarket);
    const rollover = assets.activeLoans
        .filter((loan) => loan.type === 'rollover')
        .reduce((sum, loan) => sum + loan.remainingPrincipal, 0);
    const facilityScale = new Map<string, number>();
    const facilitySignal = new Map<string, number>();
    for (const facility of assets.productionFacilities) {
        facilityScale.set(facility.name, (facilityScale.get(facility.name) ?? 0) + facility.scale);
        const signal = facility.pidState?.smoothedSignal;
        if (signal !== undefined) {
            facilitySignal.set(facility.name, signal);
        }
    }
    rows.push({
        name: agent.id.slice(0, 22),
        netWorth,
        profit,
        wages: acc.wages,
        deposits: assets.deposits,
        runway: profit < 0 ? assets.deposits / -profit : Number.POSITIVE_INFINITY,
        loans: conditions.existingLoans,
        collateral: conditions.facilitiesCollateral + conditions.shipsCollateral,
        maxLoan: conditions.maxLoanAmount,
        rollover,
        facilities: [...facilityScale.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([n, s]) => `${n.replace(/Facility$|Factory$|Plant$|Chain$|Hub$|Center$/, '')}:${s.toFixed(0)}`)
            .join(' '),
        signals: [...facilitySignal.entries()]
            .sort((a, b) => a[1] - b[1])
            .slice(0, 3)
            .map(([n, s]) => `${n.replace(/Facility$|Factory$|Plant$|Chain$|Hub$|Center$/, '')}:${s.toFixed(2)}`)
            .join(' '),
    });
}

const f = (v: number): string =>
    !Number.isFinite(v) ? 'inf' : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v.toFixed(1);

console.log(`\n${companies} companies — sorted by net worth (worst first)`);
console.log('company                netWorth    profit  deposits  runway     loans  collat  rollover  flags  top facilities / worst signals');
for (const r of [...rows].sort((a, b) => a.netWorth - b.netWorth).slice(0, topN)) {
    const flags = [
        r.netWorth < 0 ? 'negNW' : '',
        r.profit < 0 ? 'loss' : '',
        r.loans > r.collateral ? 'UNDERWATER' : '',
        r.loans > r.maxLoan ? 'overLimit' : '',
        r.rollover > 0 ? 'rollover' : '',
    ]
        .filter(Boolean)
        .join(',');
    console.log(
        `${r.name.padEnd(22)}${f(r.netWorth).padStart(9)}${f(r.profit).padStart(10)}${f(r.deposits).padStart(10)}` +
            `${f(r.runway).padStart(8)}${f(r.loans).padStart(10)}${f(r.collateral).padStart(8)}${f(r.rollover).padStart(10)}` +
            `  ${flags.padEnd(26)}${r.facilities} | ${r.signals}`,
    );
}

const counts = {
    negNW: rows.filter((r) => r.netWorth < 0).length,
    loss: rows.filter((r) => r.profit < 0).length,
    underwater: rows.filter((r) => r.loans > r.collateral).length,
    overLimit: rows.filter((r) => r.loans > r.maxLoan).length,
    rollover: rows.filter((r) => r.rollover > 0).length,
    nearInsolvent: rows.filter((r) => r.deposits < r.wages).length,
};
console.log(
    `\ntotals: ${JSON.stringify(counts)}   peak deposit burn among losers: ` +
        `${f(Math.max(...rows.filter((r) => r.profit < 0).map((r) => r.deposits), 0))}`,
);
