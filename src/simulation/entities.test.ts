import { describe, it, expect, beforeEach } from 'vitest';

import { queryClaimedResource, extractFromClaimedResource } from './entities';
import type { Planet, Agent } from './planet';
import type { Resource } from './facilities';
import { arableLandResourceType, waterSourceResourceType } from './facilities';

function makeAgent(id: string): Agent {
    return {
        id,
        name: `agent-${id}`,
        associatedPlanetId: 'p',
        wealth: 0,
        transportShips: [],
        assets: {},
    } as Agent;
}

function makePlanetWithResources(): Planet {
    const tenantA = makeAgent('tenant-a');
    const tenantB = makeAgent('tenant-b');
    const gov = makeAgent('gov');

    return {
        id: 'p',
        name: 'P',
        position: { x: 0, y: 0, z: 0 },
        population: { demography: [] },
        government: gov,
        resources: {
            [arableLandResourceType.name]: [
                {
                    id: 'r1',
                    type: arableLandResourceType,
                    quantity: 100,
                    regenerationRate: 0,
                    maximumCapacity: 100,
                    claim: gov,
                    tenant: tenantA,
                    tenantCostInCoins: 0,
                },
                {
                    id: 'r2',
                    type: arableLandResourceType,
                    quantity: 50,
                    regenerationRate: 0,
                    maximumCapacity: 50,
                    claim: gov,
                    tenant: tenantA,
                    tenantCostInCoins: 0,
                },
                {
                    id: 'r3',
                    type: arableLandResourceType,
                    quantity: 200,
                    regenerationRate: 0,
                    maximumCapacity: 200,
                    claim: gov,
                    tenant: tenantB,
                    tenantCostInCoins: 0,
                },
            ],
            [waterSourceResourceType.name]: [
                {
                    id: 'w1',
                    type: waterSourceResourceType,
                    quantity: 10,
                    regenerationRate: 0,
                    maximumCapacity: 10,
                    claim: gov,
                    tenant: null,
                    tenantCostInCoins: 0,
                },
            ],
        },
        infrastructure: {
            primarySchools: 0,
            secondarySchools: 0,
            universities: 0,
            hospitals: 0,
            mobility: { roads: 0, railways: 0, airports: 0, seaports: 0, spaceports: 0 },
            energy: { production: 0 },
        },
        environment: {
            naturalDisasters: { earthquakes: 0, floods: 0, storms: 0 },
            pollution: { air: 0, water: 0, soil: 0 },
            regenerationRates: { air: 0, water: 0, soil: 0 },
        },
    } as unknown as Planet;
}

describe('claimed resource helpers', () => {
    let planet: Planet;
    let tenantA: Agent;
    let tenantB: Agent;

    beforeEach(() => {
        planet = makePlanetWithResources();
        tenantA = { id: 'tenant-a' } as Agent;
        tenantB = { id: 'tenant-b' } as Agent;
    });

    it('queryClaimedResource returns sum of quantities for agent tenant', () => {
        const total = queryClaimedResource(planet, tenantA, arableLandResourceType as Resource);
        expect(total).toBe(150);
    });

    it('queryClaimedResource returns 0 if agent is not tenant', () => {
        const nonTenant = { id: 'nobody' } as Agent;
        const total = queryClaimedResource(planet, nonTenant, arableLandResourceType as Resource);
        expect(total).toBe(0);
    });

    it('extractFromClaimedResource extracts up to requested quantity and reduces quantities on entries', () => {
        // tenantA has r1=100 and r2=50 -> total 150
        const extracted = extractFromClaimedResource(planet, tenantA, arableLandResourceType as Resource, 120);
        expect(extracted).toBe(120);

        // remaining should be 30 (100+50-120)
        const remaining = queryClaimedResource(planet, tenantA, arableLandResourceType as Resource);
        expect(remaining).toBe(30);

        // check that entries were reduced in order: r1 first (becomes 0), r2 becomes 30
        const entries = planet.resources[arableLandResourceType.name];
        const r1 = entries.find((e) => e.id === 'r1');
        const r2 = entries.find((e) => e.id === 'r2');
        expect(r1!.quantity).toBe(0);
        expect(r2!.quantity).toBe(30);
    });

    it('extractFromClaimedResource extracts all available if requested exceeds available', () => {
        // tenantB has r3=200
        const extracted = extractFromClaimedResource(planet, tenantB, arableLandResourceType as Resource, 300);
        expect(extracted).toBe(200);

        const remaining = queryClaimedResource(planet, tenantB, arableLandResourceType as Resource);
        expect(remaining).toBe(0);
    });

    it('extractFromClaimedResource when agent is not tenant returns 0 and makes no changes', () => {
        const nonTenant = { id: 'nobody' } as Agent;
        const before = JSON.parse(JSON.stringify(planet.resources));
        const extracted = extractFromClaimedResource(planet, nonTenant, arableLandResourceType as Resource, 10);
        expect(extracted).toBe(0);
        expect(planet.resources).toEqual(before);
    });
});
