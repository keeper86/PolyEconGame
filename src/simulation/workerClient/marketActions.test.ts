import { describe, it, expect, beforeEach } from 'vitest';
import type { GameState, AutomatedPricingConfig } from '../planet/planet';
import { ALL_RESOURCES } from '../planet/resourceCatalog';
import { makeAgent, makeGameState, makeStorageFacility } from '../utils/testHelper';
import { handleSetBuyBids, handleSetSellOffers } from './marketActions';
import type { OutboundMessage } from './messages';

const RESOURCE = 'Iron Ore';

function makeState(): GameState {
    const resource = ALL_RESOURCES.find((r) => r.name === RESOURCE)!;
    const storageFacility = makeStorageFacility({
        currentInStorage: {
            [RESOURCE]: { resource, quantity: 100 },
        },
        current: { volume: 100, mass: 100 },
    });
    const agent = makeAgent('agent-1', 'p', 'Agent 1', {
        assets: {
            p: {
                ...makeAgent('agent-1', 'p').assets.p,
                storageFacility,
            },
        },
    });
    return makeGameState([], [agent]);
}

function noop(_msg: OutboundMessage): void {
    // noop
}

describe('marketActions autoConfig merge', () => {
    let state: GameState;

    beforeEach(() => {
        state = makeState();
    });

    describe('handleSetBuyBids', () => {
        it('should merge volume-only autoConfig payloads with existing pricing keys', () => {
            const pricingConfig: AutomatedPricingConfig = {
                priceAdjustMaxUp: 1.1,
                priceAdjustMaxDown: 0.9,
                bidOfferMaxCostMultiplier: 2,
                targetFillRate: 0.8,
            };

            handleSetBuyBids(
                state,
                {
                    type: 'setBuyBids',
                    requestId: 'req-1',
                    agentId: 'agent-1',
                    planetId: 'p',
                    bids: {
                        [RESOURCE]: { autoConfig: pricingConfig },
                    },
                },
                noop,
            );

            const volumeConfig: AutomatedPricingConfig = {
                inputBufferTargetTicks: 30,
                inventorySmoothingMaxExtra: 5,
                freeBuyQuantity: 1000,
                freeBuyQuantitySmoothingMaxExtra: 10,
            };

            handleSetBuyBids(
                state,
                {
                    type: 'setBuyBids',
                    requestId: 'req-2',
                    agentId: 'agent-1',
                    planetId: 'p',
                    bids: {
                        [RESOURCE]: { autoConfig: volumeConfig },
                    },
                },
                noop,
            );

            const bid = state.agents.get('agent-1')!.assets.p.market!.buy[RESOURCE];
            expect(bid?.autoConfig).toEqual({
                ...pricingConfig,
                ...volumeConfig,
            });
        });

        it('should merge pricing-only autoConfig payloads with existing volume keys', () => {
            const volumeConfig: AutomatedPricingConfig = {
                inputBufferTargetTicks: 30,
                inventorySmoothingMaxExtra: 5,
                freeBuyQuantity: 1000,
                freeBuyQuantitySmoothingMaxExtra: 10,
            };

            handleSetBuyBids(
                state,
                {
                    type: 'setBuyBids',
                    requestId: 'req-1',
                    agentId: 'agent-1',
                    planetId: 'p',
                    bids: {
                        [RESOURCE]: { autoConfig: volumeConfig },
                    },
                },
                noop,
            );

            const pricingConfig: AutomatedPricingConfig = {
                priceAdjustMaxUp: 1.1,
                priceAdjustMaxDown: 0.9,
                bidOfferMaxCostMultiplier: 2,
                targetFillRate: 0.8,
            };

            handleSetBuyBids(
                state,
                {
                    type: 'setBuyBids',
                    requestId: 'req-2',
                    agentId: 'agent-1',
                    planetId: 'p',
                    bids: {
                        [RESOURCE]: { autoConfig: pricingConfig },
                    },
                },
                noop,
            );

            const bid = state.agents.get('agent-1')!.assets.p.market!.buy[RESOURCE];
            expect(bid?.autoConfig).toEqual({
                ...volumeConfig,
                ...pricingConfig,
            });
        });
    });

    describe('handleSetSellOffers', () => {
        it('should merge volume-only autoConfig payloads with existing pricing keys', () => {
            const pricingConfig: AutomatedPricingConfig = {
                priceAdjustMaxUp: 1.1,
                priceAdjustMaxDown: 0.9,
                automatedCostFloorBuffer: 2,
                targetSellThrough: 0.8,
            };

            handleSetSellOffers(
                state,
                {
                    type: 'setSellOffers',
                    requestId: 'req-1',
                    agentId: 'agent-1',
                    planetId: 'p',
                    offers: {
                        [RESOURCE]: { autoConfig: pricingConfig },
                    },
                },
                noop,
            );

            const volumeConfig: AutomatedPricingConfig = {
                freeRetainment: 100,
                freeRetainmentSmoothingMaxExtra: 10,
            };

            handleSetSellOffers(
                state,
                {
                    type: 'setSellOffers',
                    requestId: 'req-2',
                    agentId: 'agent-1',
                    planetId: 'p',
                    offers: {
                        [RESOURCE]: { autoConfig: volumeConfig },
                    },
                },
                noop,
            );

            const offer = state.agents.get('agent-1')!.assets.p.market!.sell[RESOURCE];
            expect(offer?.autoConfig).toEqual({
                ...pricingConfig,
                ...volumeConfig,
            });
        });

        it('should merge pricing-only autoConfig payloads with existing volume keys', () => {
            const volumeConfig: AutomatedPricingConfig = {
                freeRetainment: 100,
                freeRetainmentSmoothingMaxExtra: 10,
            };

            handleSetSellOffers(
                state,
                {
                    type: 'setSellOffers',
                    requestId: 'req-1',
                    agentId: 'agent-1',
                    planetId: 'p',
                    offers: {
                        [RESOURCE]: { autoConfig: volumeConfig },
                    },
                },
                noop,
            );

            const pricingConfig: AutomatedPricingConfig = {
                priceAdjustMaxUp: 1.1,
                priceAdjustMaxDown: 0.9,
                automatedCostFloorBuffer: 2,
                targetSellThrough: 0.8,
            };

            handleSetSellOffers(
                state,
                {
                    type: 'setSellOffers',
                    requestId: 'req-2',
                    agentId: 'agent-1',
                    planetId: 'p',
                    offers: {
                        [RESOURCE]: { autoConfig: pricingConfig },
                    },
                },
                noop,
            );

            const offer = state.agents.get('agent-1')!.assets.p.market!.sell[RESOURCE];
            expect(offer?.autoConfig).toEqual({
                ...volumeConfig,
                ...pricingConfig,
            });
        });
    });
});
