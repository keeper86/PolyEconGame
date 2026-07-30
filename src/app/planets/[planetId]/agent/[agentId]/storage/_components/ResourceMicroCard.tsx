'use client';

import { ProductIcon } from '@/components/client/ProductIcon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatNumberWithUnit } from '@/lib/utils';
import type { FlowRates, ResourceFlowData } from './resourceFlowNormalizer';
import { ResourceFlowTooltip } from './ResourceFlowTooltip';

type StatusLevel = 'green' | 'yellow' | 'red';

function statusDot(level: StatusLevel): React.ReactElement {
    const cls =
        level === 'red'
            ? 'bg-red-500'
            : level === 'yellow'
              ? 'bg-yellow-500'
              : 'bg-green-500';
    return <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} />;
}

function DivergenceMeter({ rates, color }: { rates: FlowRates; color: string }): React.ReactElement {
    const max = Math.max(rates.prevMonthAvgRate, rates.currentMonthAvgRate, rates.lastTickRate, 0.001);
    const p1 = (rates.prevMonthAvgRate / max) * 100;
    const p2 = (rates.currentMonthAvgRate / max) * 100;
    const p3 = (rates.lastTickRate / max) * 100;

    return (
        <div className='flex h-1 w-full gap-[1px] rounded-sm overflow-hidden'>
            <div
                className={`${color} opacity-30 rounded-l-sm`}
                style={{ width: `${p1}%` }}
            />
            <div
                className={`${color} opacity-60`}
                style={{ width: `${p2}%` }}
            />
            <div
                className={`${color} rounded-r-sm`}
                style={{ width: `${p3}%` }}
            />
        </div>
    );
}

type FlowRowProps = {
    label: string;
    icon: string;
    rates: FlowRates;
    color: string;
};

function FlowRow({ label, icon, rates, color }: FlowRowProps): React.ReactElement {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className='flex items-center gap-1 cursor-help group'>
                    <span className='text-[9px] shrink-0 w-3 text-center'>{icon}</span>
                    <div className='flex-1 min-w-0'>
                        <DivergenceMeter rates={rates} color={color} />
                    </div>
                    <span className='text-[9px] tabular-nums text-muted-foreground/60 w-12 text-right shrink-0'>
                        {formatNumberWithUnit(rates.lastTickRate, 'none')}
                    </span>
                </div>
            </TooltipTrigger>
            <TooltipContent side='right' sideOffset={8} className='z-60'>
                <div className='text-[11px] font-medium mb-1'>{label}</div>
                <ResourceFlowTooltip rates={rates} />
            </TooltipContent>
        </Tooltip>
    );
}

function computeStatus(stock: number, flowData: ResourceFlowData): StatusLevel {
    if (stock <= 0 && flowData.inflow.lastTickRate <= 0) {
        return 'red';
    }
    if (flowData.depreciation.lastTickRate > flowData.inflow.lastTickRate + flowData.outflow.lastTickRate) {
        return 'yellow';
    }
    return 'green';
}

export type MicroCardEntry = {
    name: string;
    level: string;
    stock: number;
    flowData: ResourceFlowData;
    tick: number;
};

export function ResourceMicroCard({ entry }: { entry: MicroCardEntry }): React.ReactElement {
    const status = computeStatus(entry.stock, entry.flowData);

    return (
        <div className='flex flex-col gap-1 p-2 rounded-lg border border-border/40 bg-card hover:bg-accent/5 transition-colors min-w-0'>
            {/* Header */}
            <div className='flex items-center gap-1.5 min-w-0'>
                <ProductIcon productName={entry.name} size={20} />
                <span className='text-[10px] font-medium truncate flex-1'>{entry.name}</span>
                {statusDot(status)}
            </div>

            {/* Stock */}
            <div className='text-right'>
                <span className='text-[11px] font-semibold tabular-nums'>
                    {formatNumberWithUnit(entry.stock, 'none')}
                </span>
            </div>

            {/* Flow rows */}
            <div className='flex flex-col gap-0.5'>
                <FlowRow
                    label='Inflow'
                    icon='↓'
                    rates={entry.flowData.inflow}
                    color='bg-sky-500'
                />
                <FlowRow
                    label='Outflow'
                    icon='↑'
                    rates={entry.flowData.outflow}
                    color='bg-amber-500'
                />
                <FlowRow
                    label='Depreciation'
                    icon='✕'
                    rates={entry.flowData.depreciation}
                    color='bg-red-400'
                />
            </div>
        </div>
    );
}