import { TRADABLE_RESOURCES } from '../planet/resourceCatalog';
import type { Planet } from '../planet/planet';

export function generalPriceLevel(planet: Planet): number {
    let sum = 0;
    let count = 0;
    for (const resource of TRADABLE_RESOURCES) {
        const price = planet.marketPrices[resource.name];
        if (price !== undefined && price > 0 && Number.isFinite(price)) {
            sum += price;
            count += 1;
        }
    }
    return count > 0 ? sum / count : 0;
}
