'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ProductionFacility } from '@/simulation/planet/facility';
import { PlusCircle } from 'lucide-react';
import React, { useState } from 'react';
import { FACILITY_LEVELS, FACILITY_LEVEL_LABELS, facilitiesByLevel } from '@/simulation/planet/productionFacilities';
import { CatalogCard } from './CatalogCard';

const PLACEHOLDER_PLANET = 'catalog';
const PLACEHOLDER_ID = 'preview';

export function BuildFacilityDialog({
    agentId,
    planetId,
    constructionServicePrice,
    ownedByName,
    onBuilt,
}: {
    agentId: string;
    planetId: string;
    constructionServicePrice?: number;
    ownedByName: Map<string, ProductionFacility>;
    onBuilt: () => void;
}): React.ReactElement {
    const [open, setOpen] = useState(false);

    const handleBuilt = () => {
        setOpen(false);
        onBuilt();
    };

    const buildableLevels = FACILITY_LEVELS.filter((level) =>
        facilitiesByLevel[level].some((e) => !ownedByName.has(e.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name)),
    );

    const defaultTab = buildableLevels[0];

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant='outline' size='sm' className='gap-1.5 text-xs'>
                    <PlusCircle className='h-3.5 w-3.5' />
                    Build Facility
                </Button>
            </DialogTrigger>
            <DialogContent className='max-w-3xl max-h-[85vh] flex flex-col'>
                <DialogHeader>
                    <DialogTitle>Build a New Facility</DialogTitle>
                </DialogHeader>
                {buildableLevels.length === 0 ? (
                    <p className='text-sm text-muted-foreground py-4 text-center'>
                        All available facilities have already been built.
                    </p>
                ) : (
                    <Tabs defaultValue={defaultTab} className='flex-1 flex flex-col overflow-hidden'>
                        <TabsList className='w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0 border-b border-border pb-2'>
                            {buildableLevels.map((level) => {
                                const count = facilitiesByLevel[level].filter(
                                    (e) => !ownedByName.has(e.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name),
                                ).length;
                                return (
                                    <TabsTrigger
                                        key={level}
                                        value={level}
                                        className='data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
                                    >
                                        {FACILITY_LEVEL_LABELS[level]}
                                        <Badge variant='secondary' className='ml-1.5 text-[10px] px-1 py-0'>
                                            {count}
                                        </Badge>
                                    </TabsTrigger>
                                );
                            })}
                        </TabsList>
                        <div className='flex-1 overflow-y-auto mt-3'>
                            {buildableLevels.map((level) => (
                                <TabsContent key={level} value={level} className='mt-0'>
                                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                                        {facilitiesByLevel[level]
                                            .filter(
                                                (e) =>
                                                    !ownedByName.has(
                                                        e.factory(PLACEHOLDER_PLANET, PLACEHOLDER_ID).name,
                                                    ),
                                            )
                                            .map((entry) => {
                                                const previewName = entry.factory(
                                                    PLACEHOLDER_PLANET,
                                                    PLACEHOLDER_ID,
                                                ).name;
                                                return (
                                                    <CatalogCard
                                                        key={previewName}
                                                        entry={entry}
                                                        agentId={agentId}
                                                        planetId={planetId}
                                                        constructionServicePrice={constructionServicePrice}
                                                        onBuilt={handleBuilt}
                                                    />
                                                );
                                            })}
                                    </div>
                                </TabsContent>
                            ))}
                        </div>
                    </Tabs>
                )}
            </DialogContent>
        </Dialog>
    );
}
