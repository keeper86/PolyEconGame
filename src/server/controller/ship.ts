import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { findCompatibleTrades } from '../../simulation/ships/shipMarket';
import {
    workerAcceptShipBuyingOffer,
    workerAcceptShipListing,
    workerAcceptTransportContract,
    workerCancelShipListing,
    workerCancelTransportContract,
    workerDispatchShip,
    workerDispatchConstructionShip,
    workerPostShipBuyingOffer,
    workerPostShipListing,
    workerPostTransportContract,
} from '../../simulation/workerClient/commands';
import { workerQueries } from '../../simulation/workerClient/queries';
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

// --- Queries ---

export const listAgentShips = () =>
    protectedProcedure.input(z.object({ agentId: z.string().min(1) })).query(async ({ input, ctx }) => {
        const userId = getUserIdFromContext(ctx);
        await assertAgentOwnership(userId, input.agentId);
        const { agent } = await workerQueries.getAgent(input.agentId);
        if (!agent) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
        }
        return { ships: agent.ships ?? [] };
    });

export const listTransportContracts = () =>
    protectedProcedure.input(z.object({ planetId: z.string().min(1) })).query(async ({ input }) => {
        const { agents } = await workerQueries.getAllAgents();
        const contracts = (agents ?? []).flatMap((agent) => {
            const assets = agent.assets?.[input.planetId];
            return (assets?.transportContracts ?? []).map((c) => ({ ...c, _agentId: agent.id }));
        });
        return { contracts };
    });

export const listShipBuyingOffers = () =>
    protectedProcedure.input(z.object({ planetId: z.string().min(1) })).query(async ({ input }) => {
        const { agents } = await workerQueries.getAllAgents();
        const offers = (agents ?? []).flatMap((agent) => {
            const assets = agent.assets?.[input.planetId];
            return (assets?.shipBuyingOffers ?? []).map((o) => ({ ...o, _agentId: agent.id }));
        });
        return { offers };
    });

// --- Mutations ---

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
            const contractId = await workerPostTransportContract(input);
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
                shipName: z.string().min(1),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const contractId = await workerAcceptTransportContract(input);
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
            const contractId = await workerCancelTransportContract(input);
            return { contractId };
        });

export const dispatchShip = () =>
    protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                fromPlanetId: z.string().min(1),
                toPlanetId: z.string().min(1),
                shipName: z.string().min(1),
                cargoGoal: z
                    .object({
                        resourceName: z.string().min(1),
                        quantity: z.number().positive(),
                    })
                    .nullable(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const shipName = await workerDispatchShip(input);
            return { shipName };
        });

export const dispatchConstructionShip = () =>
    protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                fromPlanetId: z.string().min(1),
                toPlanetId: z.string().min(1),
                shipName: z.string().min(1),
                facilityName: z.string().min(1),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const shipName = await workerDispatchConstructionShip(input);
            return { shipName };
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
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const offerId = await workerPostShipBuyingOffer(input);
            return { offerId };
        });

export const acceptShipBuyingOffer = () =>
    protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                posterAgentId: z.string().min(1),
                offerId: z.string().min(1),
                shipName: z.string().min(1),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const offerId = await workerAcceptShipBuyingOffer(input);
            return { offerId };
        });

export const listShipListings = () =>
    protectedProcedure.input(z.object({ planetId: z.string().min(1) })).query(async ({ input }) => {
        const { agents } = await workerQueries.getAllAgents();
        const listings = (agents ?? []).flatMap((agent) => {
            const assets = agent.assets?.[input.planetId];
            return (assets?.shipListings ?? []).map((l) => ({ ...l, _agentId: agent.id }));
        });
        return { listings };
    });

export const getShipMarketHints = () =>
    protectedProcedure.input(z.object({ planetId: z.string().min(1) })).query(async ({ input: _input }) => {
        const [{ agents }, { shipCapitalMarket }] = await Promise.all([
            workerQueries.getAllAgents(),
            workerQueries.getShipCapitalMarket(),
        ]);
        const agentMap = new Map((agents ?? []).map((a) => [a.id, a]));
        const mockState = { tick: 0, planets: new Map(), agents: agentMap, shipCapitalMarket };
        const compatibleTrades = findCompatibleTrades(mockState);
        return { compatibleTrades: compatibleTrades.slice(0, 50) };
    });

export const getShipMarketHistory = () =>
    protectedProcedure.query(async () => {
        const { shipCapitalMarket } = await workerQueries.getShipCapitalMarket();
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
                shipName: z.string().min(1),
                askPrice: z.number().positive(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const listingId = await workerPostShipListing(input);
            return { listingId };
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
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const listingId = await workerCancelShipListing(input);
            return { listingId };
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
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.buyerAgentId);
            const listingId = await workerAcceptShipListing(input);
            return { listingId };
        });

export const getAgentPlanetStorage = () =>
    protectedProcedure
        .input(z.object({ agentId: z.string().min(1), planetId: z.string().min(1) }))
        .output(z.record(z.string(), z.number()))
        .query(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            await assertAgentOwnership(userId, input.agentId);
            const { agent } = await workerQueries.getAgent(input.agentId);
            if (!agent) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
            }
            const inStorage = agent.assets?.[input.planetId]?.storageFacility?.currentInStorage ?? {};
            const result: Record<string, number> = {};
            for (const [resourceName, entry] of Object.entries(inStorage)) {
                const qty = (entry as { quantity?: number })?.quantity ?? 0;
                if (qty > 0) {
                    result[resourceName] = qty;
                }
            }
            return result;
        });
