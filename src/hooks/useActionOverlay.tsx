'use client';

import type { ProductionFacility } from '@/simulation/planet/facility';
import { calculateCostsForConstruction, getFacilityType } from '@/simulation/planet/facility';
import { facilityByName } from '@/simulation/planet/productionFacilities';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

// ── Overlay types ────────────────────────────────────────────────────────────

/**
 * An overlay represents a mutation that the worker has confirmed processing,
 * but whose effect has not yet been reflected in the latest snapshot broadcast.
 */
export type ActionOverlay =
    | {
          type: 'facilityBuilt';
          tickConfirmed: number;
          agentId: string;
          planetId: string;
          facilityKey: string;
          facilityId: string;
          targetScale: number;
      }
    | {
          type: 'facilityExpanded';
          tickConfirmed: number;
          agentId: string;
          planetId: string;
          facilityId: string;
          targetScale: number;
      }
    | {
          type: 'facilityCancelled';
          agentId: string;
          planetId: string;
          facilityId: string;
      }
    | {
          type: 'facilityScaleChange';
          tickConfirmed: number;
          agentId: string;
          planetId: string;
          facilityId: string;
      };

// ── Context ──────────────────────────────────────────────────────────────────

type AgentPlanetKey = string; // `${agentId}|${planetId}`

type OverlayMap = Map<AgentPlanetKey, ActionOverlay[]>;

interface ActionOverlayContextValue {
    addOverlay: (overlay: ActionOverlay) => void;
    getOverlays: (agentId: string, planetId: string) => ActionOverlay[];
    resolveOverlays: (
        agentId: string,
        planetId: string,
        resolvedIds: Set<string>,
        snapshotFacilities: ProductionFacility[],
    ) => void;
    removeOverlayByFacilityId: (agentId: string, planetId: string, facilityId: string) => void;
}

const ActionOverlayContext = createContext<ActionOverlayContextValue>({
    addOverlay: () => {},
    getOverlays: () => [],
    resolveOverlays: () => {},
    removeOverlayByFacilityId: () => {},
});

// ── Provider ─────────────────────────────────────────────────────────────────

export function ActionOverlayProvider({ children }: { children: React.ReactNode }) {
    const [overlays, setOverlays] = useState<OverlayMap>(new Map());
    const overlaysRef = useRef(overlays);
    overlaysRef.current = overlays;

    const addOverlay = useCallback((overlay: ActionOverlay) => {
        const key = `${overlay.agentId}|${overlay.planetId}`;
        const next = new Map(overlaysRef.current);
        const existing = next.get(key) ?? [];
        next.set(key, [...existing, overlay]);
        overlaysRef.current = next;
        setOverlays(next);
    }, []);

    const getOverlays = useCallback((agentId: string, planetId: string): ActionOverlay[] => {
        const key = `${agentId}|${planetId}`;
        return overlaysRef.current.get(key) ?? [];
    }, []);

    const resolveOverlays = useCallback(
        (agentId: string, planetId: string, resolvedIds: Set<string>, snapshotFacilities: ProductionFacility[]) => {
            const key = `${agentId}|${planetId}`;
            const current = overlaysRef.current.get(key);
            if (!current || current.length === 0) {
                return;
            }

            // Build a set of facility IDs that are under construction in the snapshot
            const underConstructionIds = new Set<string>();
            for (const f of snapshotFacilities) {
                if (f.construction !== null) {
                    underConstructionIds.add(f.id);
                }
            }

            const remaining = current.filter((o) => {
                if (o.type === 'facilityBuilt') {
                    // Remove facilityBuilt overlays whose IDs are now in the snapshot (they're real)
                    return !resolvedIds.has(o.facilityId);
                }
                if (o.type === 'facilityCancelled') {
                    // Keep cancels only as long as the facility is still in the snapshot
                    return resolvedIds.has(o.facilityId);
                }
                if (o.type === 'facilityExpanded') {
                    // Remove once the real facility is under construction with the target scale
                    if (!resolvedIds.has(o.facilityId)) {
                        return true; // facility doesn't exist yet — keep overlay
                    }
                    const real = snapshotFacilities.find((f) => f.id === o.facilityId);
                    if (real && real.construction !== null) {
                        return false; // backend has started processing the expansion
                    }
                    return true; // still waiting
                }
                if (o.type === 'facilityScaleChange') {
                    // Remove once the facility exists in the snapshot (scale change reflected)
                    if (resolvedIds.has(o.facilityId)) {
                        return false;
                    }
                    return true;
                }
                return true;
            });
            if (remaining.length === current.length) {
                return;
            }
            const next = new Map(overlaysRef.current);
            if (remaining.length === 0) {
                next.delete(key);
            } else {
                next.set(key, remaining);
            }
            overlaysRef.current = next;
            setOverlays(next);
        },
        [],
    );

    const removeOverlayByFacilityId = useCallback((agentId: string, planetId: string, facilityId: string) => {
        const key = `${agentId}|${planetId}`;
        const current = overlaysRef.current.get(key);
        if (!current || current.length === 0) {
            return;
        }
        const remaining = current.filter(
            (o) => !('facilityId' in o) || (o as { facilityId: string }).facilityId !== facilityId,
        );
        if (remaining.length === current.length) {
            return;
        }
        const next = new Map(overlaysRef.current);
        if (remaining.length === 0) {
            next.delete(key);
        } else {
            next.set(key, remaining);
        }
        overlaysRef.current = next;
        setOverlays(next);
    }, []);

    return (
        <ActionOverlayContext.Provider value={{ addOverlay, getOverlays, resolveOverlays, removeOverlayByFacilityId }}>
            {children}
        </ActionOverlayContext.Provider>
    );
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useAddActionOverlay() {
    const ctx = useContext(ActionOverlayContext);
    return ctx.addOverlay;
}

/**
 * Returns overlays for a given agent/planet pair.
 * No tick-based filtering — the merge function (`applyFacilityOverlays`) handles dedup:
 * if the real snapshot data already contains the facility, the overlay is skipped.
 * This avoids a flicker where the overlay drops before the snapshot arrives.
 * Overlays accumulate harmlessly (one per build action) and are scoped to the agent/planet key.
 */
export function useActionOverlays(agentId: string, planetId: string): ActionOverlay[] {
    const ctx = useContext(ActionOverlayContext);
    return ctx.getOverlays(agentId, planetId);
}

export function useResolveActionOverlays() {
    const ctx = useContext(ActionOverlayContext);
    return ctx.resolveOverlays;
}

export function useRemoveOverlayByFacilityId() {
    const ctx = useContext(ActionOverlayContext);
    return ctx.removeOverlayByFacilityId;
}

// ── Merge helpers ────────────────────────────────────────────────────────────

/**
 * Builds a set of facilityIds that are cancelled by overlays,
 * so they can be filtered out after merging facilityBuilt overlays.
 */
function getCancelledIds(overlays: ActionOverlay[]): Set<string> {
    const ids = new Set<string>();
    for (const o of overlays) {
        if (o.type === 'facilityCancelled') {
            ids.add(o.facilityId);
        }
    }
    return ids;
}

export function applyFacilityOverlays(
    facilities: ProductionFacility[],
    overlays: ActionOverlay[],
    planetId: string,
): ProductionFacility[] {
    const cancelledIds = getCancelledIds(overlays);

    // Start with real facilities, minus any that are cancelled
    const result: ProductionFacility[] = [];
    for (const f of facilities) {
        if (!cancelledIds.has(f.id)) {
            result.push(f);
        }
    }

    // Apply facilityExpanded overlays — set construction on existing facilities
    for (const overlay of overlays) {
        if (overlay.type !== 'facilityExpanded') {
            continue;
        }

        if (cancelledIds.has(overlay.facilityId)) {
            continue;
        }

        // Find the facility in the result array
        const idx = result.findIndex((f) => f.id === overlay.facilityId);
        if (idx === -1) {
            continue;
        }

        const facility = result[idx];

        // Skip if the real facility already has construction (backend already processed it)
        if (facility.construction !== null) {
            continue;
        }

        const facilityType = getFacilityType(facility);
        const { cost, time } = calculateCostsForConstruction(facilityType, facility.maxScale, overlay.targetScale);

        // Clone to avoid mutating cache
        const updated = { ...facility };
        updated.construction = {
            type: 'expansion',
            progress: 0,
            constructionTargetMaxScale: overlay.targetScale,
            totalConstructionServiceRequired: cost,
            maximumConstructionServiceConsumption: cost / time,
            lastTickInvestedConstructionServices: 0,
        };
        result[idx] = updated;
    }

    // Add skeleton facilities from facilityBuilt overlays (unless cancelled)
    for (const overlay of overlays) {
        if (overlay.type !== 'facilityBuilt') {
            continue;
        }

        if (cancelledIds.has(overlay.facilityId)) {
            continue;
        }

        // Skip if the real data already has this facility
        if (facilities.some((f) => f.id === overlay.facilityId)) {
            continue;
        }

        const catalogEntry = facilityByName.get(overlay.facilityKey);
        if (!catalogEntry) {
            continue;
        }

        const facility = catalogEntry.factory(planetId, overlay.facilityId) as ProductionFacility;
        if (!facility) {
            continue;
        }

        const facilityType = getFacilityType(facility);
        const { cost, time } = calculateCostsForConstruction(facilityType, 0, overlay.targetScale);

        facility.construction = {
            type: 'new',
            progress: 0,
            constructionTargetMaxScale: overlay.targetScale,
            totalConstructionServiceRequired: cost,
            maximumConstructionServiceConsumption: cost / time,
            lastTickInvestedConstructionServices: 0,
        };
        facility.scale = 0;
        facility.maxScale = 0;

        result.push(facility);
    }

    return result;
}

/**
 * Checks if there is a pending action overlay (not yet reflected in snapshot) for a given facility.
 * Used by UI components to show a disabled/pending state while the action is being processed.
 */
export function hasPendingOverlay(overlays: ActionOverlay[], facilityId: string): boolean {
    for (const o of overlays) {
        if ('facilityId' in o && (o as { facilityId: string }).facilityId === facilityId) {
            return true;
        }
    }
    return false;
}
