import { initTRPC, TRPCError } from '@trpc/server';
import type { OpenApiMeta } from 'trpc-to-openapi';
import { domainCodeForMessage } from './domainError';
import type { DomainErrorPacket } from './domainError';
import type { Context } from './trpcContext';

export const trpcRoot = initTRPC
    .meta<OpenApiMeta>()
    .context<Context>()
    .create({
        errorFormatter({ shape, error }) {
            const cause = error.cause as { domainError?: DomainErrorPacket } | undefined;
            const code = cause?.domainError?.code ?? domainCodeForMessage(error.message);
            return {
                ...shape,
                data: {
                    ...shape.data,
                    domainError: code ? { code, params: cause?.domainError?.params ?? {} } : null,
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
