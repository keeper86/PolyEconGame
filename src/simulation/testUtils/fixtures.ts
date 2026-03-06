/**
 * simulation/testUtils/fixtures.ts
 *
 * Centralized test fixtures for the simulation module.
 * Re-exports helpers from population/testFixtures and workforce/testHelpers
 * so test files can import everything from a single location.
 */

export {
    createStorageFacility,
    createPopulation,
    createPlanetWithStorage,
    createGovAgent,
    agentsMap,
} from '../population/testFixtures';

export {
    makeStorageFacility,
    makeAgent,
    makeGovernmentAgent,
    makePlanet,
    makeFacility,
    totalPopulation,
    sumPopOcc,
    sumWorkforceForEdu,
    assertWorkforcePopulationConsistency,
    assertTotalPopulationConserved,
    assertAllNonNegative,
    agentMap,
    planetMap,
} from '../workforce/testHelpers';
