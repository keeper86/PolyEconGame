import { authOptions } from '@/app/api/auth/[...nextauth]/authOptions';
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

    return <>{children}</>;
}
