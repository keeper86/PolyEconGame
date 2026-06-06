'use client';

import React, { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { computeSummary } from './workforceSummary';
import { WorkforceSkeleton } from './WorkforceSkeleton';
import { EducationLevelCards } from './EducationLevelCards';
import { AgeDistributionChart, type ViewMode } from './AgeDistributionChart';
import { ExperienceDistributionChart } from './ExperienceDistributionChart';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { EducationLevelType } from '@/simulation/population/education';
import { educationLevelKeys } from '@/simulation/population/education';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type WorkforceDemographyPanelProps = {
    assets: AgentPlanetAssets;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function WorkforceDemographyPanel({ assets }: WorkforceDemographyPanelProps): React.ReactElement {
    const [view, setView] = useState<ViewMode>('status');
    const { workforceDemography, allocatedWorkers, unusedWorkers, overqualifiedWorkers, deaths, disabilities } = assets;

    const summary = useMemo(
        () => (workforceDemography && workforceDemography.length > 0 ? computeSummary(workforceDemography) : null),
        [workforceDemography],
    );

    // Flatten overqualified matrix (jobEdu -> workerEdu -> count) into jobEdu -> total count
    const overqualifiedByEdu = (() => {
        if (!overqualifiedWorkers) {
            return undefined;
        }
        const flat: Record<EducationLevelType, number> = {} as Record<EducationLevelType, number>;
        for (const edu of educationLevelKeys) {
            const breakdown = overqualifiedWorkers[edu];
            if (!breakdown) {
                flat[edu] = 0;
                continue;
            }
            let s = 0;
            for (const v of Object.values(breakdown)) {
                s += (v as number) || 0;
            }
            flat[edu] = s;
        }
        return flat as Record<EducationLevelType, number>;
    })();

    return (
        <Card>
            <CardHeader className='pb-3'>
                <CardTitle className='flex items-center gap-2 text-base'>
                    <Users className='h-4 w-4' />
                    Workforce Demography
                </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
                {!summary ? (
                    <WorkforceSkeleton />
                ) : (
                    <>
                        {/* Headcount by education — card grid */}
                        <div>
                            <h5 className='text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider'>
                                Headcount by education
                            </h5>
                            <EducationLevelCards
                                summary={summary}
                                allocatedWorkers={allocatedWorkers}
                                unusedWorkers={unusedWorkers}
                                overqualified={{
                                    byEdu: overqualifiedByEdu,
                                    breakdown: overqualifiedWorkers,
                                }}
                                deaths={deaths}
                                disabilities={disabilities}
                            />
                        </div>

                        {/* Shared view toggle */}
                        <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
                            <TabsList className='h-7 mb-2'>
                                <TabsTrigger value='status' className='text-[10px] px-2 py-0.5'>
                                    By status
                                </TabsTrigger>
                                <TabsTrigger value='education' className='text-[10px] px-2 py-0.5'>
                                    By education
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>

                        {/* Age distribution chart */}
                        <div>
                            <h5 className='text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider'>
                                Age distribution
                            </h5>
                            <AgeDistributionChart
                                view={view}
                                ageChartByStatus={summary.ageChartByStatus}
                                ageChartByEdu={summary.ageChartByEdu}
                            />
                        </div>

                        {/* Experience distribution chart */}
                        <div>
                            <h5 className='text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider'>
                                Tenure per capita (in years)
                            </h5>
                            <ExperienceDistributionChart
                                view={view}
                                experienceChartByStatus={summary.experienceChartByStatus}
                                experienceChartByEdu={summary.experienceChartByEdu}
                            />
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
