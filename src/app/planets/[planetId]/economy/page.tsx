'use client';

import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { useParams } from 'next/navigation';
import BankPanel from './BankPanel';
import IntergenerationalTransferChart from './IntergenerationalTransferChart';

export default function PlanetEconomyPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();

    const { data, isLoading } = useSimulationQuery(trpc.simulation.getPlanetEconomy.queryOptions({ planetId }));

    if (isLoading) {
        return <div className='text-sm text-muted-foreground'>Loading economy data…</div>;
    }

    const economy = data?.economy ?? null;

    if (!economy) {
        return <div className='text-sm text-muted-foreground'>Planet not found.</div>;
    }

    return (
        <div className='space-y-4'>
            <BankPanel
                bank={economy.bank}
                wagePerEdu={economy.wagePerEdu ?? undefined}
                priceLevel={economy.priceLevel ?? undefined}
            />
            <IntergenerationalTransferChart lastTransferMatrix={economy.lastTransferMatrix} />
        </div>
    );
}
