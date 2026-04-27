import type { GameState } from '../planet/planet';
import { clearUnifiedBids } from './orderBook';
import { collectForexAsks, collectForexBids, resetForexSellCounters } from './forexOrderCollection';
import { computeMarketSummary, settleForexTrades } from './settlement';
import { getCurrencyResourceName, DEFAULT_EXCHANGE_RATE } from './currencyResources';

export function forexTick(gameState: GameState): void {
    const planets = Array.from(gameState.planets.values());

    for (const tradingPlanet of planets) {
        for (const issuingPlanet of planets) {
            if (issuingPlanet.id === tradingPlanet.id) {
                continue;
            }
            clearForexPair(gameState, tradingPlanet.id, issuingPlanet.id);
        }
    }
}

function clearForexPair(gameState: GameState, tradingPlanetId: string, issuingPlanetId: string): void {
    const tradingPlanet = gameState.planets.get(tradingPlanetId)!;
    const curName = getCurrencyResourceName(issuingPlanetId);

    resetForexSellCounters(tradingPlanet, issuingPlanetId, gameState.agents);

    const askOrders = collectForexAsks(gameState.agents, tradingPlanet, issuingPlanetId);
    const agentBids = collectForexBids(gameState.agents, tradingPlanet, issuingPlanetId);

    const referencePrice = (tradingPlanet.marketPrices as Record<string, number>)[curName] ?? DEFAULT_EXCHANGE_RATE;

    if (askOrders.length === 0 && agentBids.length === 0) {
        tradingPlanet.lastMarketResult[curName] = {
            resourceName: curName,
            clearingPrice: referencePrice,
            totalVolume: 0,
            totalDemand: 0,
            totalSupply: 0,
            unfilledDemand: 0,
            unsoldSupply: 0,
        };
        return;
    }

    const totalSupply = askOrders.reduce((s, a) => s + a.quantity, 0);
    const totalDemand = agentBids.reduce((s, b) => s + b.quantity, 0);

    if (askOrders.length === 0 || agentBids.length === 0) {
        for (const ask of askOrders) {
            const issuingAssets = ask.agent.assets[issuingPlanetId];
            if (issuingAssets) {
                issuingAssets.depositHold = Math.max(0, issuingAssets.depositHold - ask.quantity);
            }
        }
        for (const bid of agentBids) {
            const localAssets = bid.agent.assets[tradingPlanetId];
            if (localAssets) {
                const holdReturned = bid.quantity * bid.bidPrice;
                localAssets.depositHold = Math.max(0, localAssets.depositHold - holdReturned);
                localAssets.deposits += holdReturned;
            }
        }
        tradingPlanet.lastMarketResult[curName] = {
            resourceName: curName,
            clearingPrice: referencePrice,
            totalVolume: 0,
            totalDemand,
            totalSupply,
            unfilledDemand: totalDemand,
            unsoldSupply: totalSupply,
        };
        return;
    }

    askOrders.sort((a, b) => a.askPrice - b.askPrice);

    const { agentTrades } = clearUnifiedBids([], agentBids, askOrders);

    settleForexTrades(askOrders, agentBids, tradingPlanet, issuingPlanetId);

    const { clearingPrice, totalVolume } = computeMarketSummary(agentTrades, referencePrice);

    if (totalVolume > 0) {
        (tradingPlanet.marketPrices as Record<string, number>)[curName] = clearingPrice;
    }

    const unsoldSupply = Math.max(0, totalSupply - totalVolume);

    tradingPlanet.lastMarketResult[curName] = {
        resourceName: curName,
        clearingPrice,
        totalVolume,
        totalDemand,
        totalSupply,
        unfilledDemand: Math.max(0, totalDemand - totalVolume),
        unsoldSupply,
    };

    // Update monthly EMA (reuse the same helper field used by physical markets)
    updateAvgForexResult(tradingPlanet, curName);
}

/**
 * Update the monthly EMA for forex results, mirroring the logic used for
 * physical-goods markets in market.ts / updateAvgMarketResult.
 */
function updateAvgForexResult(
    tradingPlanet: GameState['planets'] extends Map<string, infer P> ? P : never,
    curName: string,
): void {
    const latest = tradingPlanet.lastMarketResult[curName];
    if (!latest) {
        return;
    }
    const prior = tradingPlanet.avgMarketResult[curName];
    if (!prior) {
        tradingPlanet.avgMarketResult[curName] = { ...latest };
        return;
    }
    // EMA alpha = 1/30 (one month half-life)
    const alpha = 1 / 30;
    tradingPlanet.avgMarketResult[curName] = {
        resourceName: curName,
        clearingPrice: prior.clearingPrice * (1 - alpha) + latest.clearingPrice * alpha,
        totalVolume: prior.totalVolume * (1 - alpha) + latest.totalVolume * alpha,
        totalDemand: prior.totalDemand * (1 - alpha) + latest.totalDemand * alpha,
        totalSupply: prior.totalSupply * (1 - alpha) + latest.totalSupply * alpha,
        unfilledDemand: prior.unfilledDemand * (1 - alpha) + latest.unfilledDemand * alpha,
        unsoldSupply: prior.unsoldSupply * (1 - alpha) + latest.unsoldSupply * alpha,
    };
}
