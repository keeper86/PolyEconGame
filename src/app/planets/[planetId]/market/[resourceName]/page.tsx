'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { ProductIcon } from '@/components/client/ProductIcon';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import { ALL_RESOURCES } from '@/simulation/planet/resourceCatalog';
import { agriculturalProductResourceType } from '@/simulation/planet/resources';
import { ArrowLeft } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import BidTable from '../BidTable';
import OfferTable from '../OfferTable';
import PopulationDemandChart from '../PopulationDemandChart';
import FoodPriceHistoryChart from './FoodPriceHistoryChart';

const FOOD_RESOURCE_NAME = agriculturalProductResourceType.name;

function slugToResourceName(slug: string): string | undefined {
    return ALL_RESOURCES.find((r) => r.name.toLowerCase().replace(/\s+/g, '-') === slug)?.name;
}

function ResourceMarketContent({
    planetId,
    resourceName,
}: {
    planetId: string;
    resourceName: string;
}): React.ReactElement {
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

    const isFood = resourceName === FOOD_RESOURCE_NAME;

    return (
        <>
            {isFood && (
                <>
                    <h4 className='text-sm font-semibold mb-2'>Price &amp; starvation history</h4>
                    <Card className='mb-4'>
                        <CardContent className='pt-3'>
                            <FoodPriceHistoryChart
                                planetId={planetId}
                                live={
                                    data
                                        ? {
                                              tick: data.tick,
                                              foodPrice: market.clearingPrice,
                                          }
                                        : undefined
                                }
                            />
                        </CardContent>
                    </Card>

                    <div className='my-3 border-t' />
                </>
            )}

            <h4 className='text-sm font-semibold mb-1'>Offer detail</h4>
            <p className='text-xs text-muted-foreground mb-2'>
                Per-seller breakdown from the last market-clearing tick. The{' '}
                <span className='text-amber-600 dark:text-amber-400 font-medium'>marginal</span> seller is the one whose
                price is closest to the clearing price.
            </p>
            <Card>
                <CardHeader className='pb-1'>
                    <CardTitle className='text-xs font-medium text-muted-foreground'>
                        {market.offers.length} active seller{market.offers.length !== 1 ? 's' : ''}
                        {' · '}supply {formatNumbers(market.totalSupply)}
                        {' · '}sold {formatNumbers(market.totalSold)}
                        {' · '}demand {formatNumbers(market.totalDemand)}
                        {' · '}unfilled {formatNumbers(market.unfilledDemand)}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <OfferTable offers={market.offers} clearingPrice={market.clearingPrice} />
                </CardContent>
            </Card>

            <div className='my-3 border-t' />

            <h4 className='text-sm font-semibold mb-1'>Agent demand</h4>
            <p className='text-xs text-muted-foreground mb-2'>
                Per-buyer breakdown from the last market-clearing tick, sorted highest bid first.
            </p>
            <Card>
                <CardHeader className='pb-1'>
                    <CardTitle className='text-xs font-medium text-muted-foreground'>
                        {market.bids.length} active buyer{market.bids.length !== 1 ? 's' : ''}
                        {' · '}agent demand {formatNumbers(market.agentDemand)}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <BidTable bids={market.bids} />
                </CardContent>
            </Card>

            <div className='my-3 border-t' />

            <h4 className='text-sm font-semibold mb-1'>Population demand</h4>
            <p className='text-xs text-muted-foreground mb-2'>Aggregated household demand segments.</p>
            <Card>
                <CardHeader className='pb-1'>
                    <CardTitle className='text-xs font-medium text-muted-foreground'>
                        population demand {formatNumbers(market.populationDemand)}
                    </CardTitle>
                </CardHeader>
                <CardContent className='pt-3'>
                    <PopulationDemandChart bids={market.populationBids || []} />
                </CardContent>
            </Card>
        </>
    );
}

export default function ResourceMarketPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const resourceSlug = (params?.resourceName as string) ?? '';
    const router = useRouter();

    const resourceName = slugToResourceName(resourceSlug);

    return (
        <div className='space-y-4'>
            <div className='flex items-center gap-3'>
                <button
                    onClick={() => router.push(`/planets/${encodeURIComponent(planetId)}/market` as never)}
                    className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors'
                >
                    <ArrowLeft className='h-4 w-4' />
                    All markets
                </button>
                {resourceName && <ProductIcon productName={resourceName} size={24} />}
                {resourceName && <h2 className='text-base font-semibold'>{resourceName} Market</h2>}
            </div>

            {resourceName ? (
                <ResourceMarketContent planetId={planetId} resourceName={resourceName} />
            ) : (
                <div className='text-sm text-muted-foreground'>Unknown resource.</div>
            )}
        </div>
    );
}
