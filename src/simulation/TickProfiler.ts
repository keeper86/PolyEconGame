import { performance } from 'node:perf_hooks';

type TickPhase = {
    total: number; // cumulative ms for this phase across all calls
    calls: number; // how many times the phase was entered
    label: string;
};

export class TickProfiler {
    private phases = new Map<string, TickPhase>();
    private enabled: boolean;

    constructor(enabled: boolean) {
        this.enabled = enabled;
    }

    get isEnabled(): boolean {
        return this.enabled;
    }

    /** Reset all accumulated phase data. */
    clear(): void {
        this.phases.clear();
    }

    /**
     * Call at the start of a measured block.
     * Returns a timestamp token to pass to `markAndAccum`.
     */
    mark(): number {
        return this.enabled ? performance.now() : 0;
    }

    /**
     * End the block started at `since` and accumulate the result into `key`.
     * Returns the current `performance.now()` so it can be used as the next `since`.
     */
    markAndAccum(key: string, label: string, since: number): number {
        if (!this.enabled) return since;
        const now = performance.now();
        let p = this.phases.get(key);
        if (!p) {
            p = { total: 0, calls: 0, label };
            this.phases.set(key, p);
        }
        p.total += now - since;
        p.calls += 1;
        return now;
    }

    /**
     * Log a sorted breakdown of all accumulated phases to the console.
     */
    logBreakdown(tick: number, elapsedMs: number): void {
        if (!this.enabled || this.phases.size === 0) {
            return;
        }

        const lines: string[] = [];
        lines.push(`[profile] Tick ${tick} breakdown (total ${elapsedMs.toFixed(1)}ms):`);

        // Sort by total descending
        const sorted = [...this.phases.entries()].sort((a, b) => b[1].total - a[1].total);

        let accounted = 0;
        for (const [_key, p] of sorted) {
            const avgMs = p.calls > 0 ? (p.total / p.calls).toFixed(3) : '-';
            const totalPct = elapsedMs > 0 ? ((p.total / elapsedMs) * 100).toFixed(1) : '-';
            lines.push(
                `  ${p.label.padEnd(42)} total=${p.total.toFixed(2).padStart(8)}ms  avg=${avgMs.padStart(8)}ms  calls=${p.calls}  ${totalPct}%`,
            );
            accounted += p.total;
        }

        const rest = Math.max(0, elapsedMs - accounted);
        lines.push(`  ${'[unaccounted overhead]'.padEnd(42)} total=${rest.toFixed(2).padStart(8)}ms`);

        for (const line of lines) {
            console.log(line);
        }
    }
}