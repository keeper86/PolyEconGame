import { Badge } from '@/components/ui/badge';
import { formatNumberWithUnit } from '@/lib/utils';
import { computeFacilityConditionEfficiency, isFacilityOperating, type Facility } from '@/simulation/planet/facility';
import {
    facilityMaintenanceConsumptionPerTick,
    facilityRestorationCapacityPerTick,
} from '@/simulation/planet/facilityMaintenance';
import type { AgentPlanetAssets } from '@/simulation/planet/planet';
import { getAllFacilities } from '@/simulation/planet/planet';

function fmt(n: number): string {
    return formatNumberWithUnit(n, 'units');
}

function conditionTone(status: number, max: number): string {
    const ratio = max > 0 ? status / max : 0;
    if (ratio >= 0.75) {
        return 'text-green-600 dark:text-green-400';
    }
    if (ratio >= 0.4) {
        return 'text-yellow-600 dark:text-yellow-400';
    }
    return 'text-red-600 dark:text-red-400';
}

type MaintenanceState = { label: string; tone: string };

function maintenanceState(facility: Facility): MaintenanceState {
    if (!isFacilityOperating(facility)) {
        return { label: 'under construction', tone: 'text-muted-foreground' };
    }
    const expected = facilityMaintenanceConsumptionPerTick(facility);
    if (expected <= 0) {
        return { label: 'idle', tone: 'text-muted-foreground' };
    }
    if (facility.maintenanceStatus >= facility.maxMaintenance - 1e-9) {
        return { label: 'full', tone: 'text-green-600 dark:text-green-400' };
    }
    const maintained = facility.lastTickMaintenanceConsumption >= expected - 1e-9;
    return maintained
        ? { label: 'maintained', tone: 'text-green-600 dark:text-green-400' }
        : { label: 'under-maintained', tone: 'text-red-600 dark:text-red-400' };
}

export function FacilitiesMaintenanceDebug({ assets }: { assets: AgentPlanetAssets }): React.ReactElement {
    const facilities = getAllFacilities(assets);

    const entry = (label: string, value: string) => (
        <span>
            {label}: <span className='font-mono'>{value}</span>
        </span>
    );

    return (
        <div className='rounded-lg border-2 border-orange-400/60 bg-orange-50/30 dark:bg-orange-950/10 p-4 space-y-3 text-xs'>
            <div className='flex items-center gap-2'>
                <Badge variant='outline' className='border-orange-400 text-orange-600 text-[10px] font-bold'>
                    TEMP DEBUG
                </Badge>
                <span className='font-semibold text-orange-700 dark:text-orange-400'>Facility Maintenance</span>
            </div>

            {facilities.length === 0 ? (
                <p className='italic text-muted-foreground'>No facilities</p>
            ) : (
                <div className='space-y-2'>
                    {facilities.map((facility) => {
                        const state = maintenanceState(facility);
                        const tone = conditionTone(facility.maintenanceStatus, facility.maxMaintenance);
                        const expected = facilityMaintenanceConsumptionPerTick(facility);
                        const degraded = facility.maxMaintenance < 1;
                        return (
                            <div key={facility.id} className='rounded-md border border-orange-400/30 p-2 space-y-1'>
                                <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
                                    <span className='font-semibold'>{facility.name.replace(/_/g, ' ')}</span>
                                    <span className='font-mono text-muted-foreground'>
                                        {fmt(facility.scale)}/{fmt(facility.maxScale)}
                                    </span>
                                    <span className={tone}>
                                        {Math.round(facility.maintenanceStatus * 100)}% /{' '}
                                        {Math.round(facility.maxMaintenance * 100)}% max
                                    </span>
                                    <span className={`font-medium ${state.tone}`}>{state.label}</span>
                                </div>
                                <div className='flex flex-wrap gap-x-4 gap-y-0.5'>
                                    {entry(
                                        'Maintenance',
                                        `${fmt(facility.lastTickMaintenanceConsumption)}/${fmt(expected)}/tick`,
                                    )}
                                    {entry(
                                        'CondEff',
                                        `${Math.round(computeFacilityConditionEfficiency(facility.maintenanceStatus) * 100)}%`,
                                    )}
                                    {degraded &&
                                        entry(
                                            'Restore',
                                            `${fmt(facility.lastTickRestorationConsumption)}/${fmt(facilityRestorationCapacityPerTick(facility))}/tick`,
                                        )}
                                    {entry('RepairAcc', facility.cumulativeRepairAcc.toFixed(3))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
