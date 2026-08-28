export const LABEL_COLUMN_WIDTH = 145;

export interface ColumnConfig {
    id: string;

    label: string;

    widthClass: string;

    title: string;

    align: 'text-left' | 'text-center' | 'text-right';

    enabled: boolean;

    priority: number;
}

export const MARKET_COLUMNS: ColumnConfig[] = [
    {
        id: 'currentStorage',
        label: 'Stock',
        widthClass: 'w-[72px]',
        title: 'Current storage quantity',
        align: 'text-right',
        enabled: true,
        priority: 2,
    },
    {
        id: 'clearingPrice',
        label: 'Price',
        widthClass: 'w-[72px]',
        title: 'Clearing price',
        align: 'text-right',
        enabled: true,
        priority: 3,
    },
    {
        id: 'totalProduction',
        label: 'Prod',
        widthClass: 'w-[72px]',
        title: 'Total production',
        align: 'text-right',
        enabled: true,
        priority: 7,
    },
    {
        id: 'totalConsumption',
        label: 'Cons',
        widthClass: 'w-[72px]',
        title: 'Total consumption',
        align: 'text-right',
        enabled: true,
        priority: 8,
    },
    {
        id: 'totalSupply',
        label: 'Supply',
        widthClass: 'w-[72px]',
        title: 'Total supply',
        align: 'text-right',
        enabled: true,
        priority: 6,
    },
    {
        id: 'totalDemand',
        label: 'Demand',
        widthClass: 'w-[72px]',
        title: 'Total demand',
        align: 'text-right',
        enabled: true,
        priority: 5,
    },
    {
        id: 'totalSold',
        label: 'Sold',
        widthClass: 'w-[72px]',
        title: 'Total sold',
        align: 'text-right',
        enabled: true,
        priority: 4,
    },
    {
        id: 'priceCostRatio',
        label: 'Price/Cost',
        widthClass: 'w-[72px]',
        title: 'Revenue / cost',
        align: 'text-right',
        enabled: true,
        priority: 1,
    },
];

function getColumnWidthClass(columnId: string): string {
    const column = MARKET_COLUMNS.find((col) => col.id === columnId);
    return column?.widthClass || 'w-auto';
}

function getColumnAlignClass(columnId: string): string {
    const column = MARKET_COLUMNS.find((col) => col.id === columnId);
    return column?.align || 'text-left';
}

function getEnabledColumns(): ColumnConfig[] {
    return MARKET_COLUMNS.filter((col) => col.enabled);
}

function getEnabledColumnsByPriority(): ColumnConfig[] {
    return getEnabledColumns().sort((a, b) => a.priority - b.priority);
}

function getEnabledColumnsInDisplayOrder(): ColumnConfig[] {
    return MARKET_COLUMNS.filter((col) => col.enabled);
}

export function getColumnClasses(columnId: string): string {
    const widthClass = getColumnWidthClass(columnId);
    const alignClass = getColumnAlignClass(columnId);

    return `${widthClass} ${alignClass} shrink-0`.trim();
}

export function getHeaderColumnClasses(columnId: string): string {
    const baseClasses = getColumnClasses(columnId);
    return `${baseClasses} text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 select-none`.trim();
}

export function getVisibleColumns(availableWidth: number): ColumnConfig[] {
    const allColumns = getEnabledColumnsByPriority();
    const COLUMN_WIDTH = 72;
    const GAP = 8;

    const visible: ColumnConfig[] = [];
    let currentWidth = 0;

    for (const column of allColumns) {
        const needed = visible.length === 0 ? COLUMN_WIDTH : COLUMN_WIDTH + GAP;
        if (currentWidth + needed <= availableWidth) {
            visible.push(column);
            currentWidth += needed;
        } else {
            break;
        }
    }

    return getEnabledColumnsInDisplayOrder().filter((col) => visible.some((v) => v.id === col.id));
}
