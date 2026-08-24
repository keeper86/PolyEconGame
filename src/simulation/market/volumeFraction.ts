import { PRICE_FLOOR } from '../constants';

export function buyVolumeFraction(
    price: number,
    costFloor: number,
    sensitivity: number,
    floorFraction: number,
    maxCostMultiplier: number,
): number {
    const ratio = price / Math.max(PRICE_FLOOR, costFloor);
    const width = Math.max(0.001, sensitivity);
    return floorFraction + (1 - floorFraction) / (1 + Math.exp((ratio - maxCostMultiplier) / width));
}

export function sellVolumeFraction(
    price: number,
    costFloor: number,
    sensitivity: number,
    floorFraction: number,
    costFloorBuffer: number,
): number {
    const ratio = price / Math.max(PRICE_FLOOR, costFloor);
    const width = Math.max(0.001, sensitivity);
    return floorFraction + (1 - floorFraction) / (1 + Math.exp((costFloorBuffer - ratio) / width));
}
