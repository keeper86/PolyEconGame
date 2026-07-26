import { createRecyclerAgent } from '../agents/recycler';
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
import { getNamesFor } from './preConfiguredCompanies';
import { makePool } from './resourceClaimFactory';

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

const flatTargetFactor = 4;
const TARGETS: Record<string, FacilityTarget> = {
    coalMine: { totalScale: 10_546, agentCount: flatTargetFactor * 2 },
    oilWell: { totalScale: 1_481_908, agentCount: flatTargetFactor * 16 },
    loggingCamp: { totalScale: 80_917, agentCount: flatTargetFactor * 4 },
    stoneQuarry: { totalScale: 80_000, agentCount: flatTargetFactor * 4 },
    copperMine: { totalScale: 53_516, agentCount: flatTargetFactor * 4 },
    sandMine: { totalScale: 330_922, agentCount: flatTargetFactor * 8 },
    limestoneQuarry: { totalScale: 145_818, agentCount: flatTargetFactor * 6 },
    clayMine: { totalScale: 24_000, agentCount: flatTargetFactor * 6 },
    cottonFarm: { totalScale: 308_157, agentCount: flatTargetFactor * 8 },
    waterExtractionFacility: { totalScale: 650_115, agentCount: flatTargetFactor * 16 },
    ironExtractionFacility: { totalScale: 31_191, agentCount: flatTargetFactor * 8 },
    ironSmelter: { totalScale: 64_843, agentCount: flatTargetFactor * 8 },
    copperSmelter: { totalScale: 145_386, agentCount: flatTargetFactor * 6 },
    oilRefinery: { totalScale: 1_672_862, agentCount: flatTargetFactor * 20 },
    sawmill: { totalScale: 280_333, agentCount: flatTargetFactor * 8 },
    cementPlant: { totalScale: 320_000, agentCount: flatTargetFactor * 8 },
    glassFactory: { totalScale: 180_275, agentCount: flatTargetFactor * 6 },
    pesticidePlant: { totalScale: 157_025, agentCount: flatTargetFactor * 6 },
    paperMill: { totalScale: 18_411, agentCount: flatTargetFactor * 6 },
    textileMill: { totalScale: 257_297, agentCount: flatTargetFactor * 8 },
    concretePlant: { totalScale: 200_000, agentCount: flatTargetFactor * 8 },
    foodProcessingPlant: { totalScale: 840_000, agentCount: flatTargetFactor * 8 },
    beveragePlant: { totalScale: 230_667, agentCount: flatTargetFactor * 6 },
    pharmaceuticalPlant: { totalScale: 277_778, agentCount: flatTargetFactor * 6 },
    clothingFactory: { totalScale: 220_889, agentCount: flatTargetFactor * 8 },
    furnitureFactory: { totalScale: 280_667, agentCount: flatTargetFactor * 8 },
    electronicComponentFactory: { totalScale: 370_964, agentCount: flatTargetFactor * 6 },
    consumerElectronicsFactory: { totalScale: 450_889, agentCount: flatTargetFactor * 8 },
    machineryFactory: { totalScale: 3_745, agentCount: flatTargetFactor * 4 },
    vehicleFactory: { totalScale: 11_392, agentCount: flatTargetFactor * 4 },
    intensiveFarmFacility: { totalScale: 500_074, agentCount: flatTargetFactor * 8 },
    packagingPlant: { totalScale: 35_111, agentCount: flatTargetFactor * 8 },
    administrativeCenter: { totalScale: 120_889, agentCount: flatTargetFactor * 8 },
    logisticsHub: { totalScale: 735_111, agentCount: flatTargetFactor * 8 },
    constructionService: { totalScale: 133_333, agentCount: flatTargetFactor * 8 },
    groceryChain: { totalScale: 2_533_333, agentCount: flatTargetFactor * 12 },
    retailChain: { totalScale: 277_778, agentCount: flatTargetFactor * 8 },
    hospital: { totalScale: 788_889, agentCount: flatTargetFactor * 8 },
    siliconWaferFactory: { totalScale: 242_982, agentCount: flatTargetFactor * 8 },
};

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

export function buildProceduralWorld(): { planet: Planet; agents: Agent[] } {
    const agents: Agent[] = [];

    for (const [facilityType, target] of Object.entries(TARGETS)) {
        const names = getNamesFor(facilityType, target.agentCount);
        const scales = splitScale(target.totalScale, names.length, facilityType);

        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const scale = scales[i];

            const facilities: ProductionFacility[] = [];

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
            }

            agents.push(
                makeAgent({
                    id,
                    name,
                    associatedPlanetId: PROC_PLANET_ID,
                    planetId: PROC_PLANET_ID,
                    facilities,
                    storage: makeStorage({ planetId: PROC_PLANET_ID, id: `${id}-storage`, name: `${name} Storage` }),
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
    });
    agents.push(utilAgent);

    const govAgent = makeAgent({
        id: GOV,
        name: 'Procedural Earth Government',
        associatedPlanetId: PROC_PLANET_ID,
        planetId: PROC_PLANET_ID,
        facilities: [],
        storage: makeStorage({ planetId: PROC_PLANET_ID, id: 'proc-gov-storage', name: 'Gov. Central Storage' }),
    });
    agents.unshift(govAgent);

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
                    renewable: true,
                }),
                claims: [],
            },
            [waterSourceResourceType.name]: {
                pool: makePool({
                    type: waterSourceResourceType,
                    quantity: TOTAL_WATER,
                    renewable: true,
                }),
                claims: [],
            },
            [ironOreDepositResourceType.name]: {
                pool: makePool({
                    type: ironOreDepositResourceType,
                    quantity: TOTAL_IRON_ORE,
                    renewable: false,
                }),
                claims: [],
            },
            [coalDepositResourceType.name]: {
                pool: makePool({
                    type: coalDepositResourceType,
                    quantity: TOTAL_COAL,
                    renewable: false,
                }),
                claims: [],
            },
            [oilReservoirResourceType.name]: {
                pool: makePool({
                    type: oilReservoirResourceType,
                    quantity: TOTAL_OIL,
                    renewable: false,
                }),
                claims: [],
            },
            [forestResourceType.name]: {
                pool: makePool({
                    type: forestResourceType,
                    quantity: TOTAL_FOREST,
                    renewable: true,
                }),
                claims: [],
            },
            [copperDepositResourceType.name]: {
                pool: makePool({
                    type: copperDepositResourceType,
                    quantity: TOTAL_COPPER,
                    renewable: false,
                }),
                claims: [],
            },
            [sandDepositResourceType.name]: {
                pool: makePool({
                    type: sandDepositResourceType,
                    quantity: TOTAL_SAND,
                    renewable: false,
                }),
                claims: [],
            },
            [limestoneDepositResourceType.name]: {
                pool: makePool({
                    type: limestoneDepositResourceType,
                    quantity: TOTAL_LIMESTONE,
                    renewable: false,
                }),
                claims: [],
            },
            [clayDepositResourceType.name]: {
                pool: makePool({
                    type: clayDepositResourceType,
                    quantity: TOTAL_CLAY,
                    renewable: false,
                }),
                claims: [],
            },
            [stoneDepositResourceType.name]: {
                pool: makePool({
                    type: stoneDepositResourceType,
                    quantity: TOTAL_STONE,
                    renewable: false,
                }),
                claims: [],
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

    return { planet: { ...planetBase, recycler: createRecyclerAgent(planetBase.id, planetBase.name) }, agents };
}
