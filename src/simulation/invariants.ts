import type { Agent, AgentPlanetAssets, GameState, Planet } from './planet/planet';
import { educationLevelKeys } from './population/education';
import { SKILL, forEachPopulationCohort } from './population/population';

export function checkPopulationWorkforceConsistency(
    agents: Map<string, Agent>,
    planets: Map<string, Planet>,
): string[] {
    const discrepancies: string[] = [];

    for (const [planetId, planet] of planets) {
        for (const edu of educationLevelKeys) {
            let popEmployed = 0;
            for (const cohort of planet.population.demography) {
                for (const skill of SKILL) {
                    popEmployed += cohort.employed[edu][skill].total;
                }
            }

            let wfTotal = 0;
            for (const agent of agents.values()) {
                const wf = agent.assets[planetId]?.workforceDemography;
                if (!wf) {
                    continue;
                }
                for (let age = 0; age < wf.length; age++) {
                    for (const skill of SKILL) {
                        const cell = wf[age][edu][skill];
                        wfTotal += cell.active;
                        for (const d of cell.voluntaryDeparting) {
                            wfTotal += d;
                        }
                    }
                }
            }

            if (popEmployed !== wfTotal) {
                discrepancies.push(
                    `planet=${planetId} edu=${edu}: population(employed)=${popEmployed} ≠ workforce=${wfTotal}`,
                );
            }
        }
    }

    return discrepancies;
}

export function checkAgeMomentConsistency(agents: Map<string, Agent>, planets: Map<string, Planet>): string[] {
    const discrepancies: string[] = [];

    for (const [planetId, planet] of planets) {
        for (let age = 0; age < planet.population.demography.length; age++) {
            forEachPopulationCohort(planet.population.demography[age], (cat, occ, edu, skill) => {
                if (cat.total < 0) {
                    discrepancies.push(
                        `planet=${planetId} age=${age} occ=${occ} edu=${edu} skill=${skill}: negative total=${cat.total}`,
                    );
                }
                if (Number.isNaN(cat.wealth.mean) || Number.isNaN(cat.wealth.variance)) {
                    discrepancies.push(
                        `planet=${planetId} age=${age} occ=${occ} edu=${edu} skill=${skill}: NaN wealth moments`,
                    );
                }
                if (cat.wealth.variance < 0) {
                    discrepancies.push(
                        `planet=${planetId} age=${age} occ=${occ} edu=${edu} skill=${skill}: negative variance=${cat.wealth.variance}`,
                    );
                }
            });
        }
    }

    return discrepancies;
}

export function checkMonetaryConservation(
    agents: Map<string, Agent>,
    planets: Map<string, Planet>,
    tolerance = 0.0001,
    forexMarketMakers?: Map<string, Agent>,
    shipbuilderAgents?: Map<string, Agent>,
    arbitrageTraders?: Map<string, Agent>,
): string[] {
    const discrepancies: string[] = [];

    for (const [planetId, planet] of planets) {
        const bank = planet.bank;

        let firmDeposits = 0;
        let totalDepositHold = 0;
        let c = 0;

        // Helper to robustly sum deposits including depositHold
        function addFirm(assets: AgentPlanetAssets | undefined): void {
            if (!assets) {
                return;
            }
            const total = assets.deposits ?? 0;
            if (total !== 0) {
                const d = total - c;
                const t = firmDeposits + d;
                c = t - firmDeposits - d;
                firmDeposits = t;
            }
            totalDepositHold += assets.depositHold ?? 0;
        }

        for (const agent of agents.values()) {
            addFirm(agent.assets[planetId]);
        }
        if (forexMarketMakers) {
            for (const mm of forexMarketMakers.values()) {
                addFirm(mm.assets[planetId]);
            }
        }
        if (shipbuilderAgents) {
            for (const sb of shipbuilderAgents.values()) {
                addFirm(sb.assets[planetId]);
            }
        }
        if (arbitrageTraders) {
            for (const at of arbitrageTraders.values()) {
                addFirm(at.assets[planetId]);
            }
        }

        // depositHold was subtracted from agent.deposits but still sits in bank.deposits
        const effectiveFirmDeposits = firmDeposits + totalDepositHold;
        const depositSum = effectiveFirmDeposits + bank.householdDeposits;
        const depositDiff =
            bank.deposits === 0 && depositSum === 0
                ? 0
                : bank.deposits === 0
                  ? Math.abs(depositSum)
                  : Math.abs(1 - depositSum / bank.deposits);

        if (depositDiff > tolerance) {
            discrepancies.push(
                `planet=${planetId}: deposit decomposition violated: ` +
                    `bank.deposits=${bank.deposits.toFixed(4)}, ` +
                    `firmDeposits=${firmDeposits.toFixed(4)}, ` +
                    `householdDeposits=${bank.householdDeposits.toFixed(4)}, ` +
                    `relDiff=${depositDiff.toFixed(6)}`,
            );
        }

        const residual = bank.householdDeposits + effectiveFirmDeposits - bank.loans;
        const residualRel =
            bank.loans === 0 && residual === 0
                ? 0
                : bank.loans === 0
                  ? Math.abs(residual)
                  : Math.abs(residual / bank.loans);

        if (residualRel > tolerance) {
            discrepancies.push(
                `planet=${planetId}: monetary conservation violated: ` +
                    `householdDeposits + firmDeposits - loans = ${residual.toFixed(4)}, ` +
                    `loans=${bank.loans.toFixed(4)}, relResidual=${residualRel.toFixed(6)}`,
            );
        }
    }

    return discrepancies;
}

export type WealthBankDiscrepancy = {
    planetId: string;
    planetName: string;
    householdDeposits: number;
    populationWealth: number;
    diff: number;
    totalPopulation: number;

    diffPerCapita: number;
};

export function checkWealthBankConsistency(planets: Map<string, Planet>, tolerance?: number): WealthBankDiscrepancy[];
export function checkWealthBankConsistency(
    planets: Map<string, Planet>,
    name: string,
    tolerance?: number,
): WealthBankDiscrepancy[];

export function checkWealthBankConsistency(
    planets: Map<string, Planet>,
    nameOrTolerance: string | number = 'checkWealthBankConsistency',
    maybeTolerance = 0.0001,
): WealthBankDiscrepancy[] {
    let name: string;
    let tolerance: number;
    if (typeof nameOrTolerance === 'string') {
        name = nameOrTolerance;
        tolerance = maybeTolerance;
    } else {
        name = 'checkWealthBankConsistency';
        tolerance = nameOrTolerance;
    }
    const discrepancies: WealthBankDiscrepancy[] = [];

    for (const [planetId, planet] of planets) {
        const bank = planet.bank;
        const demography = planet.population.demography;

        if (bank.householdDeposits < 0) {
            console.warn(
                `[checkWealthBankConsistency] ${name} planet=${planetId} has negative householdDeposits=${bank.householdDeposits.toFixed(4)}`,
            );
            discrepancies.push({
                planetId,
                planetName: planet.name,
                householdDeposits: bank.householdDeposits,
                populationWealth: NaN,
                diff: NaN,
                totalPopulation: NaN,
                diffPerCapita: NaN,
            });
            continue;
        }

        let totalWealth = 0;
        let totalPopulation = 0;
        for (const cohort of demography) {
            forEachPopulationCohort(cohort, (cat) => {
                if (Number.isNaN(cat.wealth.mean) || Number.isNaN(cat.wealth.variance)) {
                    discrepancies.push({
                        planetId,
                        planetName: planet.name,
                        householdDeposits: bank.householdDeposits,
                        populationWealth: NaN,
                        diff: NaN,
                        totalPopulation: NaN,
                        diffPerCapita: NaN,
                    });
                    console.warn(
                        `[checkWealthBankConsistency] ${name} planet=${planetId} has NaN wealth moments in population category, cat=${JSON.stringify(
                            cat,
                        )}`,
                    );
                    return;
                }
                if (cat.total > 0) {
                    totalWealth += cat.total * cat.wealth.mean;
                    totalPopulation += cat.total;
                }
            });
        }

        if (totalWealth < 0) {
            discrepancies.push({
                planetId,
                planetName: planet.name,
                householdDeposits: bank.householdDeposits,
                populationWealth: totalWealth,
                diff: NaN,
                totalPopulation,
                diffPerCapita: NaN,
            });
            console.warn(
                `[checkWealthBankConsistency] ${name} planet=${planetId} has negative totalPopulationWealth=${totalWealth.toFixed(4)}`,
            );
            continue;
        }

        if (totalPopulation === 0) {
            continue;
        }

        if (bank.householdDeposits === 0) {
            if (totalWealth === 0) {
                continue;
            }

            discrepancies.push({
                planetId,
                planetName: planet.name,
                householdDeposits: 0,
                populationWealth: totalWealth,
                diff: 1,
                totalPopulation,
                diffPerCapita: totalPopulation > 0 ? totalWealth / totalPopulation : 0,
            });
            continue;
        }

        const diff = (bank.householdDeposits - totalWealth) / bank.householdDeposits;
        if (diff > tolerance) {
            discrepancies.push({
                planetId,
                planetName: planet.name,
                householdDeposits: bank.householdDeposits,
                populationWealth: totalWealth,
                diff,
                totalPopulation,
                diffPerCapita: totalPopulation > 0 ? diff / totalPopulation : 0,
            });
        }
    }

    return discrepancies;
}

export function checkTransportPipeline(gameState: GameState): string[] {
    const discrepancies: string[] = [];
    const PIPELINE_EPSILON = 1e-9;

    const expected = new Map<string, Map<string, number>>();
    for (const agent of gameState.agents.values()) {
        for (const ship of agent.ships) {
            const s = ship.state;
            if (s.type !== 'transporting') {
                continue;
            }
            if (!s.cargo || s.cargo.quantity <= 0) {
                continue;
            }
            let byResource = expected.get(s.to);
            if (!byResource) {
                byResource = new Map<string, number>();
                expected.set(s.to, byResource);
            }
            byResource.set(s.cargo.resource.name, (byResource.get(s.cargo.resource.name) ?? 0) + s.cargo.quantity);
        }
    }

    for (const [planetId, planet] of gameState.planets) {
        const byResource = expected.get(planetId);
        const pipeline = planet.transportPipeline;

        if (byResource) {
            for (const [resourceName, expectedQty] of byResource) {
                const stored = pipeline[resourceName]?.quantity ?? 0;
                if (Math.abs(stored - expectedQty) > PIPELINE_EPSILON) {
                    discrepancies.push(
                        `planet=${planetId} resource=${resourceName}: ` +
                            `transportPipeline=${stored.toFixed(4)} ≠ expected=${expectedQty.toFixed(4)}`,
                    );
                }
            }
        }

        for (const [resourceName, entry] of Object.entries(pipeline)) {
            if (!entry || entry.quantity <= PIPELINE_EPSILON) {
                continue;
            }
            const expectedQty = byResource?.get(resourceName) ?? 0;
            if (entry.quantity - expectedQty > PIPELINE_EPSILON) {
                discrepancies.push(
                    `planet=${planetId} resource=${resourceName}: ` +
                        `phantom pipeline entry: transportPipeline=${entry.quantity.toFixed(4)}, expected=${expectedQty.toFixed(4)}`,
                );
            }
        }
    }

    return discrepancies;
}
