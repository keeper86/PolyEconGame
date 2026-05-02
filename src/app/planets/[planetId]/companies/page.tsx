'use client';

import AgentLeaderboard from '@/components/client/AgentLeaderboard';
import { Page } from '@/components/client/Page';
import { useParams } from 'next/navigation';

export default function PlanetAgentsLeaderboardPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';

    return (
        <Page title='Companies'>
            <AgentLeaderboard planetId={planetId} />
        </Page>
    );
}
