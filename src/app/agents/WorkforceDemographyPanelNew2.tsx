'use client';

import React, { useMemo } from 'react';
import { Users } from 'lucide-react';
import type { EducationLevelType, WorkforceDemography } from '../../simulation/planet';
import { educationLevelKeys } from '../../simulation/planet';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { computeSummary } from './workforce-summary';
import { WorkforceSkeleton } from './WorkforceSkeleton';
import { EducationLevelCards } from './EducationLevelCards';
import { TenureDistributionChart } from './TenureDistributionChart';
import { AgeDistributionChart } from './AgeDistributionChart';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type WorkforceDemographyPanelProps = {
    allocatedWorkers: Record<EducationLevelType, number>;
    workforceDemography?: WorkforceDemography;
    /** Per-education unused worker counts (idle after all facilities drew workers). */
    unusedWorkers?: Record<EducationLevelType, number>;
    /** Overall idle fraction (0–1). */
    unusedWorkerFraction?: number;
    /** Overqualified worker matrix aggregated across assets: jobEdu -> workerEdu -> count */
    overqualifiedMatrix?: { [jobEdu in EducationLevelType]?: { [workerEdu in EducationLevelType]?: number } };
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function WorkforceDemographyPanel({
    allocatedWorkers,
    workforceDemography,
    unusedWorkers,
    overqualifiedMatrix,
}: WorkforceDemographyPanelProps): React.ReactElement {
    const summary = useMemo(
        () => (workforceDemography && workforceDemography.length > 0 ? computeSummary(workforceDemography) : null),
        [workforceDemography],
    );

    // Flatten overqualified matrix (jobEdu -> workerEdu -> count) into jobEdu -> total count
    const overqualifiedByEdu = (() => {
        if (!overqualifiedMatrix) {
            return undefined;
        }
        const flat: Record<EducationLevelType, number> = {} as Record<EducationLevelType, number>;
        for (const edu of educationLevelKeys) {
            const breakdown = overqualifiedMatrix[edu];
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
                                allocatedWorkers={allocatedWorkers}
                                activeByEdu={summary.activeByEdu}
                                retiringByEdu={summary.retiringByEdu}
                                firedByEdu={summary.firedByEdu}
                                voluntaryByEdu={summary.voluntaryByEdu}
                                nextMonthVoluntaryByEdu={summary.nextMonthVoluntaryByEdu}
                                nextMonthFiredByEdu={summary.nextMonthFiredByEdu}
                                nextMonthRetiringByEdu={summary.nextMonthRetiringByEdu}
                                meanAgeByEdu={summary.meanAgeByEdu}
                                ageProductivityByEdu={summary.ageProductivityByEdu}
                                meanTenureByEdu={summary.meanTenureByEdu}
                                tenureProductivityByEdu={summary.tenureProductivityByEdu}
                                unusedWorkers={unusedWorkers}
                                overqualifiedByEdu={overqualifiedByEdu}
                                overqualifiedBreakdown={overqualifiedMatrix}
                                overallMeanAge={summary.overallMeanAge}
                                overallAgeProductivity={summary.overallAgeProductivity}
                                overallMeanTenure={summary.overallMeanTenure}
                                overallTenureProductivity={summary.overallTenureProductivity}
                            />
                        </div>

                        {/* Charts — each in its own full-width row */}
                        <div>
                            <h5 className='text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider'>
                                Age distribution by tenure
                            </h5>
                            <AgeDistributionChart
                                ageDistribution={summary.ageDistributionByYear}
                                tenureBandLabels={summary.tenureYearLabels}
                            />
                        </div>
                        <div>
                            <h5 className='text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider'>
                                Tenure distribution
                            </h5>
                            <TenureDistributionChart
                                tenureChart={summary.tenureChart}
                                tenureChartByEdu={summary.tenureChartByEdu}
                            />
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
