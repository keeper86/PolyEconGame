import fs from 'node:fs';
import { TICKS_PER_MONTH } from '../../src/simulation/constants';
import type { GameState, Planet } from '../../src/simulation/planet/planet';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';

const arm = process.argv[2];
if (arm === undefined) {
    throw new Error('usage: workforceProbe.ts <arm> [agentIdSubstring]');
}
const filter = process.argv[3];
const state: GameState = deserializeSnapshot(fs.readFileSync(`tools/longrun/results/${arm}/checkpoint.bin`));
const planet = state.planets.values().next().value as Planet;
const tiers = ['none', 'primary', 'secondary', 'tertiary'] as const;
type Tier = (typeof tiers)[number];
const ex = (v: number, digits = 3): string =>
    !Number.isFinite(v) ? 'n/a' : Math.abs(v) >= 1e4 ? v.toExponential(digits) : v.toFixed(digits);
const zero = (): Record<Tier, number> => ({ none: 0, primary: 0, secondary: 0, tertiary: 0 });

type AgentWork = {
    id: string;
    active: Record<Tier, number>;
    onboarding: Record<Tier, number>;
    fired: Record<Tier, number>;
    target: Record<Tier, number>;
    slotCapacity: Record<Tier, number>;
    demand: Record<Tier, number>;
    allocated: number;
    used: number;
    overqualified: Map<string, number>;
    monthAcc: Record<string, number>;
    loanCount: number;
    loanPrincipal: number;
};

const collect = (): AgentWork[] => {
    const out: AgentWork[] = [];
    for (const agent of state.agents.values()) {
        const assets = agent.assets[planet.id];
        if (assets === undefined || assets === null || agent.agentRole !== undefined) {
            continue;
        }
        if (agent.id === planet.governmentId || agent.id === planet.recycler.id) {
            continue;
        }
        const demog = assets.workforceDemography;
        if (demog === undefined) {
            continue;
        }
        const active = zero();
        const onboarding = zero();
        const fired = zero();
        for (const cohort of demog) {
            for (const tier of tiers) {
                const cat = cohort[tier];
                active[tier] += cat.active;
                onboarding[tier] += cat.onboarding.reduce((s, v) => s + v, 0);
                fired[tier] += cat.departingFired.reduce((s, v) => s + v, 0);
            }
        }
        const target = zero();
        const slotCapacity = zero();
        for (const tier of tiers) {
            target[tier] = assets.allocatedWorkers[tier] ?? 0;
            slotCapacity[tier] = assets.totalSlotCapacity?.[tier] ?? 0;
        }
        const demand = zero();
        let carried = 0;
        for (const tier of tiers) {
            demand[tier] = (assets.allocatedWorkers[tier] ?? 0) + carried;
            carried = Math.max(0, demand[tier] - (active[tier] + onboarding[tier]));
        }
        const overqualified = new Map<string, number>();
        for (const fac of assets.productionFacilities) {
            const oq = fac.lastTickResults?.overqualifiedWorkers ?? {};
            for (const [job, byWorker] of Object.entries(oq)) {
                for (const [worker, count] of Object.entries(byWorker ?? {})) {
                    const key = `${job}<-${worker}`;
                    overqualified.set(key, (overqualified.get(key) ?? 0) + count);
                }
            }
        }
        const monthAcc: Record<string, number> = {};
        for (const [key, value] of Object.entries(assets.monthAcc)) {
            if (typeof value === 'number') {
                monthAcc[key] = value;
            }
        }
        out.push({
            id: agent.id,
            active,
            onboarding,
            fired,
            target,
            slotCapacity,
            demand,
            allocated: tiers.reduce((s, t) => s + (assets.allocatedWorkers[t] ?? 0), 0),
            used: assets.usedWorkers,
            overqualified,
            monthAcc,
            loanCount: assets.activeLoans.length,
            loanPrincipal: assets.activeLoans.reduce((s, l) => s + l.remainingPrincipal, 0),
        });
    }
    return out;
};


const sum = (rec: Record<Tier, number>): number => tiers.reduce((s, t) => s + rec[t], 0);
const works = collect();

if (filter === undefined) {
    console.log(`${arm}: ${works.length} companies  (y${(state.tick / 360).toFixed(0)})`);
    console.log(
        'company                     active   onboard    fired     demand      target   allocated    used  active/used  active/demand',
    );
    const sorted = works.sort(
        (a, b) => sum(b.active) / Math.max(1, sum(b.demand)) - sum(a.active) / Math.max(1, sum(a.demand)),
    );
    for (const w of sorted) {
        const a = sum(w.active);
        const d = sum(w.demand);
        console.log(
            `${w.id.slice(0, 24).padEnd(25)}${ex(a).padStart(9)}${ex(sum(w.onboarding)).padStart(10)}${ex(sum(w.fired)).padStart(9)}` +
                `${ex(d).padStart(11)}${ex(sum(w.target)).padStart(12)}${ex(w.allocated).padStart(12)}${ex(w.used).padStart(9)}` +
                `${(a / Math.max(1, w.used)).toFixed(2).padStart(11)}${(a / Math.max(1, d)).toFixed(2).padStart(14)}`,
        );
    }
    const totalActive = works.reduce((s, w) => s + sum(w.active), 0);
    const totalDemand = works.reduce((s, w) => s + sum(w.demand), 0);
    const totalUsed = works.reduce((s, w) => s + w.used, 0);
    console.log(
        `\nΣ active=${ex(totalActive)}  Σ demand=${ex(totalDemand)}  Σ used=${ex(totalUsed)}  ` +
            `active/used=${(totalActive / Math.max(1, totalUsed)).toFixed(2)}  active/demand=${(totalActive / Math.max(1, totalDemand)).toFixed(2)}`,
    );
} else {
    for (const w of works.filter((x) => x.id.includes(filter))) {
        console.log(`### ${w.id}`);
        console.log('tier       active   onboard     fired     demand     target      slotCap  decision');
        for (const t of tiers) {
            const head = w.active[t] + w.onboarding[t];
            const decision = w.demand[t] > head ? 'HIRE' : head > w.demand[t] * 1.05 ? 'FIRE' : 'idle';
            console.log(
                `${t.padEnd(10)}${ex(w.active[t]).padStart(9)}${ex(w.onboarding[t]).padStart(10)}${ex(w.fired[t]).padStart(10)}` +
                    `${ex(w.demand[t]).padStart(11)}${ex(w.target[t]).padStart(11)}${ex(w.slotCapacity[t]).padStart(12)}  ${decision}`,
            );
        }
        console.log(
            'cross-tier fills (job<-worker): ' +
                ([...w.overqualified.entries()].map(([k, v]) => `${k}=${ex(v)}`).join('  ') || 'none'),
        );
        const m = w.monthAcc;
        console.log(
            `monthAcc /tick: wages=${ex((m.wages ?? 0) / TICKS_PER_MONTH)} revenue=${ex((m.revenue ?? 0) / TICKS_PER_MONTH)} ` +
                `purchases=${ex((m.purchases ?? 0) / TICKS_PER_MONTH)} claims=${ex((m.claimPayments ?? 0) / TICKS_PER_MONTH)} ` +
                `interest=${ex((m.interestPaid ?? 0) / TICKS_PER_MONTH)}`,
        );
        console.log(
            `workers charged /tick=${ex((m.totalWorkersTicks ?? 0) / TICKS_PER_MONTH)}  usedWorkers=${ex(w.used)}  ` +
                `loans=${w.loanCount} principal=${ex(w.loanPrincipal)}`,
        );
    }
}
