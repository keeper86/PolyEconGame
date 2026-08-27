import type { BankruptcyRecord } from '../simulation/planet/planet';
import { getBankruptciesSync, getPlanetSync } from '../simulation/workerClient/syncQueries';

export type ResolvedBankruptcy = {
    agentId: string;
    agentName: string;
    planetId: string;
    planetName: string | null;
    tick: number;
    outcome: BankruptcyRecord['outcome'];
    message: string;
};

export function resolveBankruptcyForUser(agentId: string | null): ResolvedBankruptcy | null {
    if (!agentId) {
        return null;
    }
    const { bankruptcies } = getBankruptciesSync();
    const record = bankruptcies.find((r) => r.agentId === agentId);
    if (!record) {
        return null;
    }
    const { planet } = getPlanetSync(record.planetId);
    return {
        agentId: record.agentId,
        agentName: record.agentName,
        planetId: record.planetId,
        planetName: planet?.name ?? null,
        tick: record.tick,
        outcome: record.outcome,
        message: record.message,
    };
}
