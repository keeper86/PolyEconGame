import { NOTICE_PERIOD_MONTHS } from '../constants';
import { processFacilityContraction } from '../agents/recycler';
import { collectAgentFacilities } from '../planet/facilityMaintenance';
import type { Agent, GameState, Planet } from '../planet/planet';
import { pushTickerEvent, pushBankruptcyRecord } from '../planet/planet';
import { mergeClaimBackIntoPool } from '../planet/claims';
import { transferPopulation } from '../population/population';
import { forEachWorkforceCohort } from '../workforce/workforce';
import { totalOutstandingLoans } from './loanTypes';

function writeOffLoans(gameState: GameState, agent: Agent): void {
    for (const [planetId, assets] of Object.entries(agent.assets)) {
        const bank = gameState.planets.get(planetId)?.bank;
        if (!bank) {
            continue;
        }
        const debt = totalOutstandingLoans(assets.activeLoans);
        if (debt > 0) {
            bank.writeOffs += debt;
            bank.loans -= debt;
        }
        assets.activeLoans = [];
    }
}

function returnWorkersToPopulation(gameState: GameState, agent: Agent): void {
    for (const [planetId, assets] of Object.entries(agent.assets)) {
        const planet = gameState.planets.get(planetId);
        const workforce = assets.workforceDemography;
        if (!planet || !workforce) {
            continue;
        }

        for (let age = 0; age < workforce.length; age++) {
            forEachWorkforceCohort(workforce[age], (category, edu) => {
                const departing =
                    category.voluntaryDeparting.reduce((sum, count) => sum + count, 0) +
                    category.departingFired.reduce((sum, count) => sum + count, 0);
                const retired = category.departingRetired.reduce((sum, count) => sum + count, 0);
                const onboarding = category.onboarding.reduce((sum, count) => sum + count, 0);

                const activeTotal = category.active + onboarding + departing;
                if (activeTotal > 0) {
                    transferPopulation(
                        planet,
                        { age, occ: 'employed', edu },
                        { age, occ: 'unoccupied', edu },
                        activeTotal,
                    );
                }
                if (retired > 0) {
                    transferPopulation(
                        planet,
                        { age, occ: 'employed', edu },
                        { age, occ: 'unableToWork', edu },
                        retired,
                    );
                }

                category.active = 0;
                category.onboarding = Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0);
                category.voluntaryDeparting = Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0);
                category.departingFired = Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0);
                category.departingRetired = Array.from({ length: NOTICE_PERIOD_MONTHS }, () => 0);
            });
        }
    }
}

function releaseClaims(gameState: GameState, agent: Agent): void {
    for (const planet of gameState.planets.values()) {
        for (const entry of Object.values(planet.resources)) {
            for (const claim of entry.claims) {
                if (claim.tenantAgentId === agent.id) {
                    mergeClaimBackIntoPool(entry.pool, claim);
                }
            }
            entry.claims = entry.claims.filter((claim) => claim.tenantAgentId !== agent.id);
        }
    }
}

function settleCounterpartyPostings(gameState: GameState, agentId: string): void {
    for (const agent of gameState.agents.values()) {
        for (const assets of Object.values(agent.assets)) {
            for (const contract of assets.transportContracts) {
                if (contract.status === 'accepted' && contract.acceptedByAgentId === agentId) {
                    assets.transportContracts[assets.transportContracts.indexOf(contract)] = {
                        id: contract.id,
                        fromPlanetId: contract.fromPlanetId,
                        toPlanetId: contract.toPlanetId,
                        cargo: contract.cargo,
                        maxDurationInTicks: contract.maxDurationInTicks,
                        offeredReward: contract.offeredReward,
                        postedByAgentId: contract.postedByAgentId,
                        expiresAtTick: contract.expiresAtTick,
                        status: 'open',
                    };
                }
            }
            for (const contract of assets.constructionContracts) {
                if (contract.status === 'accepted' && contract.acceptedByAgentId === agentId) {
                    assets.constructionContracts[assets.constructionContracts.indexOf(contract)] = {
                        id: contract.id,
                        fromPlanetId: contract.fromPlanetId,
                        toPlanetId: contract.toPlanetId,
                        facilityName: contract.facilityName,
                        commissioningAgentId: contract.commissioningAgentId,
                        offeredReward: contract.offeredReward,
                        postedByAgentId: contract.postedByAgentId,
                        expiresAtTick: contract.expiresAtTick,
                        status: 'open',
                    };
                }
            }
            for (const offer of assets.shipBuyingOffers) {
                if (offer.status === 'accepted' && offer.sellerAgentId === agentId) {
                    assets.shipBuyingOffers[assets.shipBuyingOffers.indexOf(offer)] = {
                        id: offer.id,
                        shipType: offer.shipType,
                        buyerAgentId: offer.buyerAgentId,
                        price: offer.price,
                        status: 'open',
                    };
                }
            }
        }
    }
}

function transferCashToBank(gameState: GameState, agent: Agent): void {
    for (const [planetId, assets] of Object.entries(agent.assets)) {
        const bank = gameState.planets.get(planetId)?.bank;
        if (!bank) {
            continue;
        }
        const total = assets.deposits + assets.depositHold;
        if (total > 0) {
            bank.deposits -= total;
            bank.profit += total;
        }
        assets.deposits = 0;
        assets.depositHold = 0;
    }
}

export function liquidateAgent(gameState: GameState, planet: Planet, agent: Agent, tick: number): null {
    writeOffLoans(gameState, agent);
    planet.bank.bankruptcies += 1;

    for (const [planetId, assets] of Object.entries(agent.assets)) {
        const targetPlanet = gameState.planets.get(planetId);
        if (!targetPlanet) {
            continue;
        }
        for (const facility of collectAgentFacilities(assets)) {
            processFacilityContraction(targetPlanet, facility, agent, 0, gameState, 0, 1, 'bank');
        }
    }

    releaseClaims(gameState, agent);
    returnWorkersToPopulation(gameState, agent);
    transferCashToBank(gameState, agent);
    settleCounterpartyPostings(gameState, agent.id);

    gameState.agents.delete(agent.id);

    pushBankruptcyRecord(gameState, {
        agentId: agent.id,
        agentName: agent.name,
        planetId: planet.id,
        tick,
        outcome: 'liquidated',
        message: `${agent.name} bankrupt; company dissolved and assets liquidated by the receiver`,
    });

    pushTickerEvent(gameState, {
        category: 'agentBankrupt',
        planetId: planet.id,
        agentId: agent.id,
        agentName: agent.name,
        message: `${agent.name} bankrupt; company dissolved`,
        tick,
    });

    return null;
}
