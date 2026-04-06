'use client';

import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import React from 'react';
import BidTable from './BidTable';
import OfferTable from './OfferTable';
import PopulationDemandChart from './PopulationDemandChart';

interface MarketDetailsSectionProps {
    planetId: string;
    resourceName: string;
}

export default function MarketDetailsSection({
    planetId,
    resourceName,
}: MarketDetailsSectionProps): React.ReactElement {
    const trpc = useTRPC();
    const { data, isLoading } = useSimulationQuery(
        trpc.simulation.getPlanetMarket.queryOptions({ planetId, resourceName }),
    );

    if (isLoading) {
        return <div className='text-sm text-muted-foreground'>Loading market data…</div>;
    }

    const market = data?.market ?? null;

    if (!market) {
        return <div className='text-sm text-muted-foreground'>No market data found for this planet.</div>;
    }

    return (
        <div className='space-y-4'>
            <span className='text-xs font-medium text-muted-foreground'>
                <h4 className='text-sm font-semibold mb-1'>Agent supply</h4>
                {market.offers.length} active seller{market.offers.length !== 1 ? 's' : ''}
                {' · '}supply {formatNumbers(market.totalSupply)}
                {' · '}sold {formatNumbers(market.totalSold)}
                {' · '}demand {formatNumbers(market.totalDemand)}
                {' · '}unfilled {formatNumbers(market.unfilledDemand)}
            </span>

            <OfferTable offers={market.offers} clearingPrice={market.clearingPrice} />

            <span className='text-xs font-medium text-muted-foreground'>
                <h4 className='text-sm font-semibold mb-1'>Agent demand</h4>
                {market.bids.length} active buyer{market.bids.length !== 1 ? 's' : ''}
                {' · '}agent demand {formatNumbers(market.agentDemand)}
            </span>

            <BidTable bids={market.bids} />

            {market.populationDemand > 0 && (
                <>
                    <span className='text-xs font-medium text-muted-foreground'>
                        <h4 className='text-sm font-semibold mb-1'>Population demand</h4>
                        population demand {formatNumbers(market.populationDemand)}
                    </span>

                    <PopulationDemandChart bids={market.populationBids || []} />
                </>
            )}
        </div>
    );
}
