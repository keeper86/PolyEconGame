import { validateBuyBid, validateSellOffer } from '@/simulation/market/validation';
import {
    CURRENCY_RESOURCE_PREFIX,
    getCurrencyResource,
    isCurrencyResource,
} from '@/simulation/market/currencyResources';
import { queryStorageFacility } from '@/simulation/planet/facility';
import { ALL_RESOURCES } from '@/simulation/planet/resourceCatalog';
import {
    workerBuildFacility,
    workerCancelBuyBid,
    workerCancelSellOffer,
    workerCreateAgent,
    workerLeaseClaim,
    workerExpandFacility,
    workerSetFacilityScale,
    workerQuitClaim,
    workerRequestLoan,
    workerSetAutomation,
    workerSetBuyBids,
    workerSetSellOffers,
    workerSetWorkerAllocationTargets,
    workerBuildShipConstructionFacility,
    workerExpandShipConstructionFacility,
    workerSetShipConstructionTarget,
    workerBuildShipMaintenanceFacility,
    workerExpandShipMaintenanceFacility,
    workerAcquireLicense,
} from '@/simulation/workerClient/commands';
import { workerQueries } from '@/simulation/workerClient/queries';

import type { UserData } from '@/types/db_schemas';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import { db } from '../db';
import { logger } from '../logger';
import { getUserIdFromContext, protectedProcedure } from '../trpcRoot';

const userId = z.object({
    userId: z.string(),
});

// Base64 encodes each 3 bytes into 4 characters
const bytesToBase64Chars = (bytes: number) => 4 * Math.ceil(bytes / 3);
const MAX_SIZE_BYTES_AVATAR = 1 * 1024 * 1024;

const userData = z.object({
    displayName: z.string().optional(),
    hasAssessmentPublished: z.boolean().optional(),
    avatar: z.string().max(bytesToBase64Chars(MAX_SIZE_BYTES_AVATAR), 'Avatar image (base64) is too large').optional(),
});
export const userSummary = userId.merge(userData).extend({
    agentId: z.string().nullable().optional(),
});
export type UserSummary = z.infer<typeof userSummary>;

export const getUsers = () => {
    return protectedProcedure
        .input(
            z.object({
                limit: z.number().int().min(1).max(100).optional().default(25),
                offset: z.number().int().min(0).optional().default(0),
                onlyWithPublishedAssessments: z.boolean().optional().default(false),
            }),
        )
        .output(
            z.object({
                users: z.array(userSummary),
                total: z.number(),
            }),
        )
        .query(async ({ input }) => {
            const { limit, offset } = input;

            const query = db('user_data');
            if (input.onlyWithPublishedAssessments) {
                query.andWhere({ has_assessment_published: true });
            }

            const totalResult = await query.clone().count<{ count: string }>('* as count').first();
            const total = totalResult ? Number(totalResult.count) : 0;
            // Execute paginated query
            const users: UserData[] = await query.orderBy('user_id').offset(offset).limit(limit);

            logger.debug({ component: 'user-list' }, `Fetched users: ${JSON.stringify(users)}`);

            return {
                users: users.map((r) => ({
                    userId: r.user_id,
                    displayName: r.display_name || undefined,
                    hasAssessmentPublished: r.has_assessment_published,
                })),
                total,
            };
        });
};

export const getUser = () => {
    return protectedProcedure
        .input(
            z.object({
                userId: z.string().optional(),
            }),
        )
        .output(userSummary)
        .query(async ({ input, ctx }) => {
            logger.debug({ component: 'user-get' }, `Fetching user info for user ID: ${input.userId}`);

            const userId = getUserIdFromContext(ctx);
            const row = await db('user_data')
                .where({ user_id: input.userId || userId })
                .first();

            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }

            const user: UserSummary = {
                userId: row.user_id,
                displayName: row.display_name || undefined,
                hasAssessmentPublished: row.has_assessment_published,
                avatar: row.avatar ? row.avatar.toString('base64') : undefined,
                agentId: row.agent_id ?? null,
            };

            logger.debug(
                { component: 'user-get' },
                `Fetched user info: ${JSON.stringify({ ...user, avatar: user.avatar ? '[base64 omitted]' : undefined })}`,
            );

            return user;
        });
};

export const updateUser = () => {
    return protectedProcedure
        .input(userData)
        .output(z.void())
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            console.log(`Updating user info for user ID: ${userId}`);

            logger.debug({ component: 'user-update' }, `Updating user info for user ID: ${userId}`);

            const updateData: Partial<UserData> = { user_id: userId };
            if (input.hasAssessmentPublished !== undefined) {
                updateData.has_assessment_published = input.hasAssessmentPublished;
            }
            if (input.displayName !== undefined) {
                updateData.display_name = input.displayName;
            }
            if (input.avatar !== undefined) {
                const trimmed = input.avatar.trim();
                if (trimmed === '') {
                    updateData.avatar = null;
                } else {
                    const dataUrlPrefix = 'data:image/png;base64,';
                    const base64 = trimmed.startsWith(dataUrlPrefix) ? trimmed.slice(dataUrlPrefix.length) : trimmed;

                    let buffer: Buffer;
                    try {
                        buffer = Buffer.from(base64, 'base64');
                    } catch {
                        throw new TRPCError({
                            code: 'UNSUPPORTED_MEDIA_TYPE',
                            message: 'Invalid base64 image data',
                        });
                    }

                    // PNG files must start with the following fixed 8 bytes. Ref: https://www.w3.org/TR/PNG-Rationale.html#R.PNG-file-signature
                    // By checking these first 8 bytes, we ensure the uploaded avatar is a real PNG before storing it.
                    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
                    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(pngSignature)) {
                        throw new TRPCError({
                            code: 'UNSUPPORTED_MEDIA_TYPE',
                            message: 'Only PNG images are supported for avatar',
                        });
                    }

                    updateData.avatar = buffer;
                }
            }

            await db('user_data').where({ user_id: userId }).update(updateData);
        });
};

export const getUserIdFromSession = () => {
    return protectedProcedure
        .meta({
            openapi: { method: 'GET', path: '/user-id', tags: ['Game'], summary: 'Get User ID', protect: true },
        })
        .input(z.void())
        .output(z.object({ userId: z.string() }))
        .query(async ({ ctx }) => {
            const userId = getUserIdFromContext(ctx);
            logger.debug({ component: 'getUserIdFromPat' }, `Retrieved user ID from PAT: ${userId}`);
            return { userId };
        });
};

function createAgentSlug(name: string): string {
    const normalized = name.normalize('NFKD').toLowerCase();

    const chars: string[] = [];
    let lastWasDash = false;

    for (const ch of normalized) {
        if (ch >= 'a' && ch <= 'z') {
            chars.push(ch);
            lastWasDash = false;
            continue;
        }

        if (ch >= '0' && ch <= '9') {
            chars.push(ch);
            lastWasDash = false;
            continue;
        }

        if (ch === ' ' || ch === '-' || ch === '_') {
            if (!lastWasDash && chars.length > 0) {
                chars.push('-');
                lastWasDash = true;
            }
        }
    }

    // remove trailing dash
    if (chars[chars.length - 1] === '-') {
        chars.pop();
    }

    return chars.join('');
}

export const createAgent = () => {
    return protectedProcedure
        .input(
            z.object({
                agentName: z.string().min(1).max(64),
                planetId: z.string().min(1),
            }),
        )
        .output(z.object({ agentId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);

            // Check if user already has an agent
            const existing = await db('user_data').where({ user_id: userId }).first();
            if (!existing) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (existing.agent_id) {
                throw new TRPCError({ code: 'CONFLICT', message: 'User already has an agent' });
            }

            const agentName = input.agentName.trim();
            if (agentName.length === 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Agent name cannot be empty' });
            }
            if (agentName.length > 64) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Agent name cannot exceed 64 characters' });
            }

            const agentId = createAgentSlug(agentName);

            if (agentId.length === 0) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Agent name must contain at least one letter or digit',
                });
            }

            logger.info(
                { component: 'create-agent' },
                `Creating agent '${input.agentName}' (${agentId}) on planet '${input.planetId}' for user ${userId}`,
            );

            // Create the agent in the live simulation worker
            const createdId = await workerCreateAgent({
                agentId,
                agentName,
                planetId: input.planetId,
            });

            // Persist the association in the database
            await db('user_data').where({ user_id: userId }).update({ agent_id: createdId });

            logger.info({ component: 'create-agent' }, `Agent ${createdId} associated with user ${userId}`);

            return { agentId: createdId };
        });
};

/**
 * Request a discretionary loan from the planet's bank.
 *
 * The amount is validated against the credit conditions computed by the
 * worker.  On success the loan is applied within the next tick via the
 * pending-action queue.
 */
export const requestLoan = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                amount: z.number().int().positive(),
            }),
        )
        .output(z.object({ grantedAmount: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);

            // Verify the requesting user actually owns this agent
            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'You do not own this agent',
                });
            }

            logger.info(
                { component: 'request-loan' },
                `User ${userId} requesting loan of ${input.amount} for agent ${input.agentId} on planet ${input.planetId}`,
            );

            const grantedAmount = await workerRequestLoan({
                agentId: input.agentId,
                planetId: input.planetId,
                amount: input.amount,
            });

            logger.info({ component: 'request-loan' }, `Loan of ${grantedAmount} granted to agent ${input.agentId}`);

            return { grantedAmount };
        });
};

/**
 * Toggle automatic worker allocation and/or automatic pricing for the
 * user's agent.  Both flags are applied atomically on the next simulation
 * tick via the pending-action queue.
 */
export const setAutomation = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                automateWorkerAllocation: z.boolean(),
            }),
        )
        .output(z.void())
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);

            // Verify the requesting user actually owns this agent
            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }

            logger.info(
                { component: 'set-automation' },
                `User ${userId} setting automation for agent ${input.agentId}: ` +
                    `workerAllocation=${input.automateWorkerAllocation}`,
            );

            await workerSetAutomation({
                agentId: input.agentId,
                automateWorkerAllocation: input.automateWorkerAllocation,
            });
        });
};

/**
 * Set manual workforce allocation targets for the user's agent on a specific
 * planet.  Only meaningful when `automateWorkerAllocation` is false.
 *
 * The targets are written directly into `assets.allocatedWorkers` so that
 * the next `hireWorkforce` tick will hire/fire to match them.
 */
export const setWorkerAllocationTargets = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                /** Desired headcount per education level. */
                targets: z.object({
                    none: z.number().int().min(0),
                    primary: z.number().int().min(0),
                    secondary: z.number().int().min(0),
                    tertiary: z.number().int().min(0),
                }),
            }),
        )
        .output(z.void())
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);

            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }

            const { agent: allocAgent } = await workerQueries.getAgent(input.agentId);
            const allocAssets = allocAgent?.assets[input.planetId];
            if (!allocAssets?.licenses?.workforce || allocAssets.licenses.workforce.frozen) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'An active workforce license is required to set worker allocation targets on this planet',
                });
            }

            logger.info(
                { component: 'set-worker-allocation' },
                `User ${userId} setting worker targets for agent ${input.agentId} on planet ${input.planetId}: ` +
                    JSON.stringify(input.targets),
            );

            await workerSetWorkerAllocationTargets({
                agentId: input.agentId,
                planetId: input.planetId,
                targets: input.targets,
            });
        });
};

/**
 * Set manual sell-offer price and/or quantity for one or more resources
 * produced by the user's agent on a specific planet.
 * Only meaningful when `automatePricing` is false.
 */
export const setSellOffers = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                offers: z.record(
                    z.string(),
                    z.object({
                        /** Price per unit (currency). Must be > 0. */
                        offerPrice: z.number().positive().optional(),
                        /** Keep at least this many units — sell qty = max(0, inventory − retainment). */
                        offerRetainment: z.number().min(0).optional(),
                        /** When true, the auto-pricing engine manages this offer each tick. */
                        automated: z.boolean().optional(),
                    }),
                ),
            }),
        )
        .output(z.void())
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);

            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }

            // Fetch agent once before the loop to avoid N× worker round-trips
            const { agent: sellAgent } = await workerQueries.getAgent(input.agentId);
            if (!sellAgent) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
            }
            const sellAssets = sellAgent.assets[input.planetId];
            if (!sellAssets) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent has no assets on this planet' });
            }
            if (!sellAssets.licenses?.commercial || sellAssets.licenses.commercial.frozen) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'An active commercial license is required to place sell offers on this planet',
                });
            }

            // Validate each offer using the shared validation module
            for (const [resourceName, offer] of Object.entries(input.offers)) {
                let resource = ALL_RESOURCES.find((r) => r.name === resourceName);
                if (!resource) {
                    if (resourceName.startsWith(CURRENCY_RESOURCE_PREFIX)) {
                        resource = getCurrencyResource(resourceName.slice(CURRENCY_RESOURCE_PREFIX.length));
                    } else {
                        throw new TRPCError({
                            code: 'BAD_REQUEST',
                            message: `Unknown resource: ${resourceName}`,
                        });
                    }
                }

                // For currency resources, sell quantity comes from foreign deposits, not storage.
                // validateSellOffer ignores the inventory argument, so pass 0 for currencies.
                const inventoryQty = isCurrencyResource(resource)
                    ? 0
                    : queryStorageFacility(sellAssets.storageFacility, resourceName);

                // Validate price (quantity is computed dynamically from retainment)
                const validation = validateSellOffer(offer.offerPrice, inventoryQty);

                if (!validation.isValid) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Invalid sell offer for ${resourceName}: ${validation.error}`,
                    });
                }
            }

            logger.info(
                { component: 'set-sell-offers' },
                `User ${userId} setting sell offers for agent ${input.agentId} on planet ${input.planetId}`,
            );

            await workerSetSellOffers({
                agentId: input.agentId,
                planetId: input.planetId,
                offers: input.offers,
            });
        });
};

/**
 * Cancel (remove) a sell offer for a specific resource on said planet.
 */
export const cancelSellOffer = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                resourceName: z.string().min(1),
            }),
        )
        .output(z.void())
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);

            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }

            logger.info(
                { component: 'cancel-sell-offer' },
                `User ${userId} cancelling sell offer for agent ${input.agentId} on planet ${input.planetId} resource ${input.resourceName}`,
            );

            await workerCancelSellOffer({
                agentId: input.agentId,
                planetId: input.planetId,
                resourceName: input.resourceName,
            });
        });
};

/**
 * Cancel (remove) a buy bid for a specific resource on said planet.
 */
export const cancelBuyBid = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                resourceName: z.string().min(1),
            }),
        )
        .output(z.void())
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);

            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }

            logger.info(
                { component: 'cancel-buy-bid' },
                `User ${userId} cancelling buy bid for agent ${input.agentId} on planet ${input.planetId} resource ${input.resourceName}`,
            );

            await workerCancelBuyBid({
                agentId: input.agentId,
                planetId: input.planetId,
                resourceName: input.resourceName,
            });
        });
};

const buyBid = z.object({
    bidPrice: z.number().positive().optional(),
    bidStorageTarget: z.number().min(0).optional(),
    automated: z.boolean().optional(),
});

export type BuyBid = z.infer<typeof buyBid>;

export const setBuyBids = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                bids: z.record(z.string(), buyBid),
            }),
        )
        .output(z.void())
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);

            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }

            // Fetch agent once before the loop to avoid N× worker round-trips
            const { agent: bidAgent } = await workerQueries.getAgent(input.agentId);
            if (!bidAgent) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
            }
            const bidAssets = bidAgent.assets[input.planetId];
            if (!bidAssets) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent has no assets on this planet' });
            }
            if (!bidAssets.licenses?.commercial || bidAssets.licenses.commercial.frozen) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'A active commercial license is required to place buy bids on this planet',
                });
            }

            // Validate each bid using the shared validation module
            for (const [resourceName, bid] of Object.entries(input.bids)) {
                let resource = ALL_RESOURCES.find((r) => r.name === resourceName);
                if (!resource) {
                    if (resourceName.startsWith(CURRENCY_RESOURCE_PREFIX)) {
                        // Currency resources have volumePerQuantity: 0 so storage capacity is Infinity;
                        // the deposit affordability check in validateBuyBid correctly uses local deposits.
                        resource = getCurrencyResource(resourceName.slice(CURRENCY_RESOURCE_PREFIX.length));
                    } else {
                        throw new TRPCError({
                            code: 'BAD_REQUEST',
                            message: `Unknown resource: ${resourceName}`,
                        });
                    }
                }

                const validation = validateBuyBid(bid, resource, bidAssets);

                if (!validation.isValid) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Invalid buy bid for ${resourceName}: ${validation.error}`,
                    });
                }
            }

            logger.info(
                { component: 'set-buy-bids' },
                `User ${userId} setting buy bids for agent ${input.agentId} on planet ${input.planetId}`,
            );

            await workerSetBuyBids({
                agentId: input.agentId,
                planetId: input.planetId,
                bids: input.bids,
            });
        });
};

export const buildFacility = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                facilityKey: z.string().min(1),
                targetScale: z.number().int().min(1).max(100).default(1),
            }),
        )
        .output(z.object({ facilityId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);

            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }

            const { agent: buildAgent } = await workerQueries.getAgent(input.agentId);
            const buildAssets = buildAgent?.assets[input.planetId];
            if (!buildAssets?.licenses?.workforce || buildAssets.licenses.workforce.frozen) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'An active workforce license is required to build facilities on this planet',
                });
            }

            logger.info(
                { component: 'build-facility' },
                `User ${userId} building '${input.facilityKey}' for agent ${input.agentId} on planet ${input.planetId}`,
            );

            const facilityId = await workerBuildFacility({
                agentId: input.agentId,
                planetId: input.planetId,
                facilityKey: input.facilityKey,
                targetScale: input.targetScale,
            });

            logger.info({ component: 'build-facility' }, `Agent ${input.agentId} built facility ${facilityId}`);

            return { facilityId };
        });
};

export const expandFacility = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                facilityId: z.string().min(1),
                targetScale: z.number().int().min(2).max(100),
            }),
        )
        .output(z.object({ facilityId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);

            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }

            const { agent: expandAgent } = await workerQueries.getAgent(input.agentId);
            const expandAssets = expandAgent?.assets[input.planetId];
            if (!expandAssets?.licenses?.workforce || expandAssets.licenses.workforce.frozen) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'An active workforce license is required to expand facilities on this planet',
                });
            }

            logger.info(
                { component: 'expand-facility' },
                `User ${userId} expanding facility '${input.facilityId}' to scale ${input.targetScale} for agent ${input.agentId} on planet ${input.planetId}`,
            );

            const facilityId = await workerExpandFacility({
                agentId: input.agentId,
                planetId: input.planetId,
                facilityId: input.facilityId,
                targetScale: input.targetScale,
            });

            logger.info({ component: 'expand-facility' }, `Agent ${input.agentId} expanding facility ${facilityId}`);

            return { facilityId };
        });
};

export const setFacilityScale = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                facilityId: z.string().min(1),
                scaleFraction: z.number().min(0).max(1),
            }),
        )
        .output(z.object({ facilityId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);

            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }

            logger.info(
                { component: 'set-facility-scale' },
                `User ${userId} setting facility '${input.facilityId}' scale to ${input.scaleFraction} for agent ${input.agentId} on planet ${input.planetId}`,
            );

            const facilityId = await workerSetFacilityScale({
                agentId: input.agentId,
                planetId: input.planetId,
                facilityId: input.facilityId,
                scaleFraction: input.scaleFraction,
            });

            return { facilityId };
        });
};

export const buildShipConstructionFacility = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                facilityName: z.string().min(1).max(50),
                targetScale: z.number().int().min(1).max(100).default(1),
            }),
        )
        .output(z.object({ facilityId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }
            logger.info(
                { component: 'build-ship-construction-facility' },
                `User ${userId} building ship construction facility '${input.facilityName}' for agent ${input.agentId} on planet ${input.planetId}`,
            );
            const facilityId = await workerBuildShipConstructionFacility({
                agentId: input.agentId,
                planetId: input.planetId,
                facilityName: input.facilityName,
                targetScale: input.targetScale,
            });
            return { facilityId };
        });
};

export const expandShipConstructionFacility = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                facilityId: z.string().min(1),
                targetScale: z.number().int().min(2).max(100),
            }),
        )
        .output(z.object({ facilityId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }
            const facilityId = await workerExpandShipConstructionFacility({
                agentId: input.agentId,
                planetId: input.planetId,
                facilityId: input.facilityId,
                targetScale: input.targetScale,
            });
            return { facilityId };
        });
};

export const setShipConstructionTarget = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                facilityId: z.string().min(1),
                shipTypeName: z.string().min(1).nullable(),
                shipName: z.string().max(50),
            }),
        )
        .output(z.object({ facilityId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }
            const facilityId = await workerSetShipConstructionTarget({
                agentId: input.agentId,
                planetId: input.planetId,
                facilityId: input.facilityId,
                shipTypeName: input.shipTypeName,
                shipName: input.shipName,
            });
            return { facilityId };
        });
};

export const buildShipMaintenanceFacility = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                facilityName: z.string().min(1).max(50),
                targetScale: z.number().int().min(1).max(100).default(1),
            }),
        )
        .output(z.object({ facilityId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }
            logger.info(
                { component: 'build-ship-maintenance-facility' },
                `User ${userId} building ship maintenance facility '${input.facilityName}' for agent ${input.agentId} on planet ${input.planetId}`,
            );
            const facilityId = await workerBuildShipMaintenanceFacility({
                agentId: input.agentId,
                planetId: input.planetId,
                facilityName: input.facilityName,
                targetScale: input.targetScale,
            });
            return { facilityId };
        });
};

export const expandShipMaintenanceFacility = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                facilityId: z.string().min(1),
                targetScale: z.number().int().min(2).max(100),
            }),
        )
        .output(z.object({ facilityId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }
            const facilityId = await workerExpandShipMaintenanceFacility({
                agentId: input.agentId,
                planetId: input.planetId,
                facilityId: input.facilityId,
                targetScale: input.targetScale,
            });
            return { facilityId };
        });
};

export const leaseClaim = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                resourceName: z.string().min(1),
                quantity: z.number().int().min(1),
            }),
        )
        .output(z.object({ claimId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }
            const claimId = await workerLeaseClaim({
                agentId: input.agentId,
                planetId: input.planetId,
                resourceName: input.resourceName,
                quantity: input.quantity,
            });
            return { claimId };
        });
};

export const quitClaim = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                claimId: z.string().min(1),
            }),
        )
        .output(z.object({ claimId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }
            const claimId = await workerQuitClaim({
                agentId: input.agentId,
                planetId: input.planetId,
                claimId: input.claimId,
            });
            return { claimId };
        });
};

/**
 * Acquire a commercial or workforce license for the user's agent on a planet.
 *
 * Commercial license: grants bank account + storage + market access.
 * Workforce license: grants the right to hire and run production.
 *
 * Home planet licenses are granted free on agent creation.
 * For any other planet the license fee is funded via an initial loan
 * that is created automatically when the agent first enters that planet.
 */
export const acquireLicense = () => {
    return protectedProcedure
        .input(
            z.object({
                agentId: z.string().min(1),
                planetId: z.string().min(1),
                licenseType: z.enum(['commercial', 'workforce']),
            }),
        )
        .output(
            z.object({ agentId: z.string(), planetId: z.string(), licenseType: z.enum(['commercial', 'workforce']) }),
        )
        .mutation(async ({ input, ctx }) => {
            const userId = getUserIdFromContext(ctx);
            const row = await db('user_data').where({ user_id: userId }).first();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }
            if (row.agent_id !== input.agentId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this agent' });
            }
            logger.info(
                { component: 'acquire-license' },
                `User ${userId} acquiring '${input.licenseType}' license for agent ${input.agentId} on planet ${input.planetId}`,
            );
            const result = await workerAcquireLicense({
                agentId: input.agentId,
                planetId: input.planetId,
                licenseType: input.licenseType,
            });
            logger.info(
                { component: 'acquire-license' },
                `Agent ${input.agentId} acquired '${input.licenseType}' license on planet ${input.planetId}`,
            );
            return result;
        });
};
