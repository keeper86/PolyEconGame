import { PRICE_FLOOR, PRICE_CEIL, EPSILON } from '../constants';
import type { Resource, AgentPlanetAssets, AgentMarketOfferState, AgentMarketBidState } from '../planet/planet';
import { getAvailableStorageCapacity, queryStorageFacility } from '../planet/facility';
import type { BuyBid } from '../../server/controller/user';

/**
 * Shared validation functions for market offers and bids.
 * This provides a single source of truth for validation logic
 * that can be used both in the frontend (for immediate user feedback)
 * and in the backend (for rejecting invalid offers).
 */

export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

/**
 * Validates a sell offer price.
 * Returns validation result with error message if invalid.
 * If price is undefined, it's considered valid (user might be changing only one field).
 */
export function validateSellOffer(price: number | undefined, _availableStock: number): ValidationResult {
    // If price is undefined, nothing to validate
    if (price === undefined) {
        return { isValid: true };
    }

    // Price validation
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

/**
 * Validates buy bid price and quantity fields (range checks only).
 * No deposit check — that is a multi-bid aggregate concern handled by collectAgentBids.
 * Used internally by validateBuyBid and validateAndPrepareBuyBid.
 */
function validateBidFields(
    bidPrice: number | undefined,
    quantity: number | undefined,
    availableStorageCapacity: number,
): ValidationResult {
    // If both are undefined, nothing to validate
    if (bidPrice === undefined && quantity === undefined) {
        return { isValid: true };
    }

    // Price validation (only if provided)
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

    // Quantity validation (only if provided)
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

/**
 * Full user-facing validation of a buy bid: field ranges + deposit affordability.
 * Used by the server controller and the UI.
 */
export function validateBuyBid(
    bid: BuyBid,
    resource: Resource,
    assets: Pick<AgentPlanetAssets, 'storageFacility' | 'deposits'>,
): ValidationResult {
    const { bidPrice, bidStorageTarget } = bid;

    // Validate bidStorageTarget before clamping — a negative target is always invalid.
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

    // Deposit affordability (only if both price and quantity are provided)
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

/**
 * Clamps a price to the valid range [PRICE_FLOOR, PRICE_CEIL].
 * Used in the market clearing process.
 */
export function clampPrice(price: number): number {
    return Math.max(PRICE_FLOOR, Math.min(PRICE_CEIL, price));
}

/**
 * Clamps a quantity to non-negative. Used in the market clearing process.
 * Snaps quantities smaller than EPSILON to 0 to prevent "quantity too small" warnings.
 */
export function validatedBidQuantity(qty: number, _form: string): number {
    if (qty < EPSILON) {
        return 0;
    }
    return qty;
}

/**
 * Validates and prepares a sell offer for order collection.
 * Returns validated and clamped price & quantity, or null if the offer is invalid.
 * Logs warnings for invalid offers.
 */
export function validateAndPrepareSellOffer(
    offer: AgentMarketOfferState,
    availableStock: number,
): { price: number; quantity: number } | null {
    // Calculate effective quantity based on retainment
    const effectiveQuantity =
        offer.offerRetainment !== undefined ? Math.max(0, availableStock - offer.offerRetainment) : 0;

    // Validate the offer
    const validation = validateSellOffer(offer.offerPrice, availableStock);

    if (!validation.isValid) {
        console.warn(`Invalid sell offer for ${offer.resource.name}: ${validation.error}`);
        return null;
    }

    // If price is undefined, we can't create an order
    if (offer.offerPrice === undefined) {
        console.warn(`Sell offer for ${offer.resource.name} has no price`);
        return null;
    }

    // If quantity is zero or negative after validation, skip
    if (effectiveQuantity <= 0) {
        return null;
    }

    return {
        price: clampPrice(offer.offerPrice),
        quantity: effectiveQuantity,
    };
}

/**
 * Validates and prepares a buy bid for order collection.
 * Returns validated and clamped price & quantity, or null if the bid is inactive/invalid.
 *
 * Only field-level rules (price range, quantity range, storage capacity) are checked.
 * Deposit affordability is handled by collectAgentBids via proportional multi-bid scaling.
 */
export function validateAndPrepareBuyBid(
    bid: AgentMarketBidState,
    assets: Pick<AgentPlanetAssets, 'storageFacility' | 'deposits'>,
    currentInventory: number,
): { price: number; quantity: number; maxCost: number } | null {
    // No valid price means the bid has not been configured yet — skip silently.
    if (!bid.bidPrice || bid.bidPrice <= 0 || !isFinite(bid.bidPrice)) {
        return null;
    }

    // Calculate effective quantity from storage target
    const effectiveQuantity =
        bid.bidStorageTarget !== undefined ? Math.max(0, bid.bidStorageTarget - currentInventory) : 0;

    // Cap by available storage capacity
    const availableStorageCapacity = getAvailableStorageCapacity(assets.storageFacility, bid.resource);
    const cappedQuantity = Math.min(effectiveQuantity, availableStorageCapacity);

    // Validate price and quantity ranges (no deposit check — handled by collectAgentBids)
    const validation = validateBidFields(bid.bidPrice, cappedQuantity, availableStorageCapacity);
    if (!validation.isValid) {
        console.warn(`Invalid buy bid for ${bid.resource.name}: ${validation.error}`);
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
