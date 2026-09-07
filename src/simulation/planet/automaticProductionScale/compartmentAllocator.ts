import type { Resource } from '../claims';
import type { StorageShell } from '../facility';

export type CompartmentNeed = {
    name: string;
    resource: Resource;
    usedVolume: number;
    usedMass: number;
    targetVolume: number;
    targetMass: number;
};

export type ShellCellResolution = {
    shares: Record<string, number>;
    feasible: boolean;
    freeShare: number;
};

export const emptyResolution = (): ShellCellResolution => ({ shares: {}, feasible: true, freeShare: 1 });

// Derive the physical occupancy (volume/mass) of every resident resource directly from the shell's
// own ledger, so "used" can never drift from what putIntoStorageFacility has actually accepted.
export const currentHoldingsByResource = (
    shell: StorageShell,
): Record<string, { name: string; resource: Resource; volume: number; mass: number }> => {
    const holdings: Record<string, { name: string; resource: Resource; volume: number; mass: number }> = {};
    for (const entry of Object.values(shell.currentInStorage)) {
        if (entry.quantity <= 0) {
            continue;
        }
        holdings[entry.resource.name] = {
            name: entry.resource.name,
            resource: entry.resource,
            volume: entry.quantity * entry.resource.volumePerQuantity,
            mass: entry.quantity * entry.resource.massPerQuantity,
        };
    }
    return holdings;
};

// Waterfill over a single shell's scalar compartment shares.
//
// Each cell gets a scalar share (0..1) of the whole shell; capacity on both the volume and the mass
// axis follows from that single share. A resource's binding axis is the larger of its volume/mass
// footprint over the shell's per-scale capacity.
//
// Feasible branch: every resource reaches its own declared target. Impossible branch (insufficient
// physical space): we "confiscate" the free storage -- every resource first keeps whichever share
// its current physical occupancy already locks in (a full compartment stays full), and the genuinely
// free space left over is waterfilled evenly across the compartments that can still grow, so no
// headroom sits idle behind a cell that can no longer accept inflow.
export const resolveShellCells = (
    needs: CompartmentNeed[],
    volCapPerScale: number,
    massCapPerScale: number,
    scale: number,
): ShellCellResolution => {
    const live = needs.filter((n) => n.resource.volumePerQuantity > 0 || n.resource.massPerQuantity > 0);
    if (live.length === 0 || volCapPerScale <= 0 || massCapPerScale <= 0 || scale <= 0) {
        return emptyResolution();
    }

    const volCap = volCapPerScale * scale;
    const massCap = massCapPerScale * scale;

    const shareFor = (volume: number, mass: number): number => {
        const byVolume = volume > 0 ? volume / volCap : 0;
        const byMass = mass > 0 ? mass / massCap : 0;
        return Math.max(byVolume, byMass);
    };

    const declared = live.map((n) => shareFor(n.targetVolume, n.targetMass));
    const declaredScale = declared.reduce((a, b) => a + b, 0);
    const anyOversized = declared.some((d) => d > 1);
    const feasible = !anyOversized && declaredScale <= 1 + 1e-9;

    const shares: Record<string, number> = {};
    let freeShare: number;

    if (feasible) {
        // Target-claim shares, floored by what is already physically occupying each cell so an
        // involution of production mix can never clamp away stock already in the compartment. Any
        // leftover stays unpartitioned as genuine free warehouse space for unplanned arrivals.
        let sum = 0;
        for (let i = 0; i < live.length; i++) {
            const locked = Math.min(1, shareFor(live[i].usedVolume, live[i].usedMass));
            shares[live[i].name] = Math.min(1, Math.max(declared[i], locked));
            sum += shares[live[i].name];
        }
        freeShare = Math.max(0, 1 - sum);
    } else {
        // Confiscation. Lock each cell to its occupied floor, then waterfill the shared remainder
        // across the still-growable cells only.
        const locked: number[] = live.map((n) => Math.min(1, shareFor(n.usedVolume, n.usedMass)));
        const lockedSum = locked.reduce((a, b) => a + b, 0);
        const sharedCap = Math.max(0, 1 - lockedSum);
        const growableCount = live.reduce((acc, n, i) => acc + (locked[i] < 1 ? 1 : 0), 0);
        const equalExtra = growableCount > 0 ? sharedCap / growableCount : 0;

        let sum = 0;
        for (let i = 0; i < live.length; i++) {
            const s = locked[i] < 1 ? Math.min(1, locked[i] + equalExtra) : locked[i];
            shares[live[i].name] = s;
            sum += s;
        }
        freeShare = Math.max(0, 1 - sum);
    }

    return { shares, feasible, freeShare };
};

// Convenience: build the needs array for a form's shell from the residency footprint of that form
// plus the resource quantities currently held in the shell.
export const compartmentNeedsFromFootprint = (
    shell: StorageShell,
    footprint: { name: string; resource: Resource; volume: number; mass: number }[],
): CompartmentNeed[] => {
    const holdings = currentHoldingsByResource(shell);
    return footprint
        .filter((r) => r.resource.volumePerQuantity > 0 || r.resource.massPerQuantity > 0)
        .map((r) => {
            const held = holdings[r.name] ?? { volume: 0, mass: 0 };
            return {
                name: r.name,
                resource: r.resource,
                targetVolume: r.volume,
                targetMass: r.mass,
                usedVolume: held.volume,
                usedMass: held.mass,
            } as CompartmentNeed;
        });
};
