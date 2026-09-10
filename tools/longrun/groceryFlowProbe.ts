// Per-tick probe on the food -> grocery service chain. Gated by GROCERY_PROBE=1.
//
// svc09 died by a grocery-service "supply" collapse (3.5e9 -> ~0 within a few ticks)
// in an otherwise healthy world (condition ~0.93, no starvation *before* it). Grocery
// Chain facilities consume real manufactured inputs (Processed Food x30, Beverage x20)
// from agent-level storage every tick (consumeNeeds); their SERVICE output is scaled by
// overallEfficiency (worker x resource x condition) x storageSpaceFactor. This probe
// drips a row EVERY tick capturing, per fleet, on-hand input vs required need, output,
// and the eff/space factors, so the fatal tick's cause is observable as an
// input-reservoir==0, an efficiency==0, a space==0, or a downstream listing effect.
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';

import type { GameState, AgentPlanetAssets } from '../../src/simulation/planet/planet';
import { getAllFacilities } from '../../src/simulation/planet/planet';
import { queryStorageFacility } from '../../src/simulation/planet/facility';
import type { ProductionFacility } from '../../src/simulation/planet/facility';
import { TICKS_PER_YEAR } from '../../src/simulation/constants';

const GROCERY = 'Grocery Chain';
const FOODPROC = 'Food Processor';
const BEVERAGE = 'Beverage Plant';
const FOOD = 'Processed Food';
const BEV = 'Beverage';
const PRODUCE = 'Produce';
const GROCERY_SVC = 'Grocery';

interface FleetAcc {
    count: number;
    scale: number;
    reqFood: number;
    reqBev: number;
    haveFood: number;
    haveBev: number;
    producedFood: number;
    producedBeverage: number;
    producedGrocery: number;
    overallEffSum: number;
    workerEffSum: number;
    inputZero: number;
    effZero: number;
}

function zeroFleet(): FleetAcc {
    return {
        count: 0,
        scale: 0,
        reqFood: 0,
        reqBev: 0,
        haveFood: 0,
        haveBev: 0,
        producedFood: 0,
        producedBeverage: 0,
        producedGrocery: 0,
        overallEffSum: 0,
        workerEffSum: 0,
        inputZero: 0,
        effZero: 0,
    };
}

function needOf(fac: ProductionFacility, name: string): number {
    const n = fac.needs.find((need) => need.resource.name === name);
    return n ? n.quantity : 0;
}

function accumulateByKind(fac: ProductionFacility, assets: AgentPlanetAssets, acc: FleetAcc): void {
    const scale = fac.scale;
    acc.count += 1;
    acc.scale += scale;

    const storage = assets.storage;
    const haveFood = queryStorageFacility(storage, FOOD);
    const haveBev = queryStorageFacility(storage, BEV);
    const reqFood = needOf(fac, FOOD) * scale;
    const reqBev = needOf(fac, BEV) * scale;
    const res = fac.lastTickResults;

    acc.reqFood += reqFood;
    acc.reqBev += reqBev;
    acc.haveFood += haveFood;
    acc.haveBev += haveBev;
    if (haveFood < reqFood || haveBev < reqBev) {
        acc.inputZero += 1;
    }

    if (res) {
        acc.overallEffSum += res.overallEfficiency ?? 0;
        const workers = Object.values(res.workerEfficiency ?? {});
        if (workers.length > 0) {
            acc.workerEffSum += workers.reduce((a, b) => a + b, 0) / workers.length;
        }
        acc.producedFood += res.lastProduced?.[FOOD] ?? 0;
        acc.producedBeverage += res.lastProduced?.[BEV] ?? 0;
        acc.producedGrocery += res.lastProduced?.[GROCERY_SVC] ?? 0;
        if ((res.overallEfficiency ?? 1) <= 0) {
            acc.effZero += 1;
        }
    }
}

function aggregateReservoirs(g: GameState): { pFood: number; bev: number; produce: number } {
    let pFood = 0;
    let bev = 0;
    let produce = 0;
    for (const agent of g.agents.values()) {
        for (const assets of Object.values(agent.assets)) {
            if (!assets || !assets.storage) {
                continue;
            }
            pFood += queryStorageFacility(assets.storage, FOOD);
            bev += queryStorageFacility(assets.storage, BEV);
            produce += queryStorageFacility(assets.storage, PRODUCE);
        }
    }
    return { pFood, bev, produce };
}

interface FleetRefs {
    grocery: FleetAcc;
    foodProc: FleetAcc;
    beverage: FleetAcc;
}

let mixHeaderShown = false;
function appendRefineryMixRow(gameState: GameState, outDir: string): void {
    const file = path.join(outDir, 'refineryMix.csv');
    if (!mixHeaderShown) {
        writeFileSync(file, 'tick|agent|scale|output|free_m|keep_m|deficit|mix\n');
        mixHeaderShown = true;
    }
    for (const agent of gameState.agents.values()) {
        for (const assets of Object.values(agent.assets)) {
            if (!assets) {
                continue;
            }
            for (const fac of getAllFacilities(assets, false)) {
                if (fac.type !== 'production') {
                    continue;
                }
                const p = fac as ProductionFacility;
                if (!p.outputFlexible || !p.productionMix) {
                    continue;
                }
                const keepTicks = p.wasteSurplusTicks ?? 30;
                const mix = p.productionMix;
                for (const o of p.produces) {
                    const q = o.quantity;
                    const free = queryStorageFacility(assets.storage, o.resource.name);
                    const keep = keepTicks * p.maxScale * q;
                    const deficit = keep > 0 ? Math.max(0, Math.min(1, (keep - free) / keep)) : 0;
                    const line = [
                        String(gameState.tick),
                        agent.id,
                        p.scale.toFixed(0),
                        o.resource.name,
                        (free / 1e6).toFixed(1),
                        (keep / 1e6).toFixed(1),
                        deficit.toFixed(3),
                        (mix[o.resource.name] ?? 0).toFixed(4),
                    ].join('|');
                    appendFileSync(file, line + '\n');
                }
            }
        }
    }
}

export function groceryFlowProbe(gameState: GameState, outDir: string): void {
    const refs: FleetRefs = { grocery: zeroFleet(), foodProc: zeroFleet(), beverage: zeroFleet() };

    for (const agent of gameState.agents.values()) {
        for (const assets of Object.values(agent.assets)) {
            if (!assets) {
                continue;
            }
            for (const fac of getAllFacilities(assets, false)) {
                if (fac.type !== 'production') {
                    continue;
                }
                const p = fac as ProductionFacility;
                if (p.name === GROCERY) {
                    accumulateByKind(p, assets, refs.grocery);
                } else if (p.name === FOODPROC) {
                    accumulateByKind(p, assets, refs.foodProc);
                } else if (p.name === BEVERAGE) {
                    accumulateByKind(p, assets, refs.beverage);
                }
            }
        }
    }
    const res = aggregateReservoirs(gameState);
    const file = path.join(outDir, 'groceryFlow.csv');
    const row = [
        String(gameState.tick),
        (gameState.tick / TICKS_PER_YEAR).toFixed(3),
        String(refs.grocery.count),
        refs.grocery.scale.toFixed(0),
        (refs.grocery.haveFood / 1e6).toFixed(3),
        (refs.grocery.reqFood / 1e6).toFixed(3),
        (refs.grocery.haveBev / 1e6).toFixed(3),
        (refs.grocery.reqBev / 1e6).toFixed(3),
        (refs.grocery.producedGrocery / 1e6).toFixed(3),
        (refs.grocery.overallEffSum / Math.max(1, refs.grocery.count)).toFixed(4),
        (refs.grocery.workerEffSum / Math.max(1, refs.grocery.count)).toFixed(4),
        (refs.grocery.inputZero / Math.max(1, refs.grocery.count)).toFixed(3),
        (refs.grocery.effZero / Math.max(1, refs.grocery.count)).toFixed(3),
        refs.foodProc.scale.toFixed(0),
        (refs.foodProc.haveFood / 1e6).toFixed(3),
        (refs.foodProc.reqFood / 1e6).toFixed(3),
        (refs.foodProc.overallEffSum / Math.max(1, refs.foodProc.count)).toFixed(4),
        refs.beverage.scale.toFixed(0),
        (refs.beverage.haveBev / 1e6).toFixed(3),
        (refs.beverage.overallEffSum / Math.max(1, refs.beverage.count)).toFixed(4),
        (res.pFood / 1e6).toFixed(3),
        (res.bev / 1e6).toFixed(3),
        (res.produce / 1e6).toFixed(3),
    ];
    appendFileSync(file, row.join(',') + '\n');
    appendRefineryMixRow(gameState, outDir);
}

export function startGroceryProbe(outDir: string): void {
    mixHeaderShown = false;
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
        path.join(outDir, 'groceryFlow.csv'),
        'tick,year,grocCount,grocScale,gHaveFoodM,gReqFoodM,gHaveBevM,gReqBevM,gProducedSvcM,' +
            'grocEff,grocWkEff,grocInput0frac,grocEff0frac,fpScale,fpHaveFoodM,fpReqFoodM,fpEff,' +
            'bvScale,bvHaveBevM,bvEff,procFoodResM,beverageResM,produceResM\n',
    );
}

