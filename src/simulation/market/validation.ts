import { PRICE_FLOOR, PRICE_CEIL, EPSILON } from '../constants';
import type {
    AgentPlanetAssets,
    AgentMarketOfferState,
    AgentMarketBidState,
    AutomatedPricingConfig,
} from '../planet/planet';
import type { Resource } from '../planet/claims';
import { getAvailableStorageCapacity, queryStorageFacility } from '../planet/facility';
import type { BuyBid } from '../../server/controller/user';

export type ValidationErrorCode =
    | 'priceInvalid'
    | 'priceNotPositive'
    | 'priceBelowFloor'
    | 'priceAboveCeiling'
    | 'quantityInvalid'
    | 'quantityNegative'
    | 'quantityBelowMinimum'
    | 'quantityExceedsStorage'
    | 'insufficientDeposits'
    | 'sellThroughAboveLimit'
    | 'fillRateAboveLimit';

export type ValidationResult =
    | { isValid: true }
    | { isValid: false; code: ValidationErrorCode; params: Record<string, number> };

export function validateSellOffer(price: number | undefined, _availableStock: number): ValidationResult {
    if (price === undefined) {
        return { isValid: true };
    }

    if (isNaN(price)) {
        return { isValid: false, code: 'priceInvalid', params: {} };
    }

    if (price <= 0) {
        return { isValid: false, code: 'priceNotPositive', params: {} };
    }

    if (price < PRICE_FLOOR) {
        return { isValid: false, code: 'priceBelowFloor', params: { floor: PRICE_FLOOR } };
    }

    if (price > PRICE_CEIL) {
        return { isValid: false, code: 'priceAboveCeiling', params: { ceiling: PRICE_CEIL } };
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
            return { isValid: false, code: 'priceInvalid', params: {} };
        }

        if (bidPrice <= 0) {
            return { isValid: false, code: 'priceNotPositive', params: {} };
        }

        if (bidPrice < PRICE_FLOOR) {
            return { isValid: false, code: 'priceBelowFloor', params: { floor: PRICE_FLOOR } };
        }

        if (bidPrice > PRICE_CEIL) {
            return { isValid: false, code: 'priceAboveCeiling', params: { ceiling: PRICE_CEIL } };
        }
    }

    if (quantity !== undefined) {
        if (isNaN(quantity)) {
            return { isValid: false, code: 'quantityInvalid', params: {} };
        }

        if (quantity < 0) {
            return { isValid: false, code: 'quantityNegative', params: {} };
        }

        if (quantity > 0 && quantity < EPSILON) {
            return { isValid: false, code: 'quantityBelowMinimum', params: { minimum: EPSILON } };
        }

        if (quantity > availableStorageCapacity + EPSILON) {
            return {
                isValid: false,
                code: 'quantityExceedsStorage',
                params: { available: availableStorageCapacity },
            };
        }
    }

    return { isValid: true };
}

export function validateBuyBid(
    bid: BuyBid,
    resource: Resource,
    assets: Pick<AgentPlanetAssets, 'storage' | 'deposits'>,
): ValidationResult {
    const { bidPrice, bidStorageTarget } = bid;

    if (bidStorageTarget !== undefined && bidStorageTarget < 0) {
        return { isValid: false, code: 'quantityNegative', params: {} };
    }
    const availableStorageCapacity = getAvailableStorageCapacity(assets.storage, resource);
    const currentInventory = queryStorageFacility(assets.storage, resource.name);
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
                code: 'insufficientDeposits',
                params: { required: maxCost, available: assets.deposits },
            };
        }
    }

    return { isValid: true };
}

function clampPrice(price: number): number {
    return Math.max(PRICE_FLOOR, Math.min(PRICE_CEIL, price));
}

function validatedBidQuantity(qty: number, _form: string): number {
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
        console.warn(`Invalid sell offer for ${offer.resource.name}: ${validation.code}`);
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
    assets: Pick<AgentPlanetAssets, 'storage' | 'deposits'>,
    currentInventory: number,
): { price: number; quantity: number; maxCost: number } | null {
    if (!bid.bidPrice || bid.bidPrice <= 0 || !isFinite(bid.bidPrice)) {
        return null;
    }

    const effectiveQuantity =
        bid.bidStorageTarget !== undefined ? Math.max(0, bid.bidStorageTarget - currentInventory) : 0;

    const availableStorageCapacity = getAvailableStorageCapacity(assets.storage, bid.resource);
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

export function validateAutoConfigTargets(
    autoConfig: AutomatedPricingConfig | undefined,
    resource: Resource,
): ValidationResult {
    if (!autoConfig || resource.form !== 'services') {
        return { isValid: true };
    }

    if (autoConfig.targetSellThrough !== undefined && autoConfig.targetSellThrough > 1) {
        return { isValid: false, code: 'sellThroughAboveLimit', params: {} };
    }

    if (autoConfig.targetFillRate !== undefined && autoConfig.targetFillRate > 1) {
        return { isValid: false, code: 'fillRateAboveLimit', params: {} };
    }

    return { isValid: true };
}
