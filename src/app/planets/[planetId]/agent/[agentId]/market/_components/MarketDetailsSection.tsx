'use client';

import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { formatNumberWithUnit, resourceFormToUnit } from '@/lib/utils';
import { getResourceByName } from './marketHelpers';
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

    const resource = getResourceByName(resourceName);
    const qtyUnit = resource ? resourceFormToUnit(resource.form) : 'units';

    return (
        <div className='space-y-4'>
            <span className='text-xs font-medium text-muted-foreground'>
                <h4 className='text-sm font-semibold mb-1'>Agent supply</h4>
                {market.offers.length} active seller{market.offers.length !== 1 ? 's' : ''}
                {' · '}supply {formatNumberWithUnit(market.totalSupply, qtyUnit)}
                {' · '}sold {formatNumberWithUnit(market.totalSold, qtyUnit)}
                {' · '}demand {formatNumberWithUnit(market.totalDemand, qtyUnit)}
                {' · '}unfilled {formatNumberWithUnit(market.unfilledDemand, qtyUnit)}
            </span>

            <OfferTable offers={market.offers} clearingPrice={market.clearingPrice} planetId={planetId} />

            <span className='text-xs font-medium text-muted-foreground'>
                <h4 className='text-sm font-semibold mb-1'>Agent demand</h4>
                {market.bids.length} active buyer{market.bids.length !== 1 ? 's' : ''}
                {' · '}agent demand {formatNumberWithUnit(market.agentDemand, qtyUnit)}
            </span>

            <BidTable bids={market.bids} />

            {market.populationDemand > 0 && (
                <>
                    <span className='text-xs font-medium text-muted-foreground'>
                        <h4 className='text-sm font-semibold mb-1'>Population demand</h4>
                        population demand {formatNumberWithUnit(market.populationDemand, qtyUnit)}
                    </span>

                    <PopulationDemandChart bids={market.populationBids || []} />
                </>
            )}
        </div>
    );
}
