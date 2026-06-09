import { PRICE_FLOOR, PRICE_CEIL, EPSILON } from '../constants';
import type { AgentPlanetAssets, AgentMarketOfferState, AgentMarketBidState } from '../planet/planet';
import type { Resource } from '../planet/claims';
import { getAvailableStorageCapacity, queryStorageFacility } from '../planet/facility';
import type { BuyBid } from '../../server/controller/user';

export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

export function validateSellOffer(price: number | undefined, _availableStock: number): ValidationResult {
    if (price === undefined) {
        return { isValid: true };
    }

    if (isNaN(price)) {
        return { isValid: false, error: 'Price must be a valid number' };
    }

    if (price <= 0) {
        return { isValid: false, error: 'Price must be greater than 0' };
    }

    if (price < PRICE_FLOOR) {
        return { isValid: false, error: `Price must be at least ${PRICE_FLOOR}` };
    }

    if (price > PRICE_CEIL) {
        return { isValid: false, error: `Price must not exceed ${PRICE_CEIL}` };
    }

    return { isValid: true };
}

function validateBidFields(
    bidPrice: number | undefined,
    quantity: number | undefined,
    availableStorageCapacity: number,
): ValidationResult {
    if (bidPrice === undefined && quantity === undefined) {
        return { isValid: true };
    }

    if (bidPrice !== undefined) {
        if (isNaN(bidPrice)) {
            return { isValid: false, error: 'Price must be a valid number' };
        }

        if (bidPrice <= 0) {
            return { isValid: false, error: 'Price must be greater than 0' };
        }

        if (bidPrice < PRICE_FLOOR) {
            return { isValid: false, error: `Price must be at least ${PRICE_FLOOR}` };
        }

        if (bidPrice > PRICE_CEIL) {
            return { isValid: false, error: `Price must not exceed ${PRICE_CEIL}` };
        }
    }

    if (quantity !== undefined) {
        if (isNaN(quantity)) {
            return { isValid: false, error: 'Quantity must be a valid number' };
        }

        if (quantity < 0) {
            return { isValid: false, error: 'Quantity must be non-negative' };
        }

        if (quantity > 0 && quantity < EPSILON) {
            return { isValid: false, error: `Quantity must be at least ${EPSILON}` };
        }

        if (quantity > availableStorageCapacity + EPSILON) {
            return {
                isValid: false,
                error: `Quantity exceeds available storage capacity (${availableStorageCapacity.toFixed(2)})`,
            };
        }
    }

    return { isValid: true };
}

export function validateBuyBid(
    bid: BuyBid,
    resource: Resource,
    assets: Pick<AgentPlanetAssets, 'storageFacility' | 'deposits'>,
): ValidationResult {
    const { bidPrice, bidStorageTarget } = bid;

    if (bidStorageTarget !== undefined && bidStorageTarget < 0) {
        return { isValid: false, error: 'Quantity must be non-negative' };
    }

    const availableStorageCapacity = getAvailableStorageCapacity(assets.storageFacility, resource);
    const currentInventory = queryStorageFacility(assets.storageFacility, resource.name);
    const quantity = bidStorageTarget !== undefined ? Math.max(0, bidStorageTarget - currentInventory) : 0;

    const fieldResult = validateBidFields(bidPrice, quantity, availableStorageCapacity);
    if (!fieldResult.isValid) {
        return fieldResult;
    }

    if (bidPrice !== undefined && quantity !== undefined) {
        const maxCost = quantity * bidPrice;
        if (maxCost > assets.deposits + EPSILON) {
            return {
                isValid: false,
                error: `Insufficient deposits (need ${maxCost.toFixed(2)}, have ${assets.deposits.toFixed(2)})`,
            };
        }
    }

    return { isValid: true };
}

export function clampPrice(price: number): number {
    return Math.max(PRICE_FLOOR, Math.min(PRICE_CEIL, price));
}

export function validatedBidQuantity(qty: number, _form: string): number {
    if (qty < EPSILON) {
        return 0;
    }
    return qty;
}

export function validateAndPrepareSellOffer(
    offer: AgentMarketOfferState,
    availableStock: number,
): { price: number; quantity: number } | null {
    const effectiveQuantity =
        offer.offerRetainment !== undefined ? Math.max(0, availableStock - offer.offerRetainment) : 0;

    const validation = validateSellOffer(offer.offerPrice, availableStock);

    if (!validation.isValid) {
        console.warn(`Invalid sell offer for ${offer.resource.name}: ${validation.error}`);
        return null;
    }

    if (offer.offerPrice === undefined) {
        console.warn(`Sell offer for ${offer.resource.name} has no price`);
        return null;
    }

    if (effectiveQuantity <= 0) {
        return null;
    }

    return {
        price: clampPrice(offer.offerPrice),
        quantity: effectiveQuantity,
    };
}

export function validateAndPrepareBuyBid(
    bid: AgentMarketBidState,
    assets: Pick<AgentPlanetAssets, 'storageFacility' | 'deposits'>,
    currentInventory: number,
): { price: number; quantity: number; maxCost: number } | null {
    if (!bid.bidPrice || bid.bidPrice <= 0 || !isFinite(bid.bidPrice)) {
        return null;
    }

    const effectiveQuantity =
        bid.bidStorageTarget !== undefined ? Math.max(0, bid.bidStorageTarget - currentInventory) : 0;

    const availableStorageCapacity = getAvailableStorageCapacity(assets.storageFacility, bid.resource);
    const cappedQuantity = Math.min(effectiveQuantity, availableStorageCapacity);

    const validation = validateBidFields(bid.bidPrice, cappedQuantity, availableStorageCapacity);
    if (!validation.isValid) {
        return null;
    }

    const validatedQuantity = validatedBidQuantity(cappedQuantity, bid.resource.form);
    if (validatedQuantity <= 0) {
        return null;
    }

    const price = clampPrice(bid.bidPrice);
    const maxCost = validatedQuantity * price;

    return { price, quantity: validatedQuantity, maxCost };
}
