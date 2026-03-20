'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { facilityImage, productImage } from '@/lib/mapResource';
import {
    FACILITY_LEVELS,
    FACILITY_LEVEL_LABELS,
    facilitiesByLevel,
    type FacilityCatalogEntry,
} from '@/simulation/planet/facilityCatalog';
import type { ProductionFacility } from '@/simulation/planet/storage';
import { PlusCircle } from 'lucide-react';
import Image from 'next/image';
import React, { useMemo, useState } from 'react';

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

function FacilityCard({ entry }: { entry: FacilityCatalogEntry }): React.ReactElement {
    const facility: ProductionFacility = useMemo(() => entry.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID), [entry]);

    const totalWorkers = Object.values(facility.workerRequirement).reduce((sum, v) => sum + (v ?? 0), 0);

    return (
        <>
            <h4 className='text-xl font-semibold leading-tight'>{facility.name}</h4>
            <div className='flex flex-row items-start gap-3'>
                <Image
                    src={facilityImage(facility.name)}
                    alt={facility.name}
                    width={300}
                    height={200}
                    unoptimized
                    className='object-contain'
                    onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                />

                <div className='min-w-0 flex-1'>
                    <p className='text-xs text-muted-foreground mt-0.5'>
                        {totalWorkers.toLocaleString()} workers ·{' '}
                        {facility.powerConsumptionPerTick > 0
                            ? `${facility.powerConsumptionPerTick} MW`
                            : 'produces power'}
                    </p>
                </div>
            </div>

            <div className='space-y-2 text-xs'>
                {facility.needs.length > 0 && (
                    <div>
                        <span className='text-muted-foreground font-medium'>Needs: </span>
                        <div className='flex flex-wrap gap-2 mt-1'>
                            {facility.needs.map(({ resource, quantity }) => (
                                <span
                                    key={resource.name}
                                    className='inline-flex items-center gap-1.5 rounded bg-muted px-2 py-1'
                                >
                                    <Image
                                        src={productImage(resource.name)}
                                        alt={resource.name}
                                        width={64}
                                        height={64}
                                        unoptimized
                                        className='object-contain flex-shrink-0'
                                        onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                    {resource.name} ×{quantity.toLocaleString()}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {facility.produces.length > 0 && (
                    <div>
                        <span className='text-muted-foreground font-medium'>Produces: </span>
                        <div className='flex flex-wrap gap-2 mt-1'>
                            {facility.produces.map(({ resource, quantity }) => (
                                <span
                                    key={resource.name}
                                    className='inline-flex items-center gap-1.5 rounded bg-primary/10 px-2 py-1 text-primary'
                                >
                                    <Image
                                        src={productImage(resource.name)}
                                        alt={resource.name}
                                        width={64}
                                        height={64}
                                        unoptimized
                                        className='object-contain flex-shrink-0'
                                        onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                    {resource.name} ×{quantity.toLocaleString()}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <Button variant='outline' size='sm' disabled className='mt-auto w-full text-xs'>
                Build (coming soon)
            </Button>
        </>
    );
}

export default function BuildFacilityDialog(): React.ReactElement {
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant='outline' size='sm' className='gap-2'>
                    <PlusCircle className='h-4 w-4' />
                    Build facility
                </Button>
            </DialogTrigger>
            <DialogContent className='max-w-4xl max-h-[85vh] flex flex-col p-3 sm:p-6'>
                <DialogHeader>
                    <DialogTitle>Build a New Facility</DialogTitle>
                </DialogHeader>

                <Tabs defaultValue='raw' className='flex-1 overflow-hidden flex flex-col'>
                    <TabsList className='w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0 border-b border-border pb-2'>
                        {FACILITY_LEVELS.map((level) => (
                            <TabsTrigger
                                key={level}
                                value={level}
                                className='data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                            >
                                {FACILITY_LEVEL_LABELS[level]}
                                <Badge variant='secondary' className='ml-1.5 text-[10px] px-1 py-0'>
                                    {facilitiesByLevel[level].length}
                                </Badge>
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {FACILITY_LEVELS.map(
                        (
                            level, // no scroll bar when smallScreen===true
                        ) => (
                            <TabsContent
                                key={level}
                                value={level}
                                className='flex-1 overflow-y-auto mt-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]'
                            >
                                <div className='flex flex-col gap-3 rounded-lg border border-border bg-card p-2 md:p-4'>
                                    {facilitiesByLevel[level].map((entry) => (
                                        <React.Fragment key={entry.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name}>
                                            <FacilityCard entry={entry} />
                                            <Separator className='my-3' />
                                        </React.Fragment>
                                    ))}
                                </div>
                            </TabsContent>
                        ),
                    )}
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
