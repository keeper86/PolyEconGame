import { authOptions } from '@/app/api/auth/[...nextauth]/authOptions';
import { GameConfigProvider } from '@/components/client/GameConfigContext';
import { db } from '@/server/db';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

export default async function PlanetsLayout({ children }: { children: ReactNode }) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        redirect('/');
    }

    const row = await db('user_data').where({ user_id: session.user.id }).first();

    if (!row?.agent_id) {
        redirect('/');
    }

    let tickIntervalMs = Number(process.env.TICK_INTERVAL_MS);
    if (!tickIntervalMs) {
        console.error('tickIntervalMs not set! Check .env');
        tickIntervalMs = 10000;
    }

    return <GameConfigProvider tickIntervalMs={tickIntervalMs}>{children}</GameConfigProvider>;
}
