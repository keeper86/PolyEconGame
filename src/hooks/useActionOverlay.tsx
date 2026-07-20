'use client';

import type { ProductionFacility } from '@/simulation/planet/facility';
import { facilityByName } from '@/simulation/planet/productionFacilities';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSimulationTick } from './useSimulationQuery';

// ── Pending action types ─────────────────────────────────────────────────────

/**
 * A pending action represents a user-initiated mutation that has been sent to
 * the server but whose effect has not yet been reflected in the latest snapshot.
 *
 * Unlike the old ActionOverlay system, this does NOT create fake facility data.
 * Instead, UI components show a loading/spinner state based on whether a pending
 * action exists. The action is removed (resolved) once the snapshot data
 * confirms the mutation took effect.
 */
export type PendingAction = {
    agentId: string;
    planetId: string;
    triggerTick: number;

    /**
     * The tick at which the worker processed this action.
     * Set when the success response arrives from the worker.
     * Used for robust tick-based overlay removal.
     */
    processedAtTick?: number;

    type:
        | 'build'
        | 'expand'
        | 'contract'
        | 'scaleChange'
        | 'cancel'
        | 'marketBuyPrice'
        | 'marketBuyAutomation'
        | 'marketBuyAutoConfig'
        | 'marketSellPrice'
        | 'marketSellAutomation'
        | 'marketSellAutoConfig'
        | 'marketCancelBuy'
        | 'marketCancelSell'
        | 'loanRequest'
        | 'loanRepay';

    // For new builds: the catalog key like "Wheat Farm" (no facilityId yet)
    facilityKey?: string;
    // For existing facilities: the facility's ID
    facilityId?: string;

    // For loan actions: the loan ID being repaid
    loanId?: string;

    // Context-specific parameters used for predicate-based resolution
    targetScale?: number; // expand / contract
    targetScaleFraction?: number; // scaleChange

    // Market action parameters
    resourceName?: string;
    submittedBidPrice?: number;
    submittedBidStorageTarget?: number;
    submittedBidAutomated?: boolean;
    submittedOfferPrice?: number;
    submittedOfferRetainment?: number;
    submittedOfferAutomated?: boolean;
};

// ── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'polyecon:pending-actions:v2';

/**
 * Maximum age of a stored pending action in milliseconds.
 * Older entries are discarded on restore to prevent stale loading states
 * when the user returns after a long absence.
 */
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Tick-based TTL threshold.
 * A pending action whose triggerTick is 3 or more ticks behind the current
 * simulation tick is considered stale and will be garbage collected.
 *
 * Rationale:
 *   User clicks at tick N → mutation sent to backend (may already be at N+1)
 *   Backend processes during tick N+1 → results visible in snapshot at N+2
 *   By tick N+3 any unreconciled action is guaranteed to be lost.
 */
const STALE_TICK_THRESHOLD = 3;

interface StoredEntry {
    a: PendingAction;
    t: number; // Date.now() at write time
}

function serialize(actions: PendingAction[]): string {
    const entries: StoredEntry[] = actions.map((a) => ({ a, t: Date.now() }));
    return JSON.stringify(entries);
}

function deserialize(raw: string | null): PendingAction[] {
    if (!raw) {
        return [];
    }
    try {
        const entries: StoredEntry[] = JSON.parse(raw);
        if (!Array.isArray(entries)) {
            return [];
        }
        const now = Date.now();
        return entries.filter((e) => e.a && e.t && now - e.t <= MAX_AGE_MS).map((e) => e.a);
    } catch {
        return [];
    }
}

function readAll(): PendingAction[] {
    if (typeof window === 'undefined') {
        return [];
    }
    try {
        return deserialize(localStorage.getItem(STORAGE_KEY));
    } catch {
        return [];
    }
}

function writeAll(actions: PendingAction[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, serialize(actions));
    } catch {
        // Silently ignore storage errors (e.g. Safari private mode, quota exceeded)
    }
}

// ── Key helpers ──────────────────────────────────────────────────────────────

function agentPlanetKey(a: PendingAction): string {
    return `${a.agentId}|${a.planetId}`;
}

// ── Context ──────────────────────────────────────────────────────────────────

export interface PendingActionMatch {
    type: PendingAction['type'];
    /** For action types that have a facilityKey (build). */
    facilityKey?: string;
    /** For action types that have a facilityId (expand, contract, scaleChange, cancel). */
    facilityId?: string;
    /** For action types that have a resourceName (market buy/sell). */
    resourceName?: string;
    /** For action types that have a loanId (loanRepay). */
    loanId?: string;
}

interface PendingActionContextValue {
    addPending: (action: PendingAction) => void;
    getPending: (agentId: string, planetId: string) => PendingAction[];
    /**
     * Update the processedAtTick on a pending action identified by the given criteria.
     * Used in mutation onSuccess callbacks to attach the authoritative worker tick.
     */
    updateProcessedAtTick: (agentId: string, planetId: string, match: PendingActionMatch, tick: number) => void;
    removePendingById: (
        agentId: string,
        planetId: string,
        facilityId: string,
        actionType?: PendingAction['type'],
    ) => void;
    removePendingByKey: (agentId: string, planetId: string, facilityKey: string) => void;
    removePendingByResource: (
        agentId: string,
        planetId: string,
        resourceName: string,
        actionType?: PendingAction['type'],
    ) => void;
}

const PendingActionContext = createContext<PendingActionContextValue>({
    addPending: () => {},
    getPending: () => [],
    updateProcessedAtTick: () => {},
    removePendingById: () => {},
    removePendingByKey: () => {},
    removePendingByResource: () => {},
});

// ── Provider ─────────────────────────────────────────────────────────────────

export function PendingActionProvider({ children }: { children: React.ReactNode }) {
    const [allActions, setAllActions] = useState<PendingAction[]>(readAll);

    // Current simulation tick for TTL-based garbage collection
    const currentTick = useSimulationTick();

    // Sync from other tabs via the native `storage` event.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY) {
                setAllActions(deserialize(e.newValue));
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    // Tick-based garbage collection: discard actions that are too old
    // to still be genuinely pending (3+ ticks overdue).
    useEffect(() => {
        if (currentTick <= 0) {
            return; // tick not yet loaded
        }

        const all = readAll();
        const fresh = all.filter((a) => currentTick - a.triggerTick < STALE_TICK_THRESHOLD);
        if (fresh.length !== all.length) {
            writeAll(fresh);
            setAllActions(fresh);
        }
    }, [currentTick]);

    const addPending = useCallback((action: PendingAction) => {
        const current = readAll();
        const actionKey = agentPlanetKey(action);
        let next: PendingAction[];
        if (action.type === 'scaleChange' && action.facilityId) {
            next = current.filter(
                (a) =>
                    !(
                        agentPlanetKey(a) === actionKey &&
                        a.type === 'scaleChange' &&
                        a.facilityId === action.facilityId
                    ),
            );
        } else if (
            (action.type === 'marketBuyPrice' ||
                action.type === 'marketBuyAutomation' ||
                action.type === 'marketBuyAutoConfig') &&
            action.resourceName
        ) {
            // Replace any existing pending action of the same sub-type for this resource
            next = current.filter(
                (a) =>
                    !(
                        agentPlanetKey(a) === actionKey &&
                        a.type === action.type &&
                        a.resourceName === action.resourceName
                    ),
            );
        } else if (
            (action.type === 'marketSellPrice' ||
                action.type === 'marketSellAutomation' ||
                action.type === 'marketSellAutoConfig') &&
            action.resourceName
        ) {
            // Replace any existing pending action of the same sub-type for this resource
            next = current.filter(
                (a) =>
                    !(
                        agentPlanetKey(a) === actionKey &&
                        a.type === action.type &&
                        a.resourceName === action.resourceName
                    ),
            );
        } else {
            next = [...current];
        }
        next.push(action);
        writeAll(next);
        setAllActions(next);
    }, []);

    const getPending = useCallback(
        (agentId: string, planetId: string): PendingAction[] => {
            const key = `${agentId}|${planetId}`;
            return allActions.filter((a) => agentPlanetKey(a) === key);
        },
        [allActions],
    );

    const removePendingById = useCallback(
        (agentId: string, planetId: string, facilityId: string, actionType?: PendingAction['type']) => {
            const key = `${agentId}|${planetId}`;
            const current = readAll();
            const next = current.filter(
                (a) =>
                    !(
                        agentPlanetKey(a) === key &&
                        a.facilityId === facilityId &&
                        (!actionType || a.type === actionType)
                    ),
            );
            if (next.length === current.length) {
                return;
            }
            writeAll(next);
            setAllActions(next);
        },
        [],
    );

    const removePendingByKey = useCallback((agentId: string, planetId: string, facilityKey: string) => {
        const key = `${agentId}|${planetId}`;
        const current = readAll();
        const next = current.filter((a) => !(agentPlanetKey(a) === key && a.facilityKey === facilityKey));
        if (next.length === current.length) {
            return;
        }
        writeAll(next);
        setAllActions(next);
    }, []);

    const removePendingByResource = useCallback(
        (agentId: string, planetId: string, resourceName: string, actionType?: PendingAction['type']) => {
            const key = `${agentId}|${planetId}`;
            const current = readAll();
            const next = current.filter(
                (a) =>
                    !(
                        agentPlanetKey(a) === key &&
                        a.resourceName === resourceName &&
                        (!actionType || a.type === actionType)
                    ),
            );
            if (next.length === current.length) {
                return;
            }
            writeAll(next);
            setAllActions(next);
        },
        [],
    );

    const updateProcessedAtTick = useCallback(
        (agentId: string, planetId: string, match: PendingActionMatch, tick: number) => {
            const key = `${agentId}|${planetId}`;
            const current = readAll();
            const next = current.map((a) => {
                if (agentPlanetKey(a) !== key) {
                    return a;
                }
                if (a.type !== match.type) {
                    return a;
                }
                // Match by the identifying field that uniquely pins this action
                if (match.facilityKey && a.facilityKey !== match.facilityKey) {
                    return a;
                }
                if (match.facilityId && a.facilityId !== match.facilityId) {
                    return a;
                }
                if (match.resourceName && a.resourceName !== match.resourceName) {
                    return a;
                }
                if (match.loanId && a.loanId !== match.loanId) {
                    return a;
                }
                return { ...a, processedAtTick: tick };
            });
            writeAll(next);
            setAllActions(next);
        },
        [],
    );

    return (
        <PendingActionContext.Provider
            value={{
                addPending,
                getPending,
                updateProcessedAtTick,
                removePendingById,
                removePendingByKey,
                removePendingByResource,
            }}
        >
            {children}
        </PendingActionContext.Provider>
    );
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useAddPendingAction() {
    return useContext(PendingActionContext).addPending;
}

export function usePendingActions(agentId: string, planetId: string): PendingAction[] {
    return useContext(PendingActionContext).getPending(agentId, planetId);
}

export function useRemovePendingById() {
    return useContext(PendingActionContext).removePendingById;
}

export function useRemovePendingByKey() {
    return useContext(PendingActionContext).removePendingByKey;
}

export function useRemovePendingByResource() {
    return useContext(PendingActionContext).removePendingByResource;
}

export function useUpdateProcessedAtTick() {
    return useContext(PendingActionContext).updateProcessedAtTick;
}

// ── Resolution ───────────────────────────────────────────────────────────────

/**
 * Predicate-based resolver for facility-related actions.
 * Given a list of pending actions and the real snapshot facilities, returns
 * only the actions that have NOT yet been confirmed by the backend.
 *
 * Each action type has a simple boolean check against the real facility list.
 * No fake data construction, no tick arithmetic.
 */
export function resolvePendingActions(actions: PendingAction[], facilities: ProductionFacility[]): PendingAction[] {
    return actions.filter((a) => {
        switch (a.type) {
            case 'build': {
                // Resolved: a facility with this catalog name exists in the snapshot
                const entry = a.facilityKey ? facilityByName.get(a.facilityKey) : undefined;
                if (!entry || !a.facilityKey) {
                    return true;
                }
                const name = entry.factory('catalog', 'preview').name;
                return !facilities.some((f) => f.name === name);
            }
            case 'expand': {
                // Resolved: the facility has construction with the target max scale
                // (or a higher one, meaning the expand was processed)
                if (!a.facilityId) {
                    return true;
                }
                if (a.targetScale == null) {
                    return true; // cannot verify completion without a target
                }
                const f = facilities.find((f) => f.id === a.facilityId);
                const targetScale = a.targetScale;
                return !(
                    f?.construction?.constructionTargetMaxScale != null &&
                    f.construction.constructionTargetMaxScale >= targetScale
                );
            }
            case 'contract': {
                // Resolved: the facility's maxScale matches the target
                if (!a.facilityId) {
                    return true;
                }
                const f = facilities.find((f) => f.id === a.facilityId);
                return !(f && a.targetScale != null && f.maxScale === a.targetScale);
            }
            case 'scaleChange': {
                // Resolved: the facility's scale fraction matches the target
                if (!a.facilityId) {
                    return true;
                }
                if (a.targetScaleFraction == null) {
                    return true; // cannot verify completion without a target
                }
                const f = facilities.find((f) => f.id === a.facilityId);
                if (!f || f.maxScale === 0) {
                    return true;
                }
                const fraction = a.targetScaleFraction;
                return Math.abs(f.scale / f.maxScale - fraction) >= 0.01;
            }
            case 'cancel': {
                // Resolved: the facility no longer exists (new-build cancel)
                //           OR the facility has no construction (expansion cancel)
                if (!a.facilityId) {
                    return true;
                }
                const f = facilities.find((f) => f.id === a.facilityId);
                return !(!f || f.construction === null);
            }
            default:
                return true;
        }
    });
}

/**
 * Predicate-based resolver for market actions.
 * Given a list of pending actions and the current buyBids/sellOffers snapshots,
 * returns only the actions that have NOT yet been confirmed by the backend.
 */
export function resolveMarketPendingActions(
    actions: PendingAction[],
    buyBids: Record<
        string,
        { bidPrice?: number; bidStorageTarget?: number; automated?: boolean; autoConfig?: unknown }
    >,
    sellOffers: Record<
        string,
        { offerPrice?: number; offerRetainment?: number; automated?: boolean; autoConfig?: unknown }
    >,
): PendingAction[] {
    return actions.filter((a) => {
        if (!a.resourceName) {
            return true;
        }

        switch (a.type) {
            case 'marketBuyPrice': {
                const bid = buyBids[a.resourceName];
                if (!bid) {
                    return true; // keep pending if no bid data yet
                }
                // Resolved: submitted price/storage values match the snapshot
                const priceMatch = a.submittedBidPrice == null || bid.bidPrice === a.submittedBidPrice;
                const storageMatch =
                    a.submittedBidStorageTarget == null || bid.bidStorageTarget === a.submittedBidStorageTarget;
                return !(priceMatch && storageMatch);
            }
            case 'marketBuyAutomation': {
                const bid = buyBids[a.resourceName];
                if (!bid) {
                    return true;
                }
                const autoMatch = a.submittedBidAutomated == null || bid.automated === a.submittedBidAutomated;
                return !autoMatch;
            }
            case 'marketBuyAutoConfig': {
                // Resolved immediately — auto-config is saved along with the bid;
                // we keep the pending for one tick cycle. Since auto-config is
                // nested data that's hard to compare deeply, we just wait for the
                // next snapshot to arrive (the pending will be cleared after tick).
                // For now, resolve based on any bid data existing.
                const bid = buyBids[a.resourceName];
                return !bid; // keep pending if bid hasn't appeared yet
            }
            case 'marketSellPrice': {
                const offer = sellOffers[a.resourceName];
                if (!offer) {
                    return true;
                }
                const priceMatch = a.submittedOfferPrice == null || offer.offerPrice === a.submittedOfferPrice;
                const retainmentMatch =
                    a.submittedOfferRetainment == null || offer.offerRetainment === a.submittedOfferRetainment;
                return !(priceMatch && retainmentMatch);
            }
            case 'marketSellAutomation': {
                const offer = sellOffers[a.resourceName];
                if (!offer) {
                    return true;
                }
                const autoMatch = a.submittedOfferAutomated == null || offer.automated === a.submittedOfferAutomated;
                return !autoMatch;
            }
            case 'marketSellAutoConfig': {
                const offer = sellOffers[a.resourceName];
                return !offer;
            }
            case 'marketCancelBuy': {
                // Resolved: the bid no longer exists (bidPrice and bidStorageTarget are undefined)
                const bid = buyBids[a.resourceName];
                return !(!bid || (bid.bidPrice === undefined && bid.bidStorageTarget === undefined));
            }
            case 'marketCancelSell': {
                // Resolved: the offer no longer exists (offerPrice and offerRetainment are undefined)
                const offer = sellOffers[a.resourceName];
                return !(!offer || (offer.offerPrice === undefined && offer.offerRetainment === undefined));
            }
            default:
                return true; // non-market actions pass through
        }
    });
}
