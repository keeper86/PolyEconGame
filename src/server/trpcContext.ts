import { authOptions } from '@/app/api/auth/[...nextauth]/authOptions';
import type { NoAuthSession, Session } from 'next-auth';
import { getServerSession } from 'next-auth';

export async function createContext(): Promise<{ session: Session | NoAuthSession }> {
    const nextAuthSession = await getServerSession(authOptions);
    if (nextAuthSession) {
        return { session: nextAuthSession };
    }

    const session: NoAuthSession = {
        type: 'no-auth',
        user: null,
    };

    return { session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
