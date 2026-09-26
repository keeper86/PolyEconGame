import { rankRecipients, type RecipientCandidate } from '@/lib/recipientSearch';
import { getAllAgentsSync } from '@/simulation/workerClient/syncQueries';
import type { Messages } from '@/types/db_schemas';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import { db } from '../db';
import { getUserIdFromContext, protectedProcedure } from '../trpcRoot';

const RECIPIENT_SCAN_LIMIT = 2000;

const pagination = z.object({
    limit: z.number().int().min(1).max(100).default(25),
    offset: z.number().int().min(0).default(0),
});

const messageSummary = z.object({
    id: z.string(),
    subject: z.string(),
    body: z.string(),
    createdAt: z.string(),
    readAt: z.string().nullable(),
    counterpartUserId: z.string(),
    counterpartDisplayName: z.string().nullable(),
    counterpartAvatar: z.string().nullable(),
    counterpartCompanyName: z.string().nullable(),
});
export type MessageSummary = z.infer<typeof messageSummary>;

type Counterpart = {
    displayName: string | null;
    avatar: string | null;
    agentId: string | null;
};

const companyNames = (): Map<string, string> => {
    const { agents } = getAllAgentsSync();
    return new Map(agents.map((agent) => [agent.id, agent.name]));
};

const loadCounterparts = async (userIds: string[]): Promise<Map<string, Counterpart>> => {
    if (userIds.length === 0) {
        return new Map();
    }
    const rows = await db('user_data').whereIn('user_id', userIds);
    return new Map(
        rows.map((row) => [
            row.user_id,
            {
                displayName: row.display_name,
                avatar: row.avatar ? row.avatar.toString('base64') : null,
                agentId: row.agent_id,
            },
        ]),
    );
};

const toSummaries = async (rows: Messages[], mineIsRecipient: boolean): Promise<MessageSummary[]> => {
    const counterpartIds = rows.map((row) => (mineIsRecipient ? row.sender_user_id : row.recipient_user_id));
    const counterparts = await loadCounterparts(counterpartIds);
    const companies = companyNames();

    return rows.map((row) => {
        const counterpartUserId = mineIsRecipient ? row.sender_user_id : row.recipient_user_id;
        const counterpart = counterparts.get(counterpartUserId);
        return {
            id: row.id,
            subject: row.subject,
            body: row.body,
            createdAt: row.created_at.toISOString(),
            readAt: row.read_at ? row.read_at.toISOString() : null,
            counterpartUserId,
            counterpartDisplayName: counterpart?.displayName ?? null,
            counterpartAvatar: counterpart?.avatar ?? null,
            counterpartCompanyName: counterpart?.agentId ? (companies.get(counterpart.agentId) ?? null) : null,
        };
    });
};

const listMessages = async (
    direction: 'inbox' | 'sent',
    userId: string,
    input: { limit: number; offset: number },
): Promise<{ messages: MessageSummary[]; total: number }> => {
    const column = direction === 'inbox' ? 'recipient_user_id' : 'sender_user_id';
    const base = db('messages').where(column, userId);

    const totalRow = await base.clone().count<{ count: string }>('* as count').first();
    const rows = await base.clone().orderBy('created_at', 'desc').offset(input.offset).limit(input.limit);

    return {
        messages: await toSummaries(rows, direction === 'inbox'),
        total: totalRow ? Number(totalRow.count) : 0,
    };
};

export const listRecipients = () => {
    return protectedProcedure
        .input(
            z.object({
                search: z.string().optional().default(''),
                limit: z.number().int().min(1).max(100).default(25),
            }),
        )
        .output(
            z.object({
                recipients: z.array(
                    z.object({
                        userId: z.string(),
                        displayName: z.string().nullable(),
                        companyName: z.string().nullable(),
                    }),
                ),
            }),
        )
        .query(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            const rows = await db('user_data')
                .whereNot('user_id', userId)
                .select('user_id', 'display_name', 'agent_id')
                .orderBy('display_name')
                .limit(RECIPIENT_SCAN_LIMIT);
            const companies = companyNames();

            const candidates: RecipientCandidate[] = rows.map((row) => ({
                userId: row.user_id,
                displayName: row.display_name,
                companyName: row.agent_id ? (companies.get(row.agent_id) ?? null) : null,
            }));

            return { recipients: rankRecipients(candidates, input.search, input.limit) };
        });
};

export const sendMessage = () => {
    return protectedProcedure
        .input(
            z.object({
                recipientUserId: z.string().min(1),
                subject: z.string().min(1).max(200),
                body: z.string().min(1).max(5000),
            }),
        )
        .output(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const senderUserId = getUserIdFromContext(ctx);

            if (input.recipientUserId === senderUserId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot send a message to yourself' });
            }

            const recipient = await db('user_data').where({ user_id: input.recipientUserId }).first();
            if (!recipient) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipient not found' });
            }

            const inserted = await db('messages')
                .insert({
                    sender_user_id: senderUserId,
                    recipient_user_id: input.recipientUserId,
                    subject: input.subject,
                    body: input.body,
                })
                .returning<{ id: string }[]>('id');

            return { id: inserted[0].id };
        });
};

export const listInbox = () => {
    return protectedProcedure
        .input(pagination)
        .output(z.object({ messages: z.array(messageSummary), total: z.number() }))
        .query(async ({ input, ctx }) => {
            return listMessages('inbox', getUserIdFromContext(ctx), input);
        });
};

export const listSent = () => {
    return protectedProcedure
        .input(pagination)
        .output(z.object({ messages: z.array(messageSummary), total: z.number() }))
        .query(async ({ input, ctx }) => {
            return listMessages('sent', getUserIdFromContext(ctx), input);
        });
};

export const getUnreadCount = () => {
    return protectedProcedure
        .input(z.void())
        .output(z.object({ count: z.number() }))
        .query(async ({ ctx }) => {
            const userId = getUserIdFromContext(ctx);
            const row = await db('messages')
                .where({ recipient_user_id: userId })
                .whereNull('read_at')
                .count<{ count: string }>('* as count')
                .first();
            return { count: row ? Number(row.count) : 0 };
        });
};

export const markRead = () => {
    return protectedProcedure
        .input(z.object({ messageId: z.string().min(1) }))
        .output(z.void())
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            const updated = await db('messages')
                .where({ id: input.messageId, recipient_user_id: userId })
                .whereNull('read_at')
                .update({ read_at: db.fn.now() });

            if (updated === 0) {
                const owned = await db('messages').where({ id: input.messageId, recipient_user_id: userId }).first();
                if (!owned) {
                    throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' });
                }
            }
        });
};

export const markAllRead = () => {
    return protectedProcedure
        .input(z.void())
        .output(z.object({ updated: z.number() }))
        .mutation(async ({ ctx }) => {
            const userId = getUserIdFromContext(ctx);
            const updated = await db('messages')
                .where({ recipient_user_id: userId })
                .whereNull('read_at')
                .update({ read_at: db.fn.now() });
            return { updated };
        });
};
