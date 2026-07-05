import type { MonthlyReport } from './types';

/**
 * Simple in-memory ring buffer storing the last N monthly reports.
 * The news agent uses this to compare current vs previous month.
 */
const MAX_HISTORY = 12; // Keep one year of monthly reports

class NewsMemory {
    private history: MonthlyReport[] = [];

    /**
     * Store a new monthly report. Automatically prunes old entries.
     */
    store(report: MonthlyReport): void {
        this.history.push(report);
        if (this.history.length > MAX_HISTORY) {
            this.history = this.history.slice(-MAX_HISTORY);
        }
    }

    /**
     * Get the current (most recently stored) report.
     */
    getCurrent(): MonthlyReport | null {
        if (this.history.length === 0) {
            return null;
        }
        return this.history[this.history.length - 1];
    }

    /**
     * Clear all stored history.
     */
    clear(): void {
        this.history = [];
    }

    /**
     * Get number of stored reports.
     */
    get size(): number {
        return this.history.length;
    }
}

// Singleton instance — the news agent is global across all planets
export const newsMemory = new NewsMemory();
