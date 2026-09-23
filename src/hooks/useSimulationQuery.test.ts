import { describe, expect, it } from 'vitest';
import { shouldInvalidateOnTick } from './useSimulationQuery';

describe('shouldInvalidateOnTick', () => {
    it('invalidates simulation snapshot queries', () => {
        expect(shouldInvalidateOnTick([['simulation', 'getAgentPlanetDetail'], { input: {} }])).toBe(true);
    });

    it('invalidates ship queries now registered under simulation', () => {
        expect(shouldInvalidateOnTick([['simulation', 'listAgentShips'], { input: {} }])).toBe(true);
        expect(shouldInvalidateOnTick([['simulation', 'listShipListings'], { input: {} }])).toBe(true);
        expect(shouldInvalidateOnTick([['simulation', 'listTransportContracts'], { input: {} }])).toBe(true);
        expect(shouldInvalidateOnTick([['simulation', 'listShipBuyingOffers'], { input: {} }])).toBe(true);
    });

    it('never invalidates the heartbeat', () => {
        expect(shouldInvalidateOnTick([['simulation', 'getCurrentTick'], {}])).toBe(false);
    });

    it('leaves root-router procedures untouched', () => {
        expect(shouldInvalidateOnTick([['dispatchShip'], { input: {} }])).toBe(false);
        expect(shouldInvalidateOnTick([['getAgentPlanetStorage'], { input: {} }])).toBe(false);
    });

    it('handles flat query keys', () => {
        expect(shouldInvalidateOnTick(['simulation', 'listAgentShips'])).toBe(true);
        expect(shouldInvalidateOnTick(['listAgentShips'])).toBe(false);
    });
});
