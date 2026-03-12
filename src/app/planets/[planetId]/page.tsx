'use client';

import BankPanel from '@/app/planets/BankPanel';
import FoodBufferChart from '@/app/planets/FoodBufferChart';
import FoodPriceHistoryChart from '@/app/planets/FoodPriceHistoryChart';
import IntergenerationalTransferChart from '@/app/planets/IntergenerationalTransferChart';
import NutritionHeatmapChart from '@/app/planets/NutritionHeatmapChart';
import PlanetDemography from '@/app/planets/PlanetDemography';
import WealthDistributionChart from '@/app/planets/WealthDistributionChart';
import { Page } from '@/components/client/Page';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTRPC } from '@/lib/trpc';
import { formatNumbers } from '@/lib/utils';
import type { Planet } from '@/simulation/planet/planet';
import { educationLevelKeys } from '@/simulation/population/education';
import type { Population } from '@/simulation/population/population';
import { OCCUPATIONS, SKILL } from '@/simulation/population/population';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Globe, Landmark, Users, Wheat } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import PlanetOverviewPanel from '../PlanetOverviewPanel';
import WealthByAgeChart from '../WealthByAgeChart';

const REFETCH_INTERVAL_MS = 1000;

/** Compute a global average starvation level from per-category values. */
function computeGlobalStarvation(pop: Population): number {
    let totalStarvation = 0;
    let totalPop = 0;
    for (const cohort of pop.demography) {
        if (!cohort) {
            continue;
        }
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                for (const skill of SKILL) {
                    const cat = cohort[occ][edu][skill];
                    if (cat.total > 0) {
                        totalStarvation += cat.starvationLevel * cat.total;
                        totalPop += cat.total;
                    }
                }
            }
        }
    }
    return totalPop > 0 ? totalStarvation / totalPop : 0;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PlanetDetailPage() {
    const params = useParams();
    const planetId = (params?.planetId as string) ?? '';
    const trpc = useTRPC();

    const { data, isLoading } = useQuery({
        ...trpc.simulation.getPlanetDetail.queryOptions({ planetId }),
        refetchInterval: REFETCH_INTERVAL_MS,
    });

    const tick = data?.tick ?? 0;
    const planet = data?.planet as Planet | null;
    const populationTotal = data?.populationTotal ?? 0;
    const starvationLevel = planet ? computeGlobalStarvation(planet.population) : 0;

    return (
        <Page
            title={planet?.name ?? 'Planet'}
            headerComponent={
                <Link
                    href={'/planets' as never}
                    className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors'
                >
                    <ArrowLeft className='h-4 w-4' />
                    All planets
                </Link>
            }
        >
            {!isLoading && tick > 0 && planet ? (
                <div className='space-y-6'>
                    {/* Tabbed content */}
                    <Tabs defaultValue='overview' className='w-full'>
                        <TabsList className='grid w-full grid-cols-4'>
                            <TabsTrigger value='overview'>Overview</TabsTrigger>
                            <TabsTrigger value='demographics'>Demographics</TabsTrigger>
                            <TabsTrigger value='economy'>Economy</TabsTrigger>
                            <TabsTrigger value='food'>Food &amp; Nutrition</TabsTrigger>
                        </TabsList>

                        {/* Overview tab */}
                        <TabsContent value='overview' className='space-y-4'>
                            <PlanetOverviewPanel
                                planet={planet}
                                populationTotal={populationTotal}
                                tick={tick}
                                starvationLevel={starvationLevel}
                            />
                        </TabsContent>

                        {/* Demographics tab */}
                        <TabsContent value='demographics' className='space-y-4'>
                            <PlanetDemography population={planet.population} />
                        </TabsContent>

                        {/* Economy tab */}
                        <TabsContent value='economy' className='space-y-4'>
                            <BankPanel
                                bank={planet.bank}
                                wagePerEdu={planet.wagePerEdu}
                                priceLevel={planet.priceLevel}
                            />
                            <WealthByAgeChart population={planet.population} />
                            <WealthDistributionChart population={planet.population} />
                            <IntergenerationalTransferChart population={planet.population} />
                        </TabsContent>

                        {/* Food & Nutrition tab */}
                        <TabsContent value='food' className='space-y-4'>
                            <NutritionHeatmapChart population={planet.population} />
                            <FoodBufferChart population={planet.population} />

                            {/* Price level history chart */}
                            <Card>
                                <CardContent className='pt-4 space-y-2'>
                                    <h4 className='text-sm font-semibold flex items-center gap-1.5'>
                                        <Wheat className='h-4 w-4 text-muted-foreground' />
                                        Price History
                                    </h4>
                                    <FoodPriceHistoryChart
                                        planetId={planetId}
                                        live={{
                                            tick,
                                            foodPrice: planet.priceLevel ?? 0,
                                            starvationLevel,
                                        }}
                                    />
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            ) : isLoading ? (
                <div className='text-sm text-muted-foreground'>Loading planet data…</div>
            ) : (
                <div className='text-sm text-muted-foreground'>
                    Planet not found.{' '}
                    <Link href={'/planets' as never} className='underline'>
                        Back to planets
                    </Link>
                </div>
            )}
        </Page>
    );
}
