'use client';

import type { ProductionFacility } from '@/simulation/planet/facility';
import { facilityByName } from '@/simulation/planet/productionFacilities';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

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

    type: 'build' | 'expand' | 'contract' | 'scaleChange' | 'cancel';

    // For new builds: the catalog key like "Wheat Farm" (no facilityId yet)
    facilityKey?: string;
    // For existing facilities: the facility's ID
    facilityId?: string;

    // Context-specific parameters used for predicate-based resolution
    targetScale?: number; // expand / contract
    targetScaleFraction?: number; // scaleChange
};

// ── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'polyecon:pending-actions:v2';

/**
 * Maximum age of a stored pending action in milliseconds.
 * Older entries are discarded on restore to prevent stale loading states
 * when the user returns after a long absence.
 */
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

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
    return deserialize(localStorage.getItem(STORAGE_KEY));
}

function writeAll(actions: PendingAction[]): void {
    localStorage.setItem(STORAGE_KEY, serialize(actions));
}

// ── Key helpers ──────────────────────────────────────────────────────────────

function agentPlanetKey(a: PendingAction): string {
    return `${a.agentId}|${a.planetId}`;
}

// ── Context ──────────────────────────────────────────────────────────────────

interface PendingActionContextValue {
    addPending: (action: PendingAction) => void;
    getPending: (agentId: string, planetId: string) => PendingAction[];
    removePendingById: (agentId: string, planetId: string, facilityId: string) => void;
    removePendingByKey: (agentId: string, planetId: string, facilityKey: string) => void;
}

const PendingActionContext = createContext<PendingActionContextValue>({
    addPending: () => {},
    getPending: () => [],
    removePendingById: () => {},
    removePendingByKey: () => {},
});

// ── Provider ─────────────────────────────────────────────────────────────────

export function PendingActionProvider({ children }: { children: React.ReactNode }) {
    const [allActions, setAllActions] = useState<PendingAction[]>(readAll);

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

    const addPending = useCallback((action: PendingAction) => {
        const current = readAll();
        // For scale changes, replace any existing pending scale change for the same facility
        let next: PendingAction[];
        if (action.type === 'scaleChange' && action.facilityId) {
            next = current.filter((a) => !(a.type === 'scaleChange' && a.facilityId === action.facilityId));
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

    const removePendingById = useCallback((agentId: string, planetId: string, facilityId: string) => {
        const key = `${agentId}|${planetId}`;
        const current = readAll();
        const next = current.filter((a) => !(agentPlanetKey(a) === key && a.facilityId === facilityId));
        if (next.length === current.length) {
            return;
        }
        writeAll(next);
        setAllActions(next);
    }, []);

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

    return (
        <PendingActionContext.Provider value={{ addPending, getPending, removePendingById, removePendingByKey }}>
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

// ── Resolution ───────────────────────────────────────────────────────────────

/**
 * Predicate-based resolver. Given a list of pending actions and the real
 * snapshot facilities, returns only the actions that have NOT yet been
 * confirmed by the backend.
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
                } // keep pending
                const name = entry.factory('catalog', 'preview').name;
                return !facilities.some((f) => f.name === name);
            }
            case 'expand': {
                // Resolved: the facility has construction with the target max scale
                // (or a higher one, meaning the expand was processed)
                if (!a.facilityId) {
                    return true;
                }
                const f = facilities.find((f) => f.id === a.facilityId);
                const targetScale = a.targetScale ?? 0;
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
                const f = facilities.find((f) => f.id === a.facilityId);
                if (!f || f.maxScale === 0) {
                    return true;
                }
                const fraction = a.targetScaleFraction ?? 1;
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
