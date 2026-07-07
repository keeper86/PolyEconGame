import { describe, it, expect, beforeEach } from 'vitest';

import type { Resource, ResourceEntry } from './claims';
import { queryClaimedResource, extractFromClaimedResource } from './claims';
import type { Planet, Agent } from './planet';
import { arableLandResourceType, waterSourceResourceType } from './landBoundResources';
import { makeAgent } from '../utils/testHelper';
import { makePool } from '../initialUniverse/resourceClaimFactory';

function makePlanetWithResources(): Planet {
    const tenantA = makeAgent('tenant-a');
    const tenantB = makeAgent('tenant-b');
    const gov = makeAgent('gov');

    return {
        id: 'p',
        name: 'P',
        position: { x: 0, y: 0, z: 0 },
        population: { demography: [] },
        governmentId: gov.id,
        resources: {
            [arableLandResourceType.name]: {
                pool: makePool({ type: arableLandResourceType, quantity: 0 }),
                claims: [
                    {
                        id: 'r1',
                        resource: arableLandResourceType,
                        quantity: 100,
                        regenerationRate: 0,
                        maximumCapacity: 100,
                        tenantAgentId: tenantA.id,
                        tenantCostInCoins: 0,
                        costPerTick: 0,
                        claimStatus: 'active',
                        noticePeriodEndsAtTick: null,
                        pausedTicksThisYear: 0,
                    },
                    {
                        id: 'r2',
                        resource: arableLandResourceType,
                        quantity: 50,
                        regenerationRate: 0,
                        maximumCapacity: 50,
                        tenantAgentId: tenantA.id,
                        tenantCostInCoins: 0,
                        costPerTick: 0,
                        claimStatus: 'active',
                        noticePeriodEndsAtTick: null,
                        pausedTicksThisYear: 0,
                    },
                    {
                        id: 'r3',
                        resource: arableLandResourceType,
                        quantity: 200,
                        regenerationRate: 0,
                        maximumCapacity: 200,
                        tenantAgentId: tenantB.id,
                        tenantCostInCoins: 0,
                        costPerTick: 0,
                        claimStatus: 'active',
                        noticePeriodEndsAtTick: null,
                        pausedTicksThisYear: 0,
                    },
                ],
            },
            [waterSourceResourceType.name]: {
                pool: makePool({ type: waterSourceResourceType, quantity: 10 }),
                claims: [],
            },
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
        const extracted = extractFromClaimedResource(planet, tenantA, arableLandResourceType as Resource, 120);
        expect(extracted).toBe(120);

        const remaining = queryClaimedResource(planet, tenantA, arableLandResourceType as Resource);
        expect(remaining).toBe(30);

        const entry = planet.resources[arableLandResourceType.name] as ResourceEntry;
        const r1 = entry.claims.find((e) => e.id === 'r1');
        const r2 = entry.claims.find((e) => e.id === 'r2');
        expect(r1!.quantity).toBe(0);
        expect(r2!.quantity).toBe(30);
    });

    it('extractFromClaimedResource extracts all available if requested exceeds available', () => {
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
