'use client';

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

/**
 * Builds a deterministic key that uniquely identifies an action for
 * timestamp-preservation purposes.
 */
function actionStorageKey(a: PendingAction): string {
    const discriminator = a.facilityId ?? a.facilityKey ?? a.loanId ?? a.resourceName ?? '';
    return `${a.agentId}|${a.planetId}|${a.type}|${discriminator}`;
}

function serialize(actions: PendingAction[], existingEntries: StoredEntry[]): string {
    const existingMap = new Map<string, number>();
    for (const e of existingEntries) {
        existingMap.set(actionStorageKey(e.a), e.t);
    }

    const entries: StoredEntry[] = actions.map((a) => {
        const key = actionStorageKey(a);
        // Preserve the original timestamp if this action already existed,
        // otherwise use the current time for new entries.
        const t = existingMap.get(key) ?? Date.now();
        return { a, t };
    });
    return JSON.stringify(entries);
}

function deserialize(raw: string | null): StoredEntry[] {
    if (!raw) {
        return [];
    }
    try {
        const entries: StoredEntry[] = JSON.parse(raw);
        if (!Array.isArray(entries)) {
            return [];
        }
        const now = Date.now();
        return entries.filter((e) => e.a && e.t && now - e.t <= MAX_AGE_MS);
    } catch {
        return [];
    }
}

function readAllStored(): StoredEntry[] {
    if (typeof window === 'undefined') {
        return [];
    }
    try {
        return deserialize(localStorage.getItem(STORAGE_KEY));
    } catch {
        return [];
    }
}

function readAll(): PendingAction[] {
    return readAllStored().map((e) => e.a);
}

function writeAll(actions: PendingAction[], existingEntries: StoredEntry[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, serialize(actions, existingEntries));
    } catch {
        // Silently ignore storage errors (e.g. Safari private mode, quota exceeded)
    }
}

// ── Action match type ────────────────────────────────────────────────────────

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

// ── Key helpers ──────────────────────────────────────────────────────────────

function agentPlanetKey(a: PendingAction): string {
    return `${a.agentId}|${a.planetId}`;
}

// ── Context ──────────────────────────────────────────────────────────────────

interface PendingActionContextValue {
    addPending: (action: PendingAction) => void;
    getPending: (agentId: string, planetId: string) => PendingAction[];
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
                setAllActions(readAll());
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

        const stored = readAllStored();
        const fresh = stored.filter((e) => currentTick - e.a.triggerTick < STALE_TICK_THRESHOLD);
        if (fresh.length !== stored.length) {
            writeAll(
                fresh.map((e) => e.a),
                stored,
            );
            setAllActions(fresh.map((e) => e.a));
        }
    }, [currentTick]);

    const addPending = useCallback((action: PendingAction) => {
        const stored = readAllStored();
        const current = stored.map((e) => e.a);
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
        writeAll(next, stored);
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
            const stored = readAllStored();
            const current = stored.map((e) => e.a);
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
            writeAll(next, stored);
            setAllActions(next);
        },
        [],
    );

    const removePendingByKey = useCallback((agentId: string, planetId: string, facilityKey: string) => {
        const key = `${agentId}|${planetId}`;
        const stored = readAllStored();
        const current = stored.map((e) => e.a);
        const next = current.filter((a) => !(agentPlanetKey(a) === key && a.facilityKey === facilityKey));
        if (next.length === current.length) {
            return;
        }
        writeAll(next, stored);
        setAllActions(next);
    }, []);

    const removePendingByResource = useCallback(
        (agentId: string, planetId: string, resourceName: string, actionType?: PendingAction['type']) => {
            const key = `${agentId}|${planetId}`;
            const stored = readAllStored();
            const current = stored.map((e) => e.a);
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
            writeAll(next, stored);
            setAllActions(next);
        },
        [],
    );

    const updateProcessedAtTick = useCallback(
        (agentId: string, planetId: string, match: PendingActionMatch, tick: number) => {
            const key = `${agentId}|${planetId}`;
            const stored = readAllStored();
            const next = stored.map((e) => {
                if (agentPlanetKey(e.a) !== key) {
                    return e;
                }
                if (e.a.type !== match.type) {
                    return e;
                }
                // Match by the identifying field that uniquely pins this action
                if (match.facilityKey && e.a.facilityKey !== match.facilityKey) {
                    return e;
                }
                if (match.facilityId && e.a.facilityId !== match.facilityId) {
                    return e;
                }
                if (match.resourceName && e.a.resourceName !== match.resourceName) {
                    return e;
                }
                if (match.loanId && e.a.loanId !== match.loanId) {
                    return e;
                }
                return { a: { ...e.a, processedAtTick: tick }, t: e.t };
            });
            writeAll(
                next.map((e) => e.a),
                stored,
            );
            setAllActions(next.map((e) => e.a));
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
