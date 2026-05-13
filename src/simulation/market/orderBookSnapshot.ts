import type { Planet, ResourceOrderBook } from '../planet/planet';
import type { AgentBidOrder, AskOrder } from './marketTypes';

/**
 * Builds the per-resource order book snapshot for a planet from the current
 * tick's ask and bid collections (after market clearing). Each entry reflects
 * the *remaining* unfilled quantity so that callers can accurately assess
 * available depth.
 *
 * Call this once per tick, after settlement and hold-release are complete.
 * The result is written directly into planet.orderBooks.
 */
export function buildPlanetOrderBook(
    planet: Planet,
    askBooks: Map<string, AskOrder[]>,
    agentBidBooks: Map<string, AgentBidOrder[]>,
): void {
    const orderBooks: Record<string, ResourceOrderBook> = {};

    const allResources = new Set<string>([...askBooks.keys(), ...agentBidBooks.keys()]);

    for (const resourceName of allResources) {
        // --- Asks (sell side): aggregate remaining qty per price level, sort ascending ---
        const askMap = new Map<number, number>();
        for (const order of askBooks.get(resourceName) ?? []) {
            const remaining = order.quantity - order.filled;
            if (remaining <= 0) {
                continue;
            }
            askMap.set(order.askPrice, (askMap.get(order.askPrice) ?? 0) + remaining);
        }
        const asks = Array.from(askMap.entries())
            .map(([price, quantity]) => ({ price, quantity }))
            .sort((a, b) => a.price - b.price);

        // --- Bids (buy side): aggregate remaining qty per price level, sort descending ---
        const bidMap = new Map<number, number>();
        for (const order of agentBidBooks.get(resourceName) ?? []) {
            const remaining = order.quantity - order.filled;
            if (remaining <= 0) {
                continue;
            }
            bidMap.set(order.bidPrice, (bidMap.get(order.bidPrice) ?? 0) + remaining);
        }
        const bids = Array.from(bidMap.entries())
            .map(([price, quantity]) => ({ price, quantity }))
            .sort((a, b) => b.price - a.price);

        if (asks.length > 0 || bids.length > 0) {
            orderBooks[resourceName] = { asks, bids };
        }
    }

    planet.orderBooks = orderBooks;
}

/**
 * Returns the volume-weighted average price an agent would pay to buy
 * `quantity` units of `resourceName` on `planet` by walking the ask ladder
 * from cheapest to most expensive.
 *
 * Returns null if:
 * - quantity <= 0
 * - no order book snapshot exists for this planet/resource
 * - total ask depth is insufficient to fill the requested quantity
 */
export function getEffectiveBuyPrice(planet: Planet, resourceName: string, quantity: number): number | null {
    if (quantity <= 0) {
        return null;
    }
    const book = planet.orderBooks?.[resourceName];
    if (!book || book.asks.length === 0) {
        return null;
    }

    let remaining = quantity;
    let totalCost = 0;

    for (const level of book.asks) {
        if (remaining <= 0) {
            break;
        }
        const fill = Math.min(remaining, level.quantity);
        totalCost += fill * level.price;
        remaining -= fill;
    }

    if (remaining > 0) {
        // Insufficient depth to fill the full quantity
        return null;
    }

    return totalCost / quantity;
}

/**
 * Returns the volume-weighted average price an agent would receive for selling
 * `quantity` units of `resourceName` on `planet` by walking the bid ladder
 * from highest to lowest.
 *
 * Returns null if:
 * - quantity <= 0
 * - no order book snapshot exists for this planet/resource
 * - total bid depth is insufficient to absorb the requested quantity
 */
export function getEffectiveSellPrice(planet: Planet, resourceName: string, quantity: number): number | null {
    if (quantity <= 0) {
        return null;
    }
    const book = planet.orderBooks?.[resourceName];
    if (!book || book.bids.length === 0) {
        return null;
    }

    let remaining = quantity;
    let totalRevenue = 0;

    for (const level of book.bids) {
        if (remaining <= 0) {
            break;
        }
        const fill = Math.min(remaining, level.quantity);
        totalRevenue += fill * level.price;
        remaining -= fill;
    }

    if (remaining > 0) {
        // Insufficient depth to absorb the full quantity
        return null;
    }

    return totalRevenue / quantity;
}
