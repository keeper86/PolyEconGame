import { RESOURCES_BY_NAME } from '../../simulation/planet/resourceCatalog';
import { getWholeStorage, queryStorageFacility } from '../../simulation/planet/facility';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
    workerAcceptShipBuyingOffer,
    workerAcceptShipListing,
    workerAcceptTransportContract,
    workerCancelShipListing,
    workerCancelTransportContract,
    workerDispatchConstructionShip,
    workerDispatchPassengerShip,
    workerDispatchShip,
    workerPostShipBuyingOffer,
    workerPostShipListing,
    workerPostTransportContract,
} from '../../simulation/workerClient/commands';
import { getAgentSync, getAllAgentsSync, getShipCapitalMarketSync } from '../../simulation/workerClient/syncQueries';
import { db } from '../db';
import { getUserIdFromContext, protectedProcedure } from '../trpcRoot';

async function assertAgentOwnership(userId: string, agentId: string): Promise<void> {
    const row = await db('user_data').where({ user_id: userId }).first();
    if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }
    if (row.agent_id !== agentId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
    }
}

export const listAgentShips = () =>
    protectedProcedure.input(z.object({ agentId: z.string().min(1) })).query(async ({ input, ctx }) => {
        const userId = getUserIdFromContext(ctx);
        await assertAgentOwnership(userId, input.agentId);
        const { agent } = getAgentSync(input.agentId);
        if (!agent) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
        }
        return { ships: agent.ships };
    });

export const listTransportContracts = () =>
    protectedProcedure.input(z.object({ planetId: z.string().min(1) })).query(async ({ input }) => {
        const { agents } = getAllAgentsSync();
        const contracts = (agents ?? []).flatMap((agent) => {
            const assets = agent.assets?.[input.planetId];
            return (assets?.transportContracts ?? []).map((c) => ({ ...c, _agentId: agent.id }));
        });
        return { contracts };
    });

export const listShipBuyingOffers = () =>
    protectedProcedure.input(z.object({ planetId: z.string().min(1) })).query(async ({ input }) => {
        const { agents } = getAllAgentsSync();
        const offers = (agents ?? []).flatMap((agent) => {
            const assets = agent.assets?.[input.planetId];
            return (assets?.shipBuyingOffers ?? []).map((o) => ({ ...o, _agentId: agent.id }));
        });
        return { offers };
    });

export const postTransportContract = () =>
    protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                toPlanetId: z.string().min(1),
                cargo: z.object({ resourceName: z.string().min(1), quantity: z.number().positive() }),
                maxDurationInTicks: z.number().int().positive(),
                offeredReward: z.number().nonnegative(),
                expiresAtTick: z.number().int().positive(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const resource = RESOURCES_BY_NAME.get(input.cargo.resourceName);
            if (!resource) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid resource name' });
            }
            const { result: contractId } = await workerPostTransportContract({
                ...input,
                cargo: { ...input.cargo, resource },
            });
            return { contractId };
        });

export const acceptTransportContract = () =>
    protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                posterAgentId: z.string().min(1),
                contractId: z.string().min(1),
                shipId: z.string().min(1),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const { result: contractId } = await workerAcceptTransportContract(input);
            return { contractId };
        });

export const cancelTransportContract = () =>
    protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                contractId: z.string().min(1),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const { result: contractId } = await workerCancelTransportContract(input);
            return { contractId };
        });

export const dispatchShip = () =>
    protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                fromPlanetId: z.string().min(1),
                toPlanetId: z.string().min(1),
                shipId: z.string().min(1),
                cargoGoal: z
                    .object({
                        resourceName: z.string().min(1),
                        quantity: z.number().positive(),
                    })
                    .nullable(),
            }),
        )
        .output(z.object({ shipId: z.string(), processedAtTick: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            if (input.cargoGoal) {
                const resource = RESOURCES_BY_NAME.get(input.cargoGoal.resourceName);
                if (!resource) {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid resource name in cargo goal' });
                }
                const { result: shipId, processedAtTick } = await workerDispatchShip({
                    ...input,
                    cargoGoal: { ...input.cargoGoal, resource },
                });
                return { shipId, processedAtTick };
            } else {
                const { result: shipId, processedAtTick } = await workerDispatchShip({ ...input, cargoGoal: null });
                return { shipId, processedAtTick };
            }
        });

export const dispatchConstructionShip = () =>
    protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                fromPlanetId: z.string().min(1),
                toPlanetId: z.string().min(1),
                shipId: z.string().min(1),
                facilityName: z.string().min(1).optional(),
            }),
        )
        .output(z.object({ shipId: z.string(), processedAtTick: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const { result: shipId, processedAtTick } = await workerDispatchConstructionShip(input);
            return { shipId, processedAtTick };
        });

export const dispatchPassengerShip = () =>
    protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                fromPlanetId: z.string().min(1),
                toPlanetId: z.string().min(1),
                shipId: z.string().min(1),
                passengerCount: z.number().int().min(0),
            }),
        )
        .output(z.object({ shipId: z.string(), processedAtTick: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const { result: shipId, processedAtTick } = await workerDispatchPassengerShip(input);
            return { shipId, processedAtTick };
        });

export const postShipBuyingOffer = () =>
    protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                shipType: z.string().min(1),
                price: z.number().positive(),
            }),
        )
        .output(z.object({ offerId: z.string(), processedAtTick: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const { result: offerId, processedAtTick } = await workerPostShipBuyingOffer(input);
            return { offerId, processedAtTick };
        });

export const acceptShipBuyingOffer = () =>
    protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                posterAgentId: z.string().min(1),
                offerId: z.string().min(1),
                shipId: z.string().min(1),
            }),
        )
        .output(z.object({ offerId: z.string(), processedAtTick: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const { result: offerId, processedAtTick } = await workerAcceptShipBuyingOffer(input);
            return { offerId, processedAtTick };
        });

export const listShipListings = () =>
    protectedProcedure.input(z.object({ planetId: z.string().min(1) })).query(async ({ input }) => {
        const { agents } = getAllAgentsSync();
        const listings = (agents ?? []).flatMap((agent) => {
            const assets = agent.assets?.[input.planetId];
            return (assets?.shipListings ?? []).map((l) => {
                const ship = agent.ships?.find((s) => s.id === l.shipId);
                return {
                    ...l,
                    _agentId: agent.id,
                    maintainanceStatus: ship?.maintainanceStatus,
                    maxMaintenance: ship?.maxMaintenance,
                };
            });
        });
        return { listings };
    });

export const getShipMarketHistory = () =>
    protectedProcedure.query(async () => {
        const { shipCapitalMarket } = getShipCapitalMarketSync();
        return {
            emaPrice: shipCapitalMarket.emaPrice,
            recentTrades: shipCapitalMarket.tradeHistory.slice(-50),
        };
    });

export const postShipListing = () =>
    protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                shipId: z.string().min(1),
                askPrice: z.number().positive(),
            }),
        )
        .output(z.object({ listingId: z.string(), processedAtTick: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const { result: listingId, processedAtTick } = await workerPostShipListing(input);
            return { listingId, processedAtTick };
        });

export const cancelShipListing = () =>
    protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                listingId: z.string().min(1),
            }),
        )
        .output(z.object({ listingId: z.string(), processedAtTick: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const { result: listingId, processedAtTick } = await workerCancelShipListing(input);
            return { listingId, processedAtTick };
        });

export const acceptShipListing = () =>
    protectedProcedure
        .input(
            z.object({
                buyerAgentId: z.string().min(1),
                buyerPlanetId: z.string().min(1),
                sellerAgentId: z.string().min(1),
                listingId: z.string().min(1),
            }),
        )
        .output(z.object({ listingId: z.string(), processedAtTick: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.buyerAgentId);
            const { result: listingId, processedAtTick } = await workerAcceptShipListing(input);
            return { listingId, processedAtTick };
        });

export const getAgentPlanetStorage = () =>
    protectedProcedure
        .input(z.object({ agentId: z.string().min(1), planetId: z.string().min(1) }))
        .output(z.record(z.string(), z.number()))
        .query(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const { agent } = getAgentSync(input.agentId);
            if (!agent) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
            }
            const storage = agent.assets?.[input.planetId]?.storage;
            const result: Record<string, number> = {};
            if (storage) {
                for (const [resourceName] of getWholeStorage(storage)) {
                    const qty = queryStorageFacility(storage, resourceName);
                    if (qty > 0) {
                        result[resourceName] = qty;
                    }
                }
            }
            return result;
        });
