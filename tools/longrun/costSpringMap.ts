import { adjustOfferPrice, setCostFloorBuffer, setCostSpringStrength } from '../../src/simulation/market/automaticPricing';
import type { Resource } from '../../src/simulation/planet/claims';
import type { AgentMarketOfferState } from '../../src/simulation/planet/planet';

const resource = {
    name: 'MapGood',
    form: 'solid',
    level: 'refined',
    volumePerQuantity: 1,
    massPerQuantity: 1,
} as unknown as Resource;

const MAX_DOWN = 0.975;
const INVENTORY = 100;
const SIZE = 1;

function floorPrice(strength: number, buffer: number, sellFraction: number): number {
    setCostSpringStrength(strength);
    setCostFloorBuffer(buffer);
    const offer = {
        resource,
        offerPrice: 100,
        lastSold: sellFraction * INVENTORY,
        autoConfig: {
            targetSellThrough: 1,
            priceAdjustMaxDown: MAX_DOWN,
            priceAdjustMaxUp: 1.025,
            sellProductionSmoothing: 1,
            freeRetainmentSmoothingMaxExtra: 1,
            costSpringStrength: strength,
            automatedCostFloorBuffer: buffer,
        },
    } as unknown as AgentMarketOfferState;
    for (let tick = 0; tick < 20000; tick++) {
        adjustOfferPrice(offer, INVENTORY, offer.offerPrice!, SIZE, 0);
    }
    setCostSpringStrength(null);
    setCostFloorBuffer(null);
    return offer.offerPrice!;
}

const analytic = (strength: number, buffer: number): number => buffer / (1 + (7 * (1 - MAX_DOWN) / strength) ** 2);

const buffers = [0, 0.25, 0.5, 0.75, 1, 1.5];
const strengths = [0.05, 0.1, 0.25, 0.5, 1, 2, 5];

console.log('price at the soft min-ask, as a multiple of unit cost (costFloor = 1, offer price starts at 100)');
console.log(`per-tick cut rate = ${(1 - MAX_DOWN).toFixed(3)} (personality maxDown ${MAX_DOWN})\n`);
console.log('strength |' + buffers.map((b) => ` buffer=${b}`.padEnd(12)).join(''));
for (const strength of strengths) {
    const row = buffers.map((buffer) => {
        const price = floorPrice(strength, buffer, 0);
        const predicted = analytic(strength, buffer);
        return `${price.toFixed(3)}(${predicted.toFixed(3)})`.padEnd(12);
    });
    console.log(`${strength.toString().padEnd(9)}|${row.join('')}`);
}

console.log('\ngross margin at the floor, (price - cost) / price   [negative = selling below cost]');
console.log('strength |' + buffers.map((b) => ` buffer=${b}`.padEnd(12)).join(''));
for (const strength of strengths) {
    const row = buffers.map((buffer) => {
        const price = floorPrice(strength, buffer, 0);
        const margin = price > 0 ? (price - 1) / price : Number.NEGATIVE_INFINITY;
        return `${margin.toFixed(2)}`.padEnd(12);
    });
    console.log(`${strength.toString().padEnd(9)}|${row.join('')}`);
}

console.log('\nwith everything sold (sellFraction = 1) the price only rises:');
for (const strength of [0.5, 2]) {
    console.log(`  strength ${strength}: buffer 0 -> ${floorPrice(strength, 0, 1).toFixed(1)}`);
}
