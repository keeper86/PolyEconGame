import type { AppRouter } from '@/server/router';
import { createTRPCContext } from '@trpc/tanstack-react-query';

import type { TRPCClientError } from '@trpc/client';
import { createTRPCProxyClient, httpBatchLink, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';

const instrumentedLink: TRPCLink<AppRouter> = () => {
    return ({ next, op }) => {
        return observable((observer) => {
            const subscription = next(op).subscribe({
                next: (value) => observer.next?.(value),
                error: (err: TRPCClientError<AppRouter>) => {
                    if (err.data?.httpStatus === 401 && window.location.pathname !== '/') {
                        window.location.href = '/';
                        return;
                    }
                    observer.error?.(err);
                },
                complete: () => observer.complete?.(),
            });
            return () => subscription.unsubscribe();
        });
    };
};

export const trpcClient = createTRPCProxyClient<AppRouter>({
    links: [instrumentedLink, httpBatchLink({ url: '/api/trpc' })],
});

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
