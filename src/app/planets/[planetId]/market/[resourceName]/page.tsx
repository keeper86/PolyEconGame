'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { productImage } from '@/lib/mapResource';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Construction } from 'lucide-react';
import MarketSummaryCards from '../MarketSummaryCards';
import OrderBookChart from '../OrderBookChart';
import OfferTable from '../OfferTable';
import FoodPriceHistoryChart from '../../economy/FoodPriceHistoryChart';
import { agriculturalProductResourceType } from '@/simulation/planet/resources';
import { ALL_RESOURCES } from '@/simulation/planet/resourceCatalog';

const FOOD_SLUG = agriculturalProductResourceType.name.toLowerCase().replace(/\s+/g, '-');

function slugToResourceName(slug: string): string | undefined {
    return ALL_RESOURCES.find((r) => r.name.toLowerCase().replace(/\s+/g, '-') === slug)?.name;
}

function UnderConstruction({ resourceName }: { resourceName: string }): React.ReactElement {
    return (
        <div className='flex flex-col items-center justify-center gap-4 py-20 text-center'>
            <div className='relative h-16 w-16'>
                <Image src={productImage(resourceName)} alt={resourceName} fill className='object-contain opacity-50' />
            </div>
            <Construction className='h-8 w-8 text-muted-foreground' />
            <h3 className='text-lg font-semibold'>{resourceName} Market</h3>
            <p className='text-sm text-muted-foreground max-w-sm'>
                This market is under construction. Live market data for {resourceName} will be available in a future
                update.
            </p>
        </div>
    );
}

function FoodMarketContent({ planetId }: { planetId: string }): React.ReactElement {
    const trpc = useTRPC();
    const { data, isLoading } = useSimulationQuery(trpc.simulation.getPlanetFoodMarket.queryOptions({ planetId }));

    if (isLoading) {
        return <div className='text-sm text-muted-foreground'>Loading market data…</div>;
    }

    const market = data?.market ?? null;

    if (!market) {
        return <div className='text-sm text-muted-foreground'>Planet not found.</div>;
    }

    return (
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
                                      starvationLevel: market.starvationLevel,
                                  }
                                : undefined
                        }
                    />
                </CardContent>
            </Card>

            <div className='my-3 border-t' />

            <h4 className='text-sm font-semibold mb-2'>Current state</h4>
            <MarketSummaryCards market={market} />

            <div className='my-3 border-t' />

            <h4 className='text-sm font-semibold mb-1'>Merit-order supply stack</h4>
            <p className='text-xs text-muted-foreground mb-2'>
                Sellers sorted cheapest-first. Bars show offer price; colour indicates sell-through (green = fully sold,
                amber = marginal, grey = unsold). The dashed line is last tick&apos;s clearing price.
            </p>
            <Card className='mb-4'>
                <CardContent className='pt-3'>
                    <OrderBookChart
                        offers={market.offers}
                        totalDemand={market.totalDemand}
                        clearingPrice={market.clearingPrice}
                    />
                </CardContent>
            </Card>

            <div className='my-3 border-t' />

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
                        {' · '}supply {market.totalSupply.toFixed(1)} t{' · '}sold {market.totalSold.toFixed(1)} t
                        {' · '}demand {market.totalDemand.toFixed(1)} t{' · '}unfilled{' '}
                        {market.unfilledDemand.toFixed(1)} t
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <OfferTable offers={market.offers} clearingPrice={market.clearingPrice} />
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

    const isFood = resourceSlug === FOOD_SLUG;

    return (
        <div className='space-y-4'>
            <button
                onClick={() => router.push(`/planets/${encodeURIComponent(planetId)}/market` as never)}
                className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors'
            >
                <ArrowLeft className='h-4 w-4' />
                All markets
            </button>

            {resourceName ? (
                isFood ? (
                    <FoodMarketContent planetId={planetId} />
                ) : (
                    <UnderConstruction resourceName={resourceName} />
                )
            ) : (
                <div className='text-sm text-muted-foreground'>Unknown resource.</div>
            )}
        </div>
    );
}
