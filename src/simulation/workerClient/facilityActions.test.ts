import { describe, expect, it, vi } from 'vitest';
import { makeWorld } from '../utils/testHelper';
import type { OutboundMessage } from './messages';
import {
    handleBuildFacility,
    handleCancelConstruction,
    handleContractFacility,
    handleExpandFacility,
    handleSetFacilityScale,
} from './facilityActions';
import type { ManagementFacility, ProductionFacility, ShipConstructionFacility } from '../planet/facility';
import { MINIMUM_CONSTRUCTION_TIME_IN_TICKS } from '../planet/facility';
import { HR_DEPARTMENT_NAME, humanResourcesOfficeFacilityType } from '../planet/specialFacilities';

function makeMessages() {
    const messages: OutboundMessage[] = [];
    const post = vi.fn((msg: OutboundMessage) => messages.push(msg));
    return { messages, post };
}

function setupWorld() {
    const world = makeWorld({ companyIds: ['company-1'] });
    const { gameState, planet, agents } = world;
    const company = agents.find((a) => a.id === 'company-1')!;
    return { gameState, planet, company };
}

function makeNewFacility(planetId: string, id = 'fac-1'): ProductionFacility {
    return {
        id,
        name: 'Iron Mine',
        type: 'production',
        scale: 0,
        maxScale: 0,
        needs: [],
        produces: [],
        workerRequirement: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        construction: {
            type: 'new',
            progress: 0,
            constructionTargetMaxScale: 1,
            totalConstructionServiceRequired: MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
            maximumConstructionServiceConsumption: 1,
            lastTickInvestedConstructionServices: 0,
        },
        planetId,
        lastTickResults: {
            overallEfficiency: 0,
            resourceEfficiency: {},
            workerEfficiency: {},
            costBalance: 0,
        },
    } as unknown as ProductionFacility;
}

function makeManagementFacility(planetId: string, id = 'mgmt-1'): ManagementFacility {
    return {
        ...humanResourcesOfficeFacilityType(planetId, id),
        id,
        scale: 0,
        maxScale: 0,
        construction: null,
    };
}

describe('handleBuildFacility — HR Department', () => {
    it('builds a Human Resources Office into humanResourcesDepartment', () => {
        const { gameState, planet, company } = setupWorld();
        const { messages, post } = makeMessages();

        handleBuildFacility(
            gameState,
            {
                type: 'buildFacility',
                requestId: 'r20',
                agentId: company.id,
                planetId: planet.id,
                facilityKey: HR_DEPARTMENT_NAME,
                targetScale: 1,
            },
            post,
        );

        expect(messages[0]).toMatchObject({
            type: 'facilityBuilt',
            agentId: company.id,
        });
        expect(company.assets[planet.id].humanResourcesDepartment).not.toBeNull();
        const f = company.assets[planet.id].humanResourcesDepartment!;
        expect(f.name).toBe(HR_DEPARTMENT_NAME);
        expect(f.construction).not.toBeNull();
        expect(f.construction!.type).toBe('new');
    });

    it('fails when humanResourcesDepartment already exists', () => {
        const { gameState, planet, company } = setupWorld();
        const facility = makeManagementFacility(planet.id, 'mgmt-existing');
        company.assets[planet.id].humanResourcesDepartment = facility;
        const { messages, post } = makeMessages();

        handleBuildFacility(
            gameState,
            {
                type: 'buildFacility',
                requestId: 'r21',
                agentId: company.id,
                planetId: planet.id,
                facilityKey: HR_DEPARTMENT_NAME,
                targetScale: 1,
            },
            post,
        );

        expect(messages[0]).toMatchObject({
            type: 'facilityBuildFailed',
            reason: expect.stringContaining('already exists'),
        });
    });
});

describe('handleExpandFacility — humanResourcesDepartment', () => {
    it('expands the human resources department', () => {
        const { gameState, planet, company } = setupWorld();
        const facility: ManagementFacility = {
            ...makeManagementFacility(planet.id, 'mgmt-expand'),
            scale: 1,
            maxScale: 1,
        };
        company.assets[planet.id].humanResourcesDepartment = facility;
        const { messages, post } = makeMessages();

        handleExpandFacility(
            gameState,
            {
                type: 'expandFacility',
                requestId: 'r22',
                agentId: company.id,
                planetId: planet.id,
                facilityId: 'mgmt-expand',
                targetScale: 2,
            },
            post,
        );

        expect(messages[0]).toMatchObject({
            type: 'facilityExpanded',
            facilityId: 'mgmt-expand',
        });
        expect(facility.construction).not.toBeNull();
        expect(facility.construction!.type).toBe('expansion');
    });
});

describe('handleSetFacilityScale — humanResourcesDepartment', () => {
    it('sets operating scale on the human resources department', () => {
        const { gameState, planet, company } = setupWorld();
        const facility: ManagementFacility = {
            ...makeManagementFacility(planet.id, 'mgmt-scale'),
            scale: 0.5,
            maxScale: 1,
        };
        company.assets[planet.id].humanResourcesDepartment = facility;
        const { messages, post } = makeMessages();

        handleSetFacilityScale(
            gameState,
            {
                type: 'setFacilityScale',
                requestId: 'r23',
                agentId: company.id,
                planetId: planet.id,
                facilityId: 'mgmt-scale',
                scaleFraction: 0.75,
            },
            post,
        );

        expect(messages[0]).toMatchObject({
            type: 'facilityScaleSet',
            facilityId: 'mgmt-scale',
        });
        expect(facility.scale).toBeCloseTo(0.75);
    });
});

describe('handleContractFacility — humanResourcesDepartment', () => {
    function setCSMarketResult(gameState: import('../planet/planet').GameState): void {
        const planet = gameState.planets.values().next().value!;
        planet.avgMarketResult.Construction = {
            resourceName: 'Construction',
            clearingPrice: 10,
            totalVolume: 100,
            totalSupply: 100,
            totalDemand: 100,
            unsoldSupply: 0,
            unfilledDemand: 35,
        };
    }

    it('contracts the human resources department to a lower scale', () => {
        const { gameState, planet, company } = setupWorld();
        const facility: ManagementFacility = {
            ...makeManagementFacility(planet.id, 'mgmt-contract'),
            scale: 0.5,
            maxScale: 1,
        };
        company.assets[planet.id].humanResourcesDepartment = facility;
        setCSMarketResult(gameState);
        const { messages, post } = makeMessages();

        handleContractFacility(
            gameState,
            {
                type: 'contractFacility',
                requestId: 'r24',
                agentId: company.id,
                planetId: planet.id,
                facilityId: 'mgmt-contract',
                targetScale: 0,
            },
            post,
        );

        expect(messages[0]).toMatchObject({
            type: 'facilityContracted',
            facilityId: 'mgmt-contract',
        });
        expect(company.assets[planet.id].humanResourcesDepartment).toBeNull();
    });

    it('fails without mutating the facility when the recycler declines', () => {
        const { gameState, planet, company } = setupWorld();
        const facility: ManagementFacility = {
            ...makeManagementFacility(planet.id, 'mgmt-declined'),
            scale: 0.5,
            maxScale: 1,
        };
        company.assets[planet.id].humanResourcesDepartment = facility;
        const { messages, post } = makeMessages();

        handleContractFacility(
            gameState,
            {
                type: 'contractFacility',
                requestId: 'r25',
                agentId: company.id,
                planetId: planet.id,
                facilityId: 'mgmt-declined',
                targetScale: 0,
            },
            post,
        );

        expect(messages[0]).toMatchObject({
            type: 'facilityContractFailed',
            reason: 'Recycler declined the contraction',
        });
        expect(company.assets[planet.id].humanResourcesDepartment).toBe(facility);
    });
});

function makeExpansionFacility(planetId: string, id = 'fac-2'): ProductionFacility {
    return {
        ...makeNewFacility(planetId, id),
        scale: 1,
        maxScale: 1,
        construction: {
            type: 'expansion',
            progress: 0,
            constructionTargetMaxScale: 2,
            totalConstructionServiceRequired: MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
            maximumConstructionServiceConsumption: 1,
            lastTickInvestedConstructionServices: 0,
        },
    } as unknown as ProductionFacility;
}

describe('handleCancelConstruction — new facility', () => {
    it('removes the facility entirely from productionFacilities', () => {
        const { gameState, planet, company } = setupWorld();
        const facility = makeNewFacility(planet.id, 'fac-new');
        company.assets[planet.id].productionFacilities.push(facility);
        const { messages, post } = makeMessages();

        handleCancelConstruction(
            gameState,
            {
                type: 'cancelConstruction',
                requestId: 'r1',
                agentId: company.id,
                planetId: planet.id,
                facilityId: 'fac-new',
            },
            post,
        );

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
            type: 'constructionCancelled',
            agentId: company.id,
            facilityId: 'fac-new',
        });
        expect(company.assets[planet.id].productionFacilities).toHaveLength(0);
    });
});

describe('handleCancelConstruction — expansion', () => {
    it('clears construction field but keeps the facility', () => {
        const { gameState, planet, company } = setupWorld();
        const facility = makeExpansionFacility(planet.id, 'fac-exp');
        company.assets[planet.id].productionFacilities.push(facility);
        const { messages, post } = makeMessages();

        handleCancelConstruction(
            gameState,
            {
                type: 'cancelConstruction',
                requestId: 'r2',
                agentId: company.id,
                planetId: planet.id,
                facilityId: 'fac-exp',
            },
            post,
        );

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({ type: 'constructionCancelled', facilityId: 'fac-exp' });
        expect(company.assets[planet.id].productionFacilities).toHaveLength(1);
        expect(company.assets[planet.id].productionFacilities[0].construction).toBeNull();
    });
});

describe('handleCancelConstruction — error cases', () => {
    it('fails when agent not found', () => {
        const { gameState, planet } = setupWorld();
        const { messages, post } = makeMessages();

        handleCancelConstruction(
            gameState,
            {
                type: 'cancelConstruction',
                requestId: 'r3',
                agentId: 'unknown-agent',
                planetId: planet.id,
                facilityId: 'fac-1',
            },
            post,
        );

        expect(messages[0]).toMatchObject({ type: 'constructionCancelFailed', reason: 'Agent not found' });
    });

    it('fails when facility not found', () => {
        const { gameState, planet, company } = setupWorld();
        const { messages, post } = makeMessages();

        handleCancelConstruction(
            gameState,
            {
                type: 'cancelConstruction',
                requestId: 'r4',
                agentId: company.id,
                planetId: planet.id,
                facilityId: 'no-such-fac',
            },
            post,
        );

        expect(messages[0]).toMatchObject({
            type: 'constructionCancelFailed',
            reason: expect.stringContaining('not found'),
        });
    });

    it('fails when facility is not under construction', () => {
        const { gameState, planet, company } = setupWorld();
        const facility = {
            ...makeNewFacility(planet.id, 'fac-idle'),
            construction: null,
        } as unknown as ProductionFacility;
        company.assets[planet.id].productionFacilities.push(facility);
        const { messages, post } = makeMessages();

        handleCancelConstruction(
            gameState,
            {
                type: 'cancelConstruction',
                requestId: 'r5',
                agentId: company.id,
                planetId: planet.id,
                facilityId: 'fac-idle',
            },
            post,
        );

        expect(messages[0]).toMatchObject({
            type: 'constructionCancelFailed',
            reason: 'Facility is not under construction',
        });
    });
});

function makeNewShipyard(planetId: string, id = 'sy-1'): ShipConstructionFacility {
    return {
        id,
        name: 'Shipyard',
        type: 'ship_construction',
        scale: 1,
        maxScale: 0,
        planetId,
        powerConsumptionPerTick: 0,
        workerRequirement: { none: 0, primary: 0, secondary: 0, tertiary: 0 },
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        shipName: '',
        produces: null,
        progress: 0,
        construction: {
            type: 'new',
            progress: 0,
            constructionTargetMaxScale: 1,
            totalConstructionServiceRequired: MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
            maximumConstructionServiceConsumption: 1,
            lastTickInvestedConstructionServices: 0,
        },
        lastTickResults: {
            overallEfficiency: 0,
            resourceEfficiency: {},
            workerEfficiency: {},
            overqualifiedWorkers: {},
            exactUsedByEdu: {},
            totalUsedByEdu: {},
            lastConsumed: {},
            costBalance: 0,
        },
    } as unknown as ShipConstructionFacility;
}

describe('handleCancelConstruction — new shipyard', () => {
    it('removes the shipyard from shipConstructionFacilities', () => {
        const { gameState, planet, company } = setupWorld();
        const shipyard = makeNewShipyard(planet.id, 'sy-new');
        company.assets[planet.id].shipConstructionFacilities.push(shipyard);
        const { messages, post } = makeMessages();

        handleCancelConstruction(
            gameState,
            {
                type: 'cancelConstruction',
                requestId: 'r10',
                agentId: company.id,
                planetId: planet.id,
                facilityId: 'sy-new',
            },
            post,
        );

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
            type: 'constructionCancelled',
            agentId: company.id,
            facilityId: 'sy-new',
        });
        expect(company.assets[planet.id].shipConstructionFacilities).toHaveLength(0);
    });
});

describe('handleCancelConstruction — shipyard expansion', () => {
    it('clears construction field but keeps the shipyard', () => {
        const { gameState, planet, company } = setupWorld();
        const shipyard: ShipConstructionFacility = {
            ...makeNewShipyard(planet.id, 'sy-exp'),
            maxScale: 1,
            construction: {
                type: 'expansion',
                progress: 0,
                constructionTargetMaxScale: 2,
                totalConstructionServiceRequired: MINIMUM_CONSTRUCTION_TIME_IN_TICKS,
                maximumConstructionServiceConsumption: 1,
                lastTickInvestedConstructionServices: 0,
            },
        } as unknown as ShipConstructionFacility;
        company.assets[planet.id].shipConstructionFacilities.push(shipyard);
        const { messages, post } = makeMessages();

        handleCancelConstruction(
            gameState,
            {
                type: 'cancelConstruction',
                requestId: 'r11',
                agentId: company.id,
                planetId: planet.id,
                facilityId: 'sy-exp',
            },
            post,
        );

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({ type: 'constructionCancelled', facilityId: 'sy-exp' });
        expect(company.assets[planet.id].shipConstructionFacilities).toHaveLength(1);
        expect(company.assets[planet.id].shipConstructionFacilities[0].construction).toBeNull();
    });
});

describe('handleCancelConstruction — shipyard not under construction', () => {
    it('fails when shipyard has no active construction', () => {
        const { gameState, planet, company } = setupWorld();
        const shipyard: ShipConstructionFacility = {
            ...makeNewShipyard(planet.id, 'sy-idle'),
            construction: null,
        } as unknown as ShipConstructionFacility;
        company.assets[planet.id].shipConstructionFacilities.push(shipyard);
        const { messages, post } = makeMessages();

        handleCancelConstruction(
            gameState,
            {
                type: 'cancelConstruction',
                requestId: 'r12',
                agentId: company.id,
                planetId: planet.id,
                facilityId: 'sy-idle',
            },
            post,
        );

        expect(messages[0]).toMatchObject({
            type: 'constructionCancelFailed',
            reason: 'Facility is not under construction',
        });
    });
});
