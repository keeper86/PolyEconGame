import { initTRPC, TRPCError } from '@trpc/server';
import type { OpenApiMeta } from 'trpc-to-openapi';
import type { DomainErrorPacket } from './domainError';
import type { Context } from './trpcContext';

export const trpcRoot = initTRPC
    .meta<OpenApiMeta>()
    .context<Context>()
    .create({
        errorFormatter({ shape, error }) {
            const cause = error.cause as { domainError?: DomainErrorPacket } | undefined;
            return {
                ...shape,
                data: {
                    ...shape.data,
                    domainError: cause?.domainError ?? null,
                },
            };
        },
    });

export const procedure = trpcRoot.procedure;

const unauthorizedError = new TRPCError({
    code: 'UNAUTHORIZED',
    message: 'You must be logged in to access this resource or provide a valid PAT.',
    cause: { domainError: { code: 'notLoggedIn', params: {} } },
});

export const protectedProcedure = trpcRoot.procedure.use(async ({ ctx, next }) => {
    const session = ctx.session;

    if (session?.type === 'next-auth' && session.user?.id) {
        return next();
    }

    throw unauthorizedError;
});

export const getUserIdFromContext = (ctx: Context): string => {
    const session = ctx.session;
    if (session.user?.id) {
        return session.user.id;
    }
    throw unauthorizedError;
};
