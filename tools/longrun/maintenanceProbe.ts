import fs from 'node:fs';
import path from 'node:path';

import { FACILITY_MAINTENANCE_DECREASE_PER_YEAR, TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick } from '../../src/simulation/engine';
import { getAvailableStorageCapacity, isFacilityOperating, queryStorageFacility } from '../../src/simulation/planet/facility';
import { facilityMaintenanceRepairDeficit, facilityUsageFactor } from '../../src/simulation/planet/facilityMaintenance';
import type { GameState } from '../../src/simulation/planet/planet';
import { getAllFacilities } from '../../src/simulation/planet/planet';
import {
    setStorageCapacityMonths,
    setStorageErrorZoomMonths,
    setStorageTargetMonths,
} from '../../src/simulation/planet/automaticProductionScale/runtimeConfig';
import { maintenanceServiceResourceType } from '../../src/simulation/planet/services';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { setRngState } from '../../src/simulation/utils/stochasticRound';

const COLUMNS = [
    'tick',
    'year',
    'agentId',
    'facility',
    'facilityType',
    'scale',
    'scaleFrac',
    'status',
    'ceiling',
    'gap',
    'wearPerTick',
    'desired',
    'consumed',
    'restored',
    'impliedRation',
    'agentRation',
    'svcInv',
    'svcFreeCap',
    'svcBidTarget',
    'svcBidPlaced',
    'svcBidBought',
    'svcBidFill',
    'svcBidPrice',
    'marketSupply',
    'marketDemand',
    'marketVolume',
    'agentTotalDesired',
    'agentBidBasisTimes3',
    'agentConsumed',
    'agentSvcInvEnd',
    'agentFacilityCount',
] as const;

const arg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const hit = process.argv.find((a) => a.startsWith(prefix));
    return hit?.slice(prefix.length);
};

const srcDir = arg('src');
const years = Number(arg('years') ?? '10');
const outName = arg('out') ?? `maintenanceProbe-${path.basename(srcDir ?? 'none')}`;

if (!srcDir || !Number.isFinite(years) || years <= 0) {
    console.error('usage: tsx maintenanceProbe.ts --src=<checkpointDir> [--years=10] [--out=<name>]');
    process.exit(1);
}

const outDir = path.join(__dirname, 'results', outName);
fs.mkdirSync(outDir, { recursive: true });

const meta = JSON.parse(fs.readFileSync(path.join(srcDir, 'checkpoint.json'), 'utf8')) as {
    tick: number;
    rng: [number, number];
};
const gameState: GameState = deserializeSnapshot(fs.readFileSync(path.join(srcDir, 'checkpoint.bin')));
setRngState(meta.rng);

setStorageTargetMonths(6);
setStorageCapacityMonths(7);
setStorageErrorZoomMonths(1);

const probePath = path.join(outDir, 'maintenanceProbe.csv');
fs.writeFileSync(probePath, COLUMNS.join(',') + '\n');

const fixed = (v: number, digits = 6): string => (Number.isFinite(v) ? v.toFixed(digits) : '0');

function captureTick(): string[] {
    const lines: string[] = [];
    const tick = gameState.tick;
    const year = tick / TICKS_PER_YEAR;

    for (const planet of gameState.planets.values()) {
        const market = planet.lastMarketResult[maintenanceServiceResourceType.name];
        for (const agent of gameState.agents.values()) {
            const assets = agent.assets[planet.id];
            if (!assets) {
                continue;
            }
            const svcInv = queryStorageFacility(assets.storage, maintenanceServiceResourceType.name);
            const svcFreeCap = getAvailableStorageCapacity(assets.storage, maintenanceServiceResourceType);
            let totalDesired = 0;
            let consumedSum = 0;
            let facilityCount = 0;
            for (const facility of getAllFacilities(assets, false)) {
                if (!isFacilityOperating(facility)) {
                    continue;
                }
                totalDesired += facilityMaintenanceRepairDeficit(facility);
                consumedSum += facility.lastTickMaintenanceConsumption ?? 0;
                facilityCount += 1;
            }
            const availableAtRepair = svcInv + consumedSum;
            const agentRation = totalDesired > 0 ? Math.min(1, availableAtRepair / totalDesired) : 0;
            const bid = assets.market?.buy?.[maintenanceServiceResourceType.name];

            for (const facility of getAllFacilities(assets, false)) {
                if (!isFacilityOperating(facility)) {
                    continue;
                }
                const wearPerTick =
                    (facilityUsageFactor(facility) * FACILITY_MAINTENANCE_DECREASE_PER_YEAR) / TICKS_PER_YEAR;
                const desired = facilityMaintenanceRepairDeficit(facility);
                const consumed = facility.lastTickMaintenanceConsumption ?? 0;
                const restored = facility.lastTickRestorationConsumption ?? 0;
                const status = facility.maintenanceStatus ?? 1;
                const ceiling = facility.maxMaintenance ?? 1;
                lines.push(
                    [
                        tick,
                        year.toFixed(4),
                        agent.id,
                        facility.name.replace(/ /g, '_'),
                        facility.type,
                        fixed(facility.scale, 2),
                        fixed(facility.scale / Math.max(1e-9, facility.maxScale), 4),
                        fixed(status, 6),
                        fixed(ceiling, 6),
                        fixed(ceiling - status, 6),
                        fixed(wearPerTick, 8),
                        fixed(desired, 4),
                        fixed(consumed, 4),
                        fixed(restored, 4),
                        fixed(desired > 0 ? consumed / desired : 0, 6),
                        fixed(agentRation, 6),
                        fixed(svcInv, 4),
                        fixed(svcFreeCap, 4),
                        fixed(bid?.bidStorageTarget ?? 0, 4),
                        fixed(bid?.lastEffectiveQty ?? 0, 4),
                        fixed(bid?.lastBought ?? 0, 4),
                        fixed(bid?.smoothedFillRate ?? 0, 6),
                        fixed(bid?.bidPrice ?? 0, 6),
                        fixed(market?.totalSupply ?? 0, 4),
                        fixed(market?.totalDemand ?? 0, 4),
                        fixed(market?.totalVolume ?? 0, 4),
                        fixed(totalDesired, 4),
                        fixed(totalDesired * 3, 4),
                        fixed(consumedSum, 4),
                        fixed(svcInv, 4),
                        facilityCount,
                    ].join(','),
                );
            }
        }
    }
    return lines;
}

const startTick = meta.tick;
const endTick = startTick + years * TICKS_PER_YEAR;
let buffer: string[] = [];
for (let t = startTick + 1; t <= endTick; t++) {
    gameState.tick = t;
    advanceTick(gameState);
    buffer.push(...captureTick());
    if (t % 30 === 0) {
        fs.appendFileSync(probePath, buffer.join('\n') + '\n');
        buffer = [];
    }
    if (t % TICKS_PER_YEAR === 0) {
        console.log(`[maintenanceProbe] y${(t / TICKS_PER_YEAR).toFixed(0)}/${(endTick / TICKS_PER_YEAR).toFixed(0)}`);
    }
}
if (buffer.length) {
    fs.appendFileSync(probePath, buffer.join('\n') + '\n');
}

console.log(`[maintenanceProbe] wrote ${probePath}`);
