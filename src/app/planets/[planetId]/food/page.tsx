'use client';

import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import NutritionHeatmapChart from './NutritionHeatmapChart';
import FoodBufferChart from './FoodBufferChart';
import FoodPriceHistoryChart from './FoodPriceHistoryChart';

const REFETCH_INTERVAL_MS = 1_000;

export default function FoodPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();

    const { data, isLoading } = useQuery({
        ...trpc.simulation.getPlanetFood.queryOptions({ planetId }),
        refetchInterval: REFETCH_INTERVAL_MS,
    });

    if (isLoading) {
        return <div className='text-sm text-muted-foreground p-4'>Loading food data…</div>;
    }

    if (!data?.food) {
        return <div className='text-sm text-muted-foreground p-4'>No food data available.</div>;
    }

    const { food, tick } = data;
    const live = { tick, foodPrice: food.priceLevel, starvationLevel: food.starvationLevel };

    return (
        <div className='space-y-4 p-4'>
            <Card>
                <CardHeader className='pb-2'>
                    <CardTitle className='text-sm font-medium'>Food price &amp; starvation history</CardTitle>
                </CardHeader>
                <CardContent>
                    <FoodPriceHistoryChart planetId={planetId} live={live} />
                </CardContent>
            </Card>

            <NutritionHeatmapChart demography={food.demography} />

            <FoodBufferChart demography={food.demography} />
        </div>
    );
}
