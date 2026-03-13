'use client';

import React from 'react';
import ChartCard from '../../components/ChartCard';
import FoodBufferChart from './FoodBufferChart';
import NutritionHeatmapChart from './NutritionHeatmapChart';
import type { AggRow, GroupMode } from './demographicsTypes';

type Props = {
    rows: AggRow[];
    groupMode: GroupMode;
};

export default function DemographyFoodCharts({ rows, groupMode }: Props): React.ReactElement {
    return (
        <ChartCard title='Food &amp; Nutrition'>
            <FoodBufferChart rows={rows} groupMode={groupMode} />
            <div className='my-3 border-t' />
            <NutritionHeatmapChart rows={rows} groupMode={groupMode} />
        </ChartCard>
    );
}
