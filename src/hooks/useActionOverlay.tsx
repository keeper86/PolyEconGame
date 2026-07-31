'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSimulationTick } from './useSimulationQuery';

export type PendingAction = {
    agentId: string;
    planetId: string;
    triggerTick: number;

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

    facilityKey?: string;
    facilityId?: string;
    loanId?: string;

    targetScale?: number;
    targetScaleFraction?: number;

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

const MAX_AGE_MS = 5 * 60 * 1000;

const STALE_TICK_THRESHOLD = 3;

interface StoredEntry {
    a: PendingAction;
    t: number;
}

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
        // Silently ignore storage errors
    }
}

// ── Key helpers ──────────────────────────────────────────────────────────────

function agentPlanetKey(a: PendingAction): string {
    return `${a.agentId}|${a.planetId}`;
}

// ── Context ──────────────────────────────────────────────────────────────────

interface PendingActionContextValue {
    addPending: (action: PendingAction) => void;
    getPending: (agentId: string, planetId: string) => PendingAction[];
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
    removePendingById: () => {},
    removePendingByKey: () => {},
    removePendingByResource: () => {},
});

// ── Provider ─────────────────────────────────────────────────────────────────

export function PendingActionProvider({ children }: { children: React.ReactNode }) {
    const [allActions, setAllActions] = useState<PendingAction[]>(readAll);

    const currentTick = useSimulationTick();

    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY) {
                setAllActions(readAll());
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    useEffect(() => {
        if (currentTick <= 0) {
            return;
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

    return (
        <PendingActionContext.Provider
            value={{
                addPending,
                getPending,
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