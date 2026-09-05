import { describe, expect, it, vi } from 'vitest';
import { makeGameState, makeGovernmentAgent, makePlanet } from '../utils/testHelper';
import { LOGISTICS_DEPARTMENT_NAME } from '../planet/specialFacilities';
import { handleCreateAgent, handleAcknowledgeBankruptcy } from './agentActions';
import type { OutboundMessage } from './messages';

function makeMessages() {
    const messages: OutboundMessage[] = [];
    const post = vi.fn((msg: OutboundMessage) => messages.push(msg));
    return { messages, post };
}

describe('handleCreateAgent', () => {
    it('creates an agent with correct Logistics Department name', () => {
        const gov = makeGovernmentAgent('gov-1', 'p');
        const planet = makePlanet({ governmentId: gov.id });
        const state = makeGameState([planet], [gov]);

        const { messages, post } = makeMessages();

        handleCreateAgent(
            state,
            {
                type: 'createAgent',
                requestId: 'req-1',
                agentId: 'new-company',
                agentName: 'New Company',
                planetId: 'p',
                logo: 'test_logo',
            },
            post,
        );

        const agent = state.agents.get('new-company');
        expect(agent).toBeDefined();
        expect(agent!.name).toBe('New Company');
        expect(agent!.logo).toBe('test_logo');
        expect(agent!.automated).toBe(false);
        expect(agent!.automateWorkerAllocation).toBe(false);
        expect(agent!.foundedTick).toBe(0);
        expect(agent!.associatedPlanetId).toBe('p');

        const assets = agent!.assets.p;
        expect(assets).toBeDefined();
        expect(assets.storage).toBeDefined();
        expect(assets.storage.department).toBeDefined();

        expect(assets.storage.department!.name).toBe(LOGISTICS_DEPARTMENT_NAME);
        expect(assets.storage.department!.name).not.toBe('Test Management');

        expect(assets.licenses).toEqual({
            commercial: { acquiredTick: 0, frozen: false },
            workforce: { acquiredTick: 0, frozen: false },
        });

        expect(assets.wagePerEdu).toEqual({
            none: planet.wagePerEdu.none,
            primary: planet.wagePerEdu.primary,
            secondary: planet.wagePerEdu.secondary,
            tertiary: planet.wagePerEdu.tertiary,
        });

        expect(messages).toHaveLength(1);
        expect(messages[0].type).toBe('agentCreated');
        expect((messages[0] as Extract<OutboundMessage, { type: 'agentCreated' }>).agentId).toBe('new-company');
    });

    it('uses the planet wage rates for the new agent', () => {
        const gov = makeGovernmentAgent('gov-1', 'p');
        const planet = makePlanet({
            governmentId: gov.id,
            wagePerEdu: { none: 10, primary: 20, secondary: 30, tertiary: 40 },
        });
        const state = makeGameState([planet], [gov]);

        handleCreateAgent(
            state,
            {
                type: 'createAgent',
                requestId: 'req-1',
                agentId: 'new-company',
                agentName: 'New Company',
                planetId: 'p',
                logo: 'test_logo',
            },
            () => {},
        );

        const agent = state.agents.get('new-company');
        expect(agent!.assets.p.wagePerEdu).toEqual({
            none: 10,
            primary: 20,
            secondary: 30,
            tertiary: 40,
        });
    });
});

describe('handleAcknowledgeBankruptcy', () => {
    it('removes the matching bankruptcy record and posts an acknowledgment', () => {
        const gov = makeGovernmentAgent('gov-1', 'p');
        const planet = makePlanet({ governmentId: gov.id });
        const state = makeGameState([planet], [gov]);
        state.bankruptcies = [
            {
                agentId: 'gone-co',
                agentName: 'Gone Co',
                planetId: 'p',
                tick: 5,
                outcome: 'liquidated',
                message: 'Gone Co bankrupt; company dissolved',
            },
            {
                agentId: 'other-co',
                agentName: 'Other Co',
                planetId: 'p',
                tick: 6,
                outcome: 'restructured',
                message: 'Other Co bankrupt; restructured',
            },
        ];

        const { messages, post } = makeMessages();

        handleAcknowledgeBankruptcy(
            state,
            { type: 'acknowledgeBankruptcy', requestId: 'req-1', agentId: 'gone-co' },
            post,
        );

        expect(state.bankruptcies).toHaveLength(1);
        expect(state.bankruptcies[0].agentId).toBe('other-co');
        expect(messages).toContainEqual({
            type: 'bankruptcyAcknowledged',
            requestId: 'req-1',
            agentId: 'gone-co',
            processedAtTick: 0,
        });
    });

    it('fails when no record matches', () => {
        const gov = makeGovernmentAgent('gov-1', 'p');
        const planet = makePlanet({ governmentId: gov.id });
        const state = makeGameState([planet], [gov]);
        state.bankruptcies = [];

        const { messages, post } = makeMessages();

        handleAcknowledgeBankruptcy(
            state,
            { type: 'acknowledgeBankruptcy', requestId: 'req-1', agentId: 'gone-co' },
            post,
        );

        expect(messages).toContainEqual({
            type: 'bankruptcyAcknowledgeFailed',
            requestId: 'req-1',
            reason: 'No bankruptcy record found for agent',
            processedAtTick: 0,
        });
    });
});
