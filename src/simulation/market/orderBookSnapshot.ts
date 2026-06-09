import type { Planet, ResourceOrderBook } from '../planet/planet';
import type { AgentBidOrder, AskOrder } from './marketTypes';

export function buildPlanetOrderBook(
    planet: Planet,
    askBooks: Map<string, AskOrder[]>,
    agentBidBooks: Map<string, AgentBidOrder[]>,
): void {
    const orderBooks: Record<string, ResourceOrderBook> = {};

    const allResources = new Set<string>([...askBooks.keys(), ...agentBidBooks.keys()]);

    for (const resourceName of allResources) {
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
