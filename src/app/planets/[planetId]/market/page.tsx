'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSimulationQuery } from '@/hooks/useSimulationQuery';
import { useTRPC } from '@/lib/trpc';
import { useParams } from 'next/navigation';
import MarketSummaryCards from './MarketSummaryCards';
import OrderBookChart from './OrderBookChart';
import OfferTable from './OfferTable';
import FoodPriceHistoryChart from '../economy/FoodPriceHistoryChart';

export default function PlanetFoodMarketPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
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
            {/* ── Price history ──────────────────────────────────────────── */}
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

            {/* ── Market state summary ───────────────────────────────────── */}
            <h4 className='text-sm font-semibold mb-2'>Current state</h4>
            <MarketSummaryCards market={market} />

            <div className='my-3 border-t' />

            {/* ── Merit-order supply stack ───────────────────────────────── */}
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

            {/* ── Per-agent offer table ──────────────────────────────────── */}
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
