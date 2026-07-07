import { createRecyclerAgent } from '../agents/recycler';
import { TICKS_PER_YEAR } from '../constants';
import type { ProductionFacility } from '../planet/facility';
import {
    arableLandResourceType,
    clayDepositResourceType,
    coalDepositResourceType,
    copperDepositResourceType,
    forestResourceType,
    ironOreDepositResourceType,
    limestoneDepositResourceType,
    oilReservoirResourceType,
    sandDepositResourceType,
    stoneDepositResourceType,
    waterSourceResourceType,
} from '../planet/landBoundResources';
import type { Agent, Planet } from '../planet/planet';
import {
    administrativeCenter,
    beveragePlant,
    cementPlant,
    clayMine,
    clothingFactory,
    coalMine,
    coalPowerPlant,
    concretePlant,
    constructionFacility,
    copperMine,
    copperSmelter,
    cottonFarm,
    educationCenter,
    electronicsFactory,
    foodProcessingPlant,
    furnitureFactory,
    glassFactory,
    groceryChain,
    hospital,
    intensiveFarmFacility,
    ironExtractionFacility,
    ironSmelter,
    itDevicesFactory,
    limestoneQuarry,
    loggingCamp,
    logisticsHub,
    machineryFactory,
    oilRefinery,
    oilWell,
    packagingPlant,
    paperMill,
    pesticidePlant,
    pharmaceuticalPlant,
    retailChain,
    sandMine,
    sawmill,
    siliconWaferFactory,
    stoneQuarry,
    textileMill,
    vehicleFactory,
    waterExtractionFacility,
} from '../planet/productionFacilities';
import { createPopulation, makeAgent, makeDefaultEnvironment, makeStorage } from './helpers';
import { initialMarketPrices } from './initialMarketPrices';
import { NAMES } from './preConfiguredCompanies';
import { makeClaim, makePool } from './resourceClaimFactory';
import type { ResourceClaim } from '../planet/claims';

export const PROC_PLANET_ID = 'earth';
const GOV = 'earth-government';

const TOTAL_ARABLE = 3_500_000_000;
const TOTAL_WATER = 4_000_000_000;
const TOTAL_IRON_ORE = 5_000_000_000_000;
const TOTAL_COAL = 4_000_000_000_000;
const TOTAL_OIL = 3_000_000_000_000;
const TOTAL_FOREST = 200_000_000_000;
const TOTAL_COPPER = 1_000_500_000_000;
const TOTAL_SAND = 2_000_000_000_000;
const TOTAL_LIMESTONE = 3_000_000_000_000;
const TOTAL_CLAY = 2_000_000_000_000;
const TOTAL_STONE = 4_000_000_000_000;

function splitScale(total: number, count: number, seed: string): number[] {
    let s = 0;
    for (let i = 0; i < seed.length; i++) {
        s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const rand = () => {
        s = (1664525 * s + 1013904223) >>> 0;
        return s / 0x1_0000_0000;
    };

    const weights = Array.from({ length: count }, () => 0.5 + rand());
    const wSum = weights.reduce((a, b) => a + b, 0);

    const intTotal = Math.round(total);
    let remaining = intTotal;
    const shares: number[] = [];
    for (let i = 0; i < count; i++) {
        if (i === count - 1) {
            shares.push(remaining);
        } else {
            const share = Math.max(1, Math.round((weights[i] / wSum) * intTotal));
            shares.push(share);
            remaining -= share;
        }
    }
    return shares;
}

interface FacilityTarget {
    totalScale: number;
    agentCount: number;
}

const TARGETS: Record<string, FacilityTarget> = {
    coalMine: { totalScale: 64_546, agentCount: 3 },
    oilWell: { totalScale: 781_908, agentCount: 4 },
    loggingCamp: { totalScale: 422_917, agentCount: 4 },
    stoneQuarry: { totalScale: 160_000, agentCount: 3 },
    copperMine: { totalScale: 53_516, agentCount: 3 },
    sandMine: { totalScale: 400_922, agentCount: 3 },
    limestoneQuarry: { totalScale: 145_818, agentCount: 3 },
    clayMine: { totalScale: 24_000, agentCount: 3 },
    cottonFarm: { totalScale: 983_157, agentCount: 4 },
    waterExtractionFacility: { totalScale: 241_115, agentCount: 4 },
    ironExtractionFacility: { totalScale: 242_191, agentCount: 4 },
    coalPowerPlant: { totalScale: 73_244, agentCount: 4 },
    ironSmelter: { totalScale: 645_843, agentCount: 4 },
    copperSmelter: { totalScale: 178_386, agentCount: 3 },
    oilRefinery: { totalScale: 1_172_862, agentCount: 4 },
    sawmill: { totalScale: 533_333, agentCount: 4 },
    cementPlant: { totalScale: 640_000, agentCount: 4 },
    glassFactory: { totalScale: 267_275, agentCount: 3 },
    pesticidePlant: { totalScale: 248_025, agentCount: 3 },
    paperMill: { totalScale: 61_111, agentCount: 3 },
    textileMill: { totalScale: 819_297, agentCount: 4 },
    concretePlant: { totalScale: 800_000, agentCount: 4 },
    foodProcessingPlant: { totalScale: 1_000_000, agentCount: 4 },
    beveragePlant: { totalScale: 466_667, agentCount: 3 },
    pharmaceuticalPlant: { totalScale: 277_778, agentCount: 3 },
    clothingFactory: { totalScale: 888_889, agentCount: 4 },
    furnitureFactory: { totalScale: 1_066_667, agentCount: 4 },
    electronicComponentFactory: { totalScale: 445_964, agentCount: 3 },
    consumerElectronicsFactory: { totalScale: 888_889, agentCount: 4 },
    machineryFactory: { totalScale: 32_745, agentCount: 2 },
    vehicleFactory: { totalScale: 30_392, agentCount: 2 },
    intensiveFarmFacility: { totalScale: 724_074, agentCount: 4 },
    packagingPlant: { totalScale: 1_611_111, agentCount: 4 },
    administrativeCenter: { totalScale: 2_132_889, agentCount: 4 },
    logisticsHub: { totalScale: 3_191_111, agentCount: 4 },
    constructionService: { totalScale: 1_333_333, agentCount: 4 },
    groceryChain: { totalScale: 1_833_333, agentCount: 6 },
    retailChain: { totalScale: 1_777_778, agentCount: 4 },
    hospital: { totalScale: 1_488_889, agentCount: 4 },
    siliconWaferFactory: { totalScale: 222_982, agentCount: 4 },
};

function depositPerScale(facilityType: string): number {
    switch (facilityType) {
        case 'coalMine':
            return 500000;
        case 'oilWell':
            return 300000;
        case 'loggingCamp':
            return 400000;
        case 'stoneQuarry':
            return 400000;
        case 'copperMine':
            return 400000;
        case 'sandMine':
            return 300000;
        case 'limestoneQuarry':
            return 300000;
        case 'clayMine':
            return 400000;
        case 'cottonFarm':
            return 200000;
        case 'intensiveFarmFacility':
            return 30000;
        case 'waterExtractionFacility':
            return 800000;
        case 'ironExtractionFacility':
            return 400000;
        default:
            return 0;
    }
}

type FacilityFactory = (planetId: string, id: string) => ProductionFacility;

function getFacilityFactory(type: string): FacilityFactory {
    const MAP: Record<string, FacilityFactory> = {
        coalMine,
        oilWell,
        loggingCamp,
        stoneQuarry,
        copperMine,
        sandMine,
        limestoneQuarry,
        clayMine,
        cottonFarm,
        waterExtractionFacility,
        ironExtractionFacility,
        coalPowerPlant,
        ironSmelter,
        copperSmelter,
        oilRefinery,
        sawmill,
        cementPlant,
        glassFactory,
        pesticidePlant,
        paperMill,
        textileMill,
        concretePlant,
        foodProcessingPlant,
        beveragePlant,
        pharmaceuticalPlant,
        clothingFactory,
        furnitureFactory,
        electronicComponentFactory: electronicsFactory,
        consumerElectronicsFactory: itDevicesFactory,
        machineryFactory,
        vehicleFactory,
        intensiveFarmFacility,
        packagingPlant,
        administrativeCenter,
        logisticsHub,
        constructionService: constructionFacility,
        groceryChain,
        retailChain,
        hospital,
        siliconWaferFactory,
    };
    const f = MAP[type];
    if (!f) {
        throw new Error(`Unknown facility type: ${type}`);
    }
    return f;
}

interface ClaimPool {
    type:
        | typeof arableLandResourceType
        | typeof waterSourceResourceType
        | typeof coalDepositResourceType
        | typeof oilReservoirResourceType
        | typeof forestResourceType
        | typeof stoneDepositResourceType
        | typeof copperDepositResourceType
        | typeof sandDepositResourceType
        | typeof limestoneDepositResourceType
        | typeof clayDepositResourceType
        | typeof ironOreDepositResourceType;
    total: number;
    prefix: string;
    renewable: boolean;
    entries: ResourceClaim[];
}

function resourceType(facilityType: string): ClaimPool['type'] | null {
    const MAP: Record<string, ClaimPool['type']> = {
        coalMine: coalDepositResourceType,
        oilWell: oilReservoirResourceType,
        loggingCamp: forestResourceType,
        stoneQuarry: stoneDepositResourceType,
        copperMine: copperDepositResourceType,
        sandMine: sandDepositResourceType,
        limestoneQuarry: limestoneDepositResourceType,
        clayMine: clayDepositResourceType,
        cottonFarm: arableLandResourceType,
        intensiveFarmFacility: arableLandResourceType,
        waterExtractionFacility: waterSourceResourceType,
        ironExtractionFacility: ironOreDepositResourceType,
    };
    return MAP[facilityType] ?? null;
}

function renewableForResource(facilityType: string): boolean {
    const NON_RENEWABLE = new Set([
        'coalMine',
        'oilWell',
        'copperMine',
        'ironExtractionFacility',
        'stoneQuarry',
        'sandMine',
        'limestoneQuarry',
        'clayMine',
    ]);
    return !NON_RENEWABLE.has(facilityType);
}

function claimPoolKey(facilityType: string): string {
    if (facilityType === 'intensiveFarmFacility') {
        return 'cottonFarm';
    }
    return facilityType;
}

export function buildProceduralWorld(): { planet: Planet; agents: Agent[] } {
    const agents: Agent[] = [];
    const govClaims: string[] = [];

    const claimPools = new Map<string, ResourceClaim[]>();

    const govArableId = `${PROC_PLANET_ID}-gov-arable`;
    const govWaterId = `${PROC_PLANET_ID}-gov-water`;
    govClaims.push(govArableId, govWaterId);

    if (!claimPools.has('cottonFarm')) {
        claimPools.set('cottonFarm', []);
    }
    if (!claimPools.has('waterExtractionFacility')) {
        claimPools.set('waterExtractionFacility', []);
    }

    claimPools.get('cottonFarm')!.push(
        makeClaim({
            id: govArableId,
            type: arableLandResourceType,
            quantity: 100_000_000,
            tenantAgentId: 'proc-utilities',
            costPerTick: 100_000_000,
            renewable: true,
        }),
    );
    claimPools.get('waterExtractionFacility')!.push(
        makeClaim({
            id: govWaterId,
            type: waterSourceResourceType,
            quantity: 100_000_000,
            tenantAgentId: 'proc-utilities',
            costPerTick: 100_000_000,
            renewable: true,
        }),
    );

    for (const [facilityType, target] of Object.entries(TARGETS)) {
        const names = NAMES[facilityType] ?? [];
        const count = Math.min(target.agentCount, names.length);
        if (count === 0) {
            continue;
        }

        const scales = splitScale(target.totalScale, count, facilityType);
        const rType = resourceType(facilityType);
        const dpScale = depositPerScale(facilityType);

        for (let i = 0; i < count; i++) {
            const name = names[i];
            const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const scale = scales[i];

            const facilities: ProductionFacility[] = [];
            const tenancies: string[] = [];

            const factory = getFacilityFactory(facilityType);
            const fac = factory(PROC_PLANET_ID, `${id}-${facilityType}`);
            fac.scale = scale;
            fac.maxScale = scale;
            facilities.push(fac);

            if (facilityType === 'cottonFarm' || facilityType === 'intensiveFarmFacility') {
                const waterNeeded = facilityType === 'cottonFarm' ? 80 : 100;
                const waterExtractPerUnit = 800;
                const waterScale = Math.max(1, Math.ceil((scale * waterNeeded) / waterExtractPerUnit));
                const wFac = waterExtractionFacility(PROC_PLANET_ID, `${id}-water`);
                wFac.scale = waterScale;
                wFac.maxScale = waterScale;
                facilities.push(wFac);

                const waterPool = claimPools.get('waterExtractionFacility') ?? [];
                claimPools.set('waterExtractionFacility', waterPool);
                const waterClaimQty = waterScale * 800;
                const waterClaimId = `${PROC_PLANET_ID}-water-${id}`;
                const waterClaim = makeClaim({
                    id: waterClaimId,
                    type: waterSourceResourceType,
                    quantity: waterClaimQty,
                    tenantAgentId: id,
                    tenantCostInCoins: Math.floor(waterClaimQty * 0.0005),
                    renewable: true,
                });
                waterPool.push(waterClaim);
                govClaims.push(waterClaimId);
                tenancies.push(waterClaimId);
            }

            if (rType !== null && dpScale > 0) {
                const poolKey = claimPoolKey(facilityType);
                const pool = claimPools.get(poolKey) ?? [];
                claimPools.set(poolKey, pool);
                const depositQty = scale * dpScale;
                const claimId = `${PROC_PLANET_ID}-deposit-${facilityType}-${id}`;
                const claim = makeClaim({
                    id: claimId,
                    type: rType,
                    quantity: depositQty,
                    tenantAgentId: id,
                    tenantCostInCoins: Math.floor(depositQty * 0.0001),
                    renewable: renewableForResource(facilityType),
                });
                pool.push(claim);
                govClaims.push(claimId);
                tenancies.push(claimId);
            }

            agents.push(
                makeAgent({
                    id,
                    name,
                    associatedPlanetId: PROC_PLANET_ID,
                    planetId: PROC_PLANET_ID,
                    facilities,
                    storage: makeStorage({ planetId: PROC_PLANET_ID, id: `${id}-storage`, name: `${name} Storage` }),
                    tenancies,
                }),
            );
        }
    }

    {
        const pestScale = Math.round(TARGETS.pesticidePlant.totalScale * 0.1);
        const f2 = pesticidePlant(PROC_PLANET_ID, 'agrochemplus-pest');
        f2.scale = pestScale;
        f2.maxScale = pestScale;
        agents.push(
            makeAgent({
                id: 'agrochemplus-corp',
                name: 'AgroChemPlus Corp',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f2],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: 'agrochemplus-storage',
                    name: 'AgroChemPlus Storage',
                }),
            }),
        );
    }

    {
        const paperScale = Math.round(TARGETS.paperMill.totalScale * 0.1);
        const packScale = Math.round(TARGETS.packagingPlant.totalScale * 0.05);
        const f1 = paperMill(PROC_PLANET_ID, 'paperpack-paper');
        f1.scale = paperScale;
        f1.maxScale = paperScale;
        const f2 = packagingPlant(PROC_PLANET_ID, 'paperpack-pack');
        f2.scale = packScale;
        f2.maxScale = packScale;
        agents.push(
            makeAgent({
                id: 'paperpack-industries',
                name: 'PaperPack Industries',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({ planetId: PROC_PLANET_ID, id: 'paperpack-storage', name: 'PaperPack Storage' }),
            }),
        );
    }

    {
        const texScale = Math.round(TARGETS.textileMill.totalScale * 0.08);
        const cloScale = Math.round(TARGETS.clothingFactory.totalScale * 0.08);
        const f1 = textileMill(PROC_PLANET_ID, 'fashionchain-textile');
        f1.scale = texScale;
        f1.maxScale = texScale;
        const f2 = clothingFactory(PROC_PLANET_ID, 'fashionchain-clothing');
        f2.scale = cloScale;
        f2.maxScale = cloScale;
        agents.push(
            makeAgent({
                id: 'fashionchain-group',
                name: 'FashionChain Group',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: 'fashionchain-storage',
                    name: 'FashionChain Storage',
                }),
            }),
        );
    }

    {
        const waferScale = Math.round(TARGETS.siliconWaferFactory.totalScale * 0.1);
        const compScale = Math.round(TARGETS.electronicComponentFactory.totalScale * 0.08);
        const f1 = siliconWaferFactory(PROC_PLANET_ID, 'chipmaker-wafer');
        f1.scale = waferScale;
        f1.maxScale = waferScale;
        const f2 = electronicsFactory(PROC_PLANET_ID, 'chipmaker-comp');
        f2.scale = compScale;
        f2.maxScale = compScale;
        agents.push(
            makeAgent({
                id: 'chipmaker-technologies',
                name: 'ChipMaker Technologies',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({ planetId: PROC_PLANET_ID, id: 'chipmaker-storage', name: 'ChipMaker Storage' }),
            }),
        );
    }

    {
        const ceScale = Math.round(TARGETS.consumerElectronicsFactory.totalScale * 0.08);
        const retScale = Math.round(TARGETS.retailChain.totalScale * 0.06);
        const f1 = itDevicesFactory(PROC_PLANET_ID, 'techretail-ce');
        f1.scale = ceScale;
        f1.maxScale = ceScale;
        const f2 = retailChain(PROC_PLANET_ID, 'techretail-retail');
        f2.scale = retScale;
        f2.maxScale = retScale;
        agents.push(
            makeAgent({
                id: 'techretail-corp',
                name: 'TechRetail Corp',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: 'techretail-storage',
                    name: 'TechRetail Storage',
                }),
            }),
        );
    }

    {
        const fpScale = Math.round(TARGETS.foodProcessingPlant.totalScale * 0.08);
        const grScale = Math.round(TARGETS.groceryChain.totalScale * 0.06);
        const f1 = foodProcessingPlant(PROC_PLANET_ID, 'freshgrocer-food');
        f1.scale = fpScale;
        f1.maxScale = fpScale;
        const f2 = groceryChain(PROC_PLANET_ID, 'freshgrocer-grocery');
        f2.scale = grScale;
        f2.maxScale = grScale;
        agents.push(
            makeAgent({
                id: 'freshgrocer-inc',
                name: 'FreshGrocer Inc',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: 'freshgrocer-storage',
                    name: 'FreshGrocer Storage',
                }),
            }),
        );
    }

    {
        const machScale = Math.round(TARGETS.machineryFactory.totalScale * 0.15);
        const vehScale = Math.round(TARGETS.vehicleFactory.totalScale * 0.15);
        const f1 = machineryFactory(PROC_PLANET_ID, 'autoindustry-mach');
        f1.scale = machScale;
        f1.maxScale = machScale;
        const f2 = vehicleFactory(PROC_PLANET_ID, 'autoindustry-veh');
        f2.scale = vehScale;
        f2.maxScale = vehScale;
        agents.push(
            makeAgent({
                id: 'autoindustry-conglomerate',
                name: 'AutoIndustry Conglomerate',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: 'autoindustry-storage',
                    name: 'AutoIndustry Storage',
                }),
            }),
        );
    }

    {
        const concScale = Math.round(TARGETS.concretePlant.totalScale * 0.08);
        const cstScale = Math.round(TARGETS.constructionService.totalScale * 0.08);
        const f1 = concretePlant(PROC_PLANET_ID, 'buildmaster-concrete');
        f1.scale = concScale;
        f1.maxScale = concScale;
        const f2 = constructionFacility(PROC_PLANET_ID, 'buildmaster-construction');
        f2.scale = cstScale;
        f2.maxScale = cstScale;
        agents.push(
            makeAgent({
                id: 'buildmaster-group',
                name: 'BuildMaster Group',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: 'buildmaster-storage',
                    name: 'BuildMaster Storage',
                }),
            }),
        );
    }

    {
        const admScale = Math.round(TARGETS.administrativeCenter.totalScale * 0.06);
        const logScale = Math.round(TARGETS.logisticsHub.totalScale * 0.06);
        const f1 = administrativeCenter(PROC_PLANET_ID, 'infragroup-admin');
        f1.scale = admScale;
        f1.maxScale = admScale;
        const f2 = logisticsHub(PROC_PLANET_ID, 'infragroup-logistics');
        f2.scale = logScale;
        f2.maxScale = logScale;
        agents.push(
            makeAgent({
                id: 'infragroup-global',
                name: 'InfraGroup Global',
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [f1, f2],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: 'infragroup-storage',
                    name: 'InfraGroup Storage',
                }),
            }),
        );
    }

    const educationSpecs = [
        { id: 'edu-network-corp', name: 'Edu Network Corp' },
        { id: 'knowledge-global', name: 'Knowledge Global Ltd' },
        { id: 'campus-systems-inc', name: 'Campus Systems Inc' },
        { id: 'scholars-union', name: 'Scholars Union' },
    ];
    for (const spec of educationSpecs) {
        const u = educationCenter(PROC_PLANET_ID, `${spec.id}-university`);
        u.scale = 4000;
        u.maxScale = 4000;
        agents.push(
            makeAgent({
                id: spec.id,
                name: spec.name,
                associatedPlanetId: PROC_PLANET_ID,
                planetId: PROC_PLANET_ID,
                facilities: [u],
                storage: makeStorage({
                    planetId: PROC_PLANET_ID,
                    id: `${spec.id}-storage`,
                    name: `${spec.name} Storage`,
                }),
            }),
        );
    }

    const poolConfigs: Array<{
        facilityType: string;
        total: number;
        type: ClaimPool['type'];
        prefix: string;
        renewable: boolean;
    }> = [
        {
            facilityType: 'coalMine',
            total: TOTAL_COAL,
            type: coalDepositResourceType,
            prefix: `${PROC_PLANET_ID}-coal`,
            renewable: renewableForResource('coalMine'),
        },
        {
            facilityType: 'oilWell',
            total: TOTAL_OIL,
            type: oilReservoirResourceType,
            prefix: `${PROC_PLANET_ID}-oil`,
            renewable: renewableForResource('oilWell'),
        },
        {
            facilityType: 'loggingCamp',
            total: TOTAL_FOREST,
            type: forestResourceType,
            prefix: `${PROC_PLANET_ID}-forest`,
            renewable: renewableForResource('loggingCamp'),
        },
        {
            facilityType: 'stoneQuarry',
            total: TOTAL_STONE,
            type: stoneDepositResourceType,
            prefix: `${PROC_PLANET_ID}-stone`,
            renewable: renewableForResource('stoneQuarry'),
        },
        {
            facilityType: 'copperMine',
            total: TOTAL_COPPER,
            type: copperDepositResourceType,
            prefix: `${PROC_PLANET_ID}-copper`,
            renewable: renewableForResource('copperMine'),
        },
        {
            facilityType: 'sandMine',
            total: TOTAL_SAND,
            type: sandDepositResourceType,
            prefix: `${PROC_PLANET_ID}-sand`,
            renewable: renewableForResource('sandMine'),
        },
        {
            facilityType: 'limestoneQuarry',
            total: TOTAL_LIMESTONE,
            type: limestoneDepositResourceType,
            prefix: `${PROC_PLANET_ID}-limestone`,
            renewable: renewableForResource('limestoneQuarry'),
        },
        {
            facilityType: 'clayMine',
            total: TOTAL_CLAY,
            type: clayDepositResourceType,
            prefix: `${PROC_PLANET_ID}-clay`,
            renewable: renewableForResource('clayMine'),
        },
        {
            facilityType: 'cottonFarm',
            total: TOTAL_ARABLE,
            type: arableLandResourceType,
            prefix: `${PROC_PLANET_ID}-arable`,
            renewable: renewableForResource('cottonFarm'),
        },
        {
            facilityType: 'waterExtractionFacility',
            total: TOTAL_WATER,
            type: waterSourceResourceType,
            prefix: `${PROC_PLANET_ID}-water`,
            renewable: renewableForResource('waterExtractionFacility'),
        },
        {
            facilityType: 'ironExtractionFacility',
            total: TOTAL_IRON_ORE,
            type: ironOreDepositResourceType,
            prefix: `${PROC_PLANET_ID}-iron`,
            renewable: renewableForResource('ironExtractionFacility'),
        },
    ];

    for (const cfg of poolConfigs) {
        if (!claimPools.has(cfg.facilityType)) {
            claimPools.set(cfg.facilityType, []);
        }
    }

    const utilWaterFac = waterExtractionFacility(PROC_PLANET_ID, 'proc-util-water');
    utilWaterFac.scale = 200;
    utilWaterFac.maxScale = 200;
    const utilAgriFac = intensiveFarmFacility(PROC_PLANET_ID, 'proc-util-agri');
    utilAgriFac.scale = 800;
    utilAgriFac.maxScale = 800;
    const utilAgent = makeAgent({
        id: 'proc-utilities',
        name: 'Public Utilities Corp',
        associatedPlanetId: PROC_PLANET_ID,
        planetId: PROC_PLANET_ID,
        facilities: [utilWaterFac, utilAgriFac],
        storage: makeStorage({ planetId: PROC_PLANET_ID, id: 'proc-util-storage', name: 'Public Utilities Storage' }),
        tenancies: [govArableId, govWaterId],
    });
    agents.push(utilAgent);

    const govAgent = makeAgent({
        id: GOV,
        name: 'Procedural Earth Government',
        associatedPlanetId: PROC_PLANET_ID,
        planetId: PROC_PLANET_ID,
        facilities: [],
        storage: makeStorage({ planetId: PROC_PLANET_ID, id: 'proc-gov-storage', name: 'Gov. Central Storage' }),
        claims: govClaims,
    });
    agents.unshift(govAgent);

    const getPoolClaims = (k: string): ResourceClaim[] => claimPools.get(k) ?? [];

    const planetBase = {
        id: PROC_PLANET_ID,
        name: 'Earth',
        position: { x: 10, y: 0, z: 0 },
        population: createPopulation(8_000_000_000, 2),
        governmentId: GOV,
        bank: {
            loans: 0,
            deposits: 0,
            householdDeposits: 0,
            equity: 0,
            loanRate: 0,
            depositRate: 0,
        },
        wagePerEdu: { none: 10.0, primary: 10.0, secondary: 10.0, tertiary: 10.0 },
        marketPrices: { ...initialMarketPrices },
        monthTransferVolume: 0,
        transportPipeline: {},
        orderBooks: {},
        lastMarketResult: {},
        avgMarketResult: {},
        monthPriceAcc: {},
        consumedResources: {},
        producedResources: {},
        productionCosts: {},
        lastProductionCostFloors: {},
        landBoundCostPerUnit: {},
        resources: {
            [arableLandResourceType.name]: {
                pool: makePool({
                    type: arableLandResourceType,
                    quantity: TOTAL_ARABLE,
                    renewable: renewableForResource('cottonFarm'),
                }),
                claims: getPoolClaims('cottonFarm'),
            },
            [waterSourceResourceType.name]: {
                pool: makePool({
                    type: waterSourceResourceType,
                    quantity: TOTAL_WATER,
                    renewable: renewableForResource('waterExtractionFacility'),
                }),
                claims: getPoolClaims('waterExtractionFacility'),
            },
            [ironOreDepositResourceType.name]: {
                pool: makePool({
                    type: ironOreDepositResourceType,
                    quantity: TOTAL_IRON_ORE,
                    renewable: renewableForResource('ironExtractionFacility'),
                }),
                claims: getPoolClaims('ironExtractionFacility'),
            },
            [coalDepositResourceType.name]: {
                pool: makePool({
                    type: coalDepositResourceType,
                    quantity: TOTAL_COAL,
                    renewable: renewableForResource('coalMine'),
                }),
                claims: getPoolClaims('coalMine'),
            },
            [oilReservoirResourceType.name]: {
                pool: makePool({
                    type: oilReservoirResourceType,
                    quantity: TOTAL_OIL,
                    renewable: renewableForResource('oilWell'),
                }),
                claims: getPoolClaims('oilWell'),
            },
            [forestResourceType.name]: {
                pool: makePool({
                    type: forestResourceType,
                    quantity: TOTAL_FOREST,
                    renewable: renewableForResource('loggingCamp'),
                }),
                claims: getPoolClaims('loggingCamp'),
            },
            [copperDepositResourceType.name]: {
                pool: makePool({
                    type: copperDepositResourceType,
                    quantity: TOTAL_COPPER,
                    renewable: renewableForResource('copperMine'),
                }),
                claims: getPoolClaims('copperMine'),
            },
            [sandDepositResourceType.name]: {
                pool: makePool({
                    type: sandDepositResourceType,
                    quantity: TOTAL_SAND,
                    renewable: renewableForResource('sandMine'),
                }),
                claims: getPoolClaims('sandMine'),
            },
            [limestoneDepositResourceType.name]: {
                pool: makePool({
                    type: limestoneDepositResourceType,
                    quantity: TOTAL_LIMESTONE,
                    renewable: renewableForResource('limestoneQuarry'),
                }),
                claims: getPoolClaims('limestoneQuarry'),
            },
            [clayDepositResourceType.name]: {
                pool: makePool({
                    type: clayDepositResourceType,
                    quantity: TOTAL_CLAY,
                    renewable: renewableForResource('clayMine'),
                }),
                claims: getPoolClaims('clayMine'),
            },
            [stoneDepositResourceType.name]: {
                pool: makePool({
                    type: stoneDepositResourceType,
                    quantity: TOTAL_STONE,
                    renewable: renewableForResource('stoneQuarry'),
                }),
                claims: getPoolClaims('stoneQuarry'),
            },
        },
        infrastructure: {
            primarySchools: 10_000,
            secondarySchools: 5_000,
            universities: 2_000,
            hospitals: 3_000,
            mobility: { roads: 100_000, railways: 50_000, airports: 1_000, seaports: 500, spaceports: 10 },
            energy: { production: 1_000_000 },
        },
        environment: makeDefaultEnvironment({
            air: 5,
            water: 2,
            soil: 1,
            airRegen: 1,
            waterRegen: 1,
            soilRegen: 0.1,
            earthquakes: 10,
            floods: 20,
            storms: 30,
        }),
    };

    const extractionRatePerScale: Record<string, number> = {
        coalMine: 0.5,
        oilWell: 0.3,
        copperMine: 0.4,
        ironExtractionFacility: 0.4,
    };

    const resourceSummary: Array<{
        resource: string;
        totalDeposit: number;
        assignedToAgents: number;
        unassigned: number;
        renewable: boolean;
        depletionYears: number | null;
    }> = poolConfigs.map((cfg) => {
        const pool = claimPools.get(cfg.facilityType) ?? [];

        const assigned = pool.filter((c) => c.tenantAgentId !== GOV).reduce((s, c) => s + c.quantity, 0);
        const unclaimedQty = 0; // no more unclaimed entries in the claims array

        const rate = extractionRatePerScale[cfg.facilityType] ?? null;

        let depletionYears: number | null = null;
        if (rate !== null && assigned > 0 && !renewableForResource(cfg.facilityType)) {
            const dpScale = depositPerScale(cfg.facilityType);
            depletionYears = Math.round(dpScale / rate / TICKS_PER_YEAR);
        }

        return {
            resource: cfg.type.name,
            totalDeposit: cfg.total,
            assignedToAgents: assigned,
            unassigned: unclaimedQty,
            renewable: renewableForResource(cfg.facilityType),
            depletionYears,
        };
    });

    console.log('\n=== Procedural World Summary ===');
    console.log(`Agents: ${agents.length}`);
    console.log('\nResource Deposits:');
    console.log(
        `${'Resource'.padEnd(28)} ${'Total Deposit'.padStart(20)} ${'Assigned'.padStart(16)} ${'Unassigned'.padStart(16)} ${'Renewable'.padStart(10)} ${'Depletion (yrs)'.padStart(16)}`,
    );
    console.log('-'.repeat(110));
    for (const r of resourceSummary) {
        const depletion = r.depletionYears !== null ? r.depletionYears.toLocaleString() : 'renewable';
        console.log(
            `${r.resource.padEnd(28)} ${r.totalDeposit.toLocaleString().padStart(20)} ${r.assignedToAgents.toLocaleString().padStart(16)} ${r.unassigned.toLocaleString().padStart(16)} ${(r.renewable ? 'yes' : 'no').padStart(10)} ${depletion.padStart(16)}`,
        );
    }
    console.log('=================================\n');

    return { planet: { ...planetBase, recycler: createRecyclerAgent(planetBase.id, planetBase.name) }, agents };
}
