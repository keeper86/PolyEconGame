import { describe, expect, it } from 'vitest';
import { replacePlanetInPath } from './usePlanetId';

describe('replacePlanetInPath', () => {
    it('replaces planetId in /planets/[planetId] route', () => {
        expect(replacePlanetInPath('/planets/earth', 'gune')).toBe('/planets/gune');
    });

    it('preserves sub-segments under /planets/[planetId]', () => {
        expect(replacePlanetInPath('/planets/earth/demographics', 'gune')).toBe('/planets/gune/demographics');
    });

    it('preserves deep sub-segments', () => {
        expect(replacePlanetInPath('/planets/earth/market/iron-ore', 'pandara')).toBe(
            '/planets/pandara/market/iron-ore',
        );
    });

    it('replaces planetId in /agents/[agentId]/[planetId] route', () => {
        expect(replacePlanetInPath('/agents/agent-1/earth', 'gune')).toBe('/agents/agent-1/gune');
    });

    it('preserves sub-segments under /agents/[agentId]/[planetId]', () => {
        expect(replacePlanetInPath('/agents/agent-1/earth/workforce', 'paradies')).toBe(
            '/agents/agent-1/paradies/workforce',
        );
    });

    it('encodes special characters in new planetId', () => {
        expect(replacePlanetInPath('/planets/earth', 'alpha centauri')).toBe('/planets/alpha%20centauri');
    });

    it('falls back to /planets/[newPlanetId] for unrelated paths', () => {
        expect(replacePlanetInPath('/pong', 'gune')).toBe('/planets/gune');
    });

    it('falls back to /planets/[newPlanetId] for root path', () => {
        expect(replacePlanetInPath('/', 'suerte')).toBe('/planets/suerte');
    });
});
