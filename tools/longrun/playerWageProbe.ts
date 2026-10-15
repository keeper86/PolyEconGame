import fs from 'node:fs';
import path from 'node:path';

import {
    acceptProbability,
    computeLaborMarket,
    reservationWage,
    smoothedReachableVacancyWage,
} from '../../src/simulation/workforce/laborMarket';
import { MIN_EMPLOYABLE_AGE, TICKS_PER_MONTH, TICKS_PER_YEAR } from '../../src/simulation/constants';
import { educationLevelKeys } from '../../src/simulation/population/education';
import { advanceTick } from '../../src/simulation/engine';
import { grantAutomaticLoan } from '../../src/simulation/financial/loanConditions';
import { totalOutstandingLoans } from '../../src/simulation/financial/loanTypes';
import { makeAgentPlanetAssets, makeStorage } from '../../src/simulation/initialUniverse/helpers';
import {
    buildBuyAutoConfigForResource,
    buildSellAutoConfigForResource,
    generateAgentPersonality,
} from '../../src/simulation/initialUniverse/personalities';
import { applyStorageSizingForFacilities } from '../../src/simulation/planet/automaticProductionScale/shellCompartments';
import { computeLeaseClaimUpfrontCost, leaseClaim, type ResourceQuantity } from '../../src/simulation/planet/claims';
import { calculateCostsForConstruction, getFacilityType } from '../../src/simulation/planet/facility';
import type { Agent, GameState, Planet } from '../../src/simulation/planet/planet';
import { ALL_PRODUCTION_FACILITY_ENTRIES, type FacilityType } from '../../src/simulation/planet/productionFacilities';
import { constructionServiceResourceType } from '../../src/simulation/planet/services';
import { humanResourcesOfficeFacilityType } from '../../src/simulation/planet/specialFacilities';
import { deserializeSnapshot } from '../../src/simulation/snapshotCompression';
import { setRngState } from '../../src/simulation/utils/stochasticRound';
import { sumSlotFillByEdu, totalActiveForEdu } from '../../src/simulation/workforce/workforceAggregates';

const RESULTS_ROOT = path.join(__dirname, 'results');
const PLAYER_ID = 'player-company';

function arg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const found = process.argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
}

type CheckpointMeta = { tick: number; rng: [number, number] };

type InjectOptions = {
    facilityKey: string;
    targetScale: number;
    autoOn: boolean;
    hrOn: boolean;
    claimsOn: boolean;
    underConstruction: boolean;
    deposits: number;
    horizonTicks: number;
};


function injectPlayer(gs: GameState, planet: Planet, planetId: string, opts: InjectOptions): Agent {
    const entry = ALL_PRODUCTION_FACILITY_ENTRIES[opts.facilityKey as FacilityType];
    if (!entry) {
        throw new Error(
            `unknown facility '${opts.facilityKey}'. options: ${Object.keys(ALL_PRODUCTION_FACILITY_ENTRIES).join(', ')}`,
        );
    }

    const facility = entry.factory(planetId, `${PLAYER_ID}-${opts.facilityKey}`);
    facility.scale = opts.targetScale;
    facility.maxScale = opts.targetScale;

    const storage = makeStorage({ planetId, id: `${PLAYER_ID}-storage` });
    applyStorageSizingForFacilities(storage, [facility]);

    if (opts.underConstruction) {
        const { cost, time } = calculateCostsForConstruction(getFacilityType(facility), 0, opts.targetScale);
        facility.construction = {
            type: 'new',
            progress: 0,
            constructionTargetMaxScale: opts.targetScale,
            totalConstructionServiceRequired: cost,
            maximumConstructionServiceConsumption: time > 0 ? cost / time : 0,
            lastTickInvestedConstructionServices: 0,
            suspended: false,
        };
        facility.scale = 0;
        facility.maxScale = 0;
    }

    const hr = opts.hrOn ? humanResourcesOfficeFacilityType(planetId, `${PLAYER_ID}-hr`) : null;
    if (hr) {
        hr.scale = 1;
        hr.maxScale = 1;
    }

    const assets = makeAgentPlanetAssets([facility], storage, hr);
    assets.licenses = {
        commercial: { acquiredTick: gs.tick, frozen: false },
        workforce: { acquiredTick: gs.tick, frozen: false },
    };
    assets.wagePerEdu = { ...planet.wagePerEdu };

    const personality = generateAgentPersonality();
    for (const { resource } of facility.produces) {
        assets.market.sell[resource.name] = {
            resource,
            automated: true,
            autoConfig: buildSellAutoConfigForResource(personality.sellAutoConfig, resource),
        };
    }
    for (const { resource } of facility.needs) {
        if (resource.form === 'landBoundResource') {
            continue;
        }
        assets.market.buy[resource.name] = {
            resource,
            automated: true,
            autoConfig: buildBuyAutoConfigForResource(personality.buyAutoConfig, resource),
        };
    }

    const player: Agent = {
        id: PLAYER_ID,
        name: 'Player Company',
        logo: 'ai_company',
        foundedTick: gs.tick,
        associatedPlanetId: planetId,
        ships: [],
        automated: false,
        automateWorkerAllocation: opts.autoOn,
        assets: { [planetId]: assets },
    };
    gs.agents.set(PLAYER_ID, player);

    const headcount = opts.targetScale * Object.values(facility.workerRequirement).reduce((sum, n) => sum + n, 0);
    const csPrice = planet.marketPrices[constructionServiceResourceType.name] ?? 0;
    const constructionCash = opts.underConstruction
        ? facility.construction!.totalConstructionServiceRequired * csPrice
        : 0;
    const wageCushion = 6 * TICKS_PER_MONTH * headcount * (planet.wagePerEdu.none ?? 1);
    const startupLoan = Math.ceil(constructionCash + wageCushion);
    if (opts.deposits > 0) {
        assets.deposits = opts.deposits;
    }
    if (startupLoan > 0) {
        grantAutomaticLoan(gs, player, planet, startupLoan, 'bufferCoverage', gs.tick);
    }

    if (opts.claimsOn) {
        leaseFacilityClaims(gs, planet, player, facility.needs, opts.targetScale, opts.horizonTicks);
    }

    return player;
}

function leaseFacilityClaims(
    gs: GameState,
    planet: Planet,
    player: Agent,
    needs: ResourceQuantity[],
    targetScale: number,
    horizonTicks: number,
): void {
    const assets = player.assets[planet.id]!;
    for (const need of needs) {
        if (need.resource.form !== 'landBoundResource') {
            continue;
        }
        const resourceEntry = planet.resources[need.resource.name];
        if (!resourceEntry) {
            continue;
        }
        const required = need.quantity * targetScale;
        const renewable = resourceEntry.pool.regenerationRate > 0;
        const toAcquire = renewable
            ? Math.ceil(required)
            : Math.ceil(required * (horizonTicks + TICKS_PER_MONTH));
        if (toAcquire <= 0) {
            continue;
        }
        const upfront = computeLeaseClaimUpfrontCost(resourceEntry.pool, toAcquire);
        if (assets.deposits < upfront) {
            grantAutomaticLoan(gs, player, planet, upfront - assets.deposits, 'claimCoverage', gs.tick);
        }
        const result = leaseClaim(gs, PLAYER_ID, planet.id, need.resource.name, toAcquire);
        if (!result.ok) {
            console.warn(`[playerWageProbe] lease of ${need.resource.name} failed: ${result.error.code}`);
        }
    }
}


const HEADER = [
    'tick',
    'month',
    'wageNone',
    'wagePrimary',
    'wageSecondary',
    'wageTertiary',
    'ceiling',
    'shortagePressure',
    'churnPressure',
    'quitRate',
    'revenue',
    'wages',
    'purchases',
    'claimPayments',
    'productionValue',
    'workerTicks',
    'deposits',
    'loans',
    'activeNone',
    'activePrimary',
    'activeSecondary',
    'activeTertiary',
    'capacityNone',
    'capacityPrimary',
    'capacitySecondary',
    'capacityTertiary',
    'slotFillNone',
    'slotFillPrimary',
    'slotFillSecondary',
    'slotFillTertiary',
    'facilityScale',
    'facilityMaxScale',
    'facilityRevenue',
    'facilityWageCosts',
    'facilityInputCosts',
    'planetWageNone',
    'planetWagePrimary',
    'planetWageSecondary',
    'planetWageTertiary',
    'hireDemandNone',
    'hireDemandPrimary',
    'hireDemandSecondary',
    'hireDemandTertiary',
    'hireFilledNone',
    'hireFilledPrimary',
    'hireFilledSecondary',
    'hireFilledTertiary',
    'willingNone',
    'willingPrimary',
    'willingSecondary',
    'willingTertiary',
    'bankrupt',
];

function thresholdByEdu(gs: GameState, planetId: string): Record<string, { threshold: number; smoothed: number; tightness: number }> {
    const planet = gs.planets.get(planetId)!;
    const market = computeLaborMarket(gs.agents, planet);
    const out: Record<string, { threshold: number; smoothed: number; tightness: number }> = {};
    for (const edu of educationLevelKeys) {
        const smoothed = smoothedReachableVacancyWage(planet, edu, market.reachableVacancyWage[edu]);
        out[edu] = {
            threshold: reservationWage(market.reachableTightness[edu], smoothed),
            smoothed,
            tightness: market.reachableTightness[edu],
        };
    }
    return out;
}

function willingByEdu(gs: GameState, planetId: string, playerWage: Record<string, number>): Record<string, number> {
    const planet = gs.planets.get(planetId)!;
    const market = computeLaborMarket(gs.agents, planet);
    const out: Record<string, number> = { none: 0, primary: 0, secondary: 0, tertiary: 0 };
    for (const edu of educationLevelKeys) {
        const threshold = reservationWage(
            market.reachableTightness[edu],
            smoothedReachableVacancyWage(planet, edu, market.reachableVacancyWage[edu]),
        );
        const prob = acceptProbability(playerWage[edu] ?? 0, threshold);
        let willing = 0;
        for (let age = MIN_EMPLOYABLE_AGE; age < planet.population.demography.length; age++) {
            willing += planet.population.demography[age].unoccupied[edu].total * prob;
        }
        out[edu] = willing;
    }
    return out;
}

function main(): void {
    const baseName = process.argv[2];
    if (!baseName || baseName.startsWith('--')) {
        throw new Error(
            'usage: playerWageProbe.ts <base-run-dir> [--facility=coalMine] [--targetScale=1] [--auto=on|off] ' +
                '[--hr=on|off] [--claims=on|off] [--construction=on|off] [--deposits=0] [--months=24] [--out=<name>]',
        );
    }

    const facilityKey = arg('facility') ?? 'coalMine';
    const targetScale = Number(arg('targetScale') ?? 1);
    const autoOn = (arg('auto') ?? 'on') !== 'off';
    const hrOn = (arg('hr') ?? 'off') === 'on';
    const claimsOn = (arg('claims') ?? 'on') !== 'off';
    const underConstruction = (arg('construction') ?? 'off') === 'on';
    const deposits = Number(arg('deposits') ?? 0);
    const months = Number(arg('months') ?? 24);
    const outName = arg('out') ?? `playerProbe-${facilityKey}-auto${autoOn ? 'on' : 'off'}${hrOn ? '-hr' : ''}`;
    const outDir = path.join(RESULTS_ROOT, outName);

    const baseDir = path.join(RESULTS_ROOT, baseName);
    const meta = JSON.parse(fs.readFileSync(path.join(baseDir, 'checkpoint.json'), 'utf8')) as CheckpointMeta;
    const gs: GameState = deserializeSnapshot(fs.readFileSync(path.join(baseDir, 'checkpoint.bin')));
    setRngState(meta.rng);

    const planetId = gs.planets.keys().next().value as string;
    const planet = gs.planets.get(planetId)!;

    console.log(
        `[playerWageProbe] base=${baseName} tick=${gs.tick} (y${(gs.tick / TICKS_PER_YEAR).toFixed(1)}) ` +
            `planetWage=${JSON.stringify(planet.wagePerEdu)}`,
    );

    const player = injectPlayer(gs, planet, planetId, {
        facilityKey,
        targetScale,
        autoOn,
        hrOn,
        claimsOn,
        underConstruction,
        deposits,
        horizonTicks: months * TICKS_PER_MONTH,
    });
    const assets = player.assets[planetId]!;
    console.log(
        `[playerWageProbe] injected '${facilityKey}' scale=${targetScale} auto=${autoOn} hr=${hrOn} ` +
            `claims=${claimsOn} deposits=${assets.deposits.toFixed(0)} loans=${totalOutstandingLoans(assets.activeLoans).toFixed(0)}`,
    );

    const startTick = gs.tick;
    const totalTicks = months * TICKS_PER_MONTH;
    const rows: string[] = [];
    let peakWage = 0;
    let peakRatio = 0;
    let bankruptTick = -1;

    for (let k = 1; k <= totalTicks; k++) {
        gs.tick = startTick + k;
        advanceTick(gs);

        const wage = assets.wagePerEdu;
        const step = assets._wageStepDebug;
        const slotFill = sumSlotFillByEdu(assets);
        const capacity = assets.totalSlotCapacity;
        const last = assets.lastMonthAcc;
        const facility = assets.productionFacilities[0];
        const facilityResults = facility.lastTickResults;
        const bankrupt = gs.bankruptcies.some((b) => b.agentId === PLAYER_ID);
        if (bankrupt && bankruptTick < 0) {
            bankruptTick = gs.tick;
        }

        const primaryWage = wage.primary ?? 0;
        const planetPrimary = planet.wagePerEdu.primary ?? 0;
        const willing = willingByEdu(gs, planetId, wage);
        if (k % TICKS_PER_MONTH === 0) {
            const t = thresholdByEdu(gs, planetId);
            console.log(
                `  [m${k / TICKS_PER_MONTH}] wageN=${wage.none.toFixed(2)} thrN=${t.none.threshold.toFixed(3)} ` +
                    `smN=${t.none.smoothed.toFixed(3)} tightN=${t.none.tightness.toFixed(5)} | ` +
                    `wageP=${primaryWage.toFixed(2)} thrP=${t.primary.threshold.toFixed(3)} ` +
                    `smP=${t.primary.smoothed.toFixed(3)} tightP=${t.primary.tightness.toFixed(5)}`,
            );
        }
        if (primaryWage > peakWage) {
            peakWage = primaryWage;
        }
        const ratio = planetPrimary > 0 ? primaryWage / planetPrimary : 0;
        if (ratio > peakRatio) {
            peakRatio = ratio;
        }


        rows.push(
            [
                gs.tick,
                ((gs.tick - startTick) / TICKS_PER_MONTH).toFixed(2),
                wage.none.toFixed(4),
                primaryWage.toFixed(4),
                wage.secondary.toFixed(4),
                wage.tertiary.toFixed(4),
                (assets._smoothedWageCeiling ?? 0).toFixed(4),
                (step?.none?.shortagePressure ?? 0).toFixed(4),
                (step?.none?.churnPressure ?? 0).toFixed(4),
                (step?.none?.quitRate ?? 0).toFixed(4),
                last.revenue.toFixed(2),
                last.wages.toFixed(2),
                last.purchases.toFixed(2),
                last.claimPayments.toFixed(2),
                last.productionValue.toFixed(2),
                last.totalWorkersTicks.toFixed(0),
                assets.deposits.toFixed(2),
                totalOutstandingLoans(assets.activeLoans).toFixed(2),
                totalActiveForEdu(assets.workforceDemography, 'none').toFixed(0),
                totalActiveForEdu(assets.workforceDemography, 'primary').toFixed(0),
                totalActiveForEdu(assets.workforceDemography, 'secondary').toFixed(0),
                totalActiveForEdu(assets.workforceDemography, 'tertiary').toFixed(0),
                (capacity.none ?? 0).toFixed(0),
                (capacity.primary ?? 0).toFixed(0),
                (capacity.secondary ?? 0).toFixed(0),
                (capacity.tertiary ?? 0).toFixed(0),
                (slotFill.none ?? 0).toFixed(0),
                (slotFill.primary ?? 0).toFixed(0),
                (slotFill.secondary ?? 0).toFixed(0),
                (slotFill.tertiary ?? 0).toFixed(0),
                facility.scale.toFixed(3),
                facility.maxScale.toFixed(3),
                (facilityResults.revenue ?? 0).toFixed(2),
                (facilityResults.wageCosts ?? 0).toFixed(2),
                (facilityResults.inputCosts ?? 0).toFixed(2),
                planet.wagePerEdu.none.toFixed(4),
                planetPrimary.toFixed(4),
                planet.wagePerEdu.secondary.toFixed(4),
                planet.wagePerEdu.tertiary.toFixed(4),
                (assets.monthAcc.hireDemand?.none ?? 0).toFixed(0),
                (assets.monthAcc.hireDemand?.primary ?? 0).toFixed(0),
                (assets.monthAcc.hireDemand?.secondary ?? 0).toFixed(0),
                (assets.monthAcc.hireDemand?.tertiary ?? 0).toFixed(0),
                (assets.monthAcc.hireFilled?.none ?? 0).toFixed(0),
                (assets.monthAcc.hireFilled?.primary ?? 0).toFixed(0),
                (assets.monthAcc.hireFilled?.secondary ?? 0).toFixed(0),
                (assets.monthAcc.hireFilled?.tertiary ?? 0).toFixed(0),
                willing.none.toFixed(2),
                willing.primary.toFixed(2),
                willing.secondary.toFixed(2),
                willing.tertiary.toFixed(2),
                bankrupt ? '1' : '0',
            ].join(','),
        );
    }

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'playerWage.csv'), HEADER.join(',') + '\n' + rows.join('\n') + '\n');

    console.log(
        `[playerWageProbe] done ${totalTicks} ticks -> ${path.join(outDir, 'playerWage.csv')}\n` +
            `  peak primary wage=${peakWage.toFixed(3)} (${peakRatio.toFixed(2)}x planet)\n` +
            `  wages(last month)=${assets.lastMonthAcc.wages.toFixed(0)} revenue=${assets.lastMonthAcc.revenue.toFixed(0)} ` +
            `deposits=${assets.deposits.toFixed(0)} loans=${totalOutstandingLoans(assets.activeLoans).toFixed(0)}\n` +
            `  bankrupt=${bankruptTick >= 0 ? `y${(bankruptTick / TICKS_PER_YEAR).toFixed(2)}` : 'no'}`,
    );
}

main();
