'use client';

import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import BankPanel from './BankPanel';
import WealthByAgeChart from './WealthByAgeChart';
import WealthDistributionChart from './WealthDistributionChart';
import IntergenerationalTransferChart from './IntergenerationalTransferChart';

const REFETCH_INTERVAL_MS = 1000;

export default function PlanetEconomyPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();

    const { data, isLoading } = useQuery({
        ...trpc.simulation.getPlanetEconomy.queryOptions({ planetId }),
        refetchInterval: REFETCH_INTERVAL_MS,
    });

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
            <WealthByAgeChart demography={economy.demography} />
            <WealthDistributionChart demography={economy.demography} />
            <IntergenerationalTransferChart lastTransferMatrix={economy.lastTransferMatrix} />
        </div>
    );
}
