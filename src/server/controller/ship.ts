import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../db';
import { getUserIdFromContext, protectedProcedure } from '../trpcRoot';
import {
    workerPostTransportContract,
    workerAcceptTransportContract,
    workerCancelTransportContract,
    workerPostShipBuyingOffer,
    workerAcceptShipBuyingOffer,
} from '../../simulation/workerClient/commands';
import { workerQueries } from '../../simulation/workerClient/queries';

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
        return { ships: agent.transportShips ?? [] };
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
