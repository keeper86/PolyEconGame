export const LABEL_COLUMN_WIDTH = 145;

export type MarketColumnLabelKey =
    | 'colStock'
    | 'colPrice'
    | 'colProd'
    | 'colCons'
    | 'colSupply'
    | 'colDemand'
    | 'colSold'
    | 'colPriceCost';

export type MarketColumnTitleKey =
    | 'colStockTitle'
    | 'colPriceTitle'
    | 'colProdTitle'
    | 'colConsTitle'
    | 'colSupplyTitle'
    | 'colDemandTitle'
    | 'colSoldTitle'
    | 'colPriceCostTitle';

export interface ColumnConfig {
    id: string;

    labelKey: MarketColumnLabelKey;

    widthClass: string;

    titleKey: MarketColumnTitleKey;

    align: 'text-left' | 'text-center' | 'text-right';

    enabled: boolean;

    priority: number;
}

export const MARKET_COLUMNS: ColumnConfig[] = [
    {
        id: 'currentStorage',
        labelKey: 'colStock',
        widthClass: 'w-[72px]',
        titleKey: 'colStockTitle',
        align: 'text-right',
        enabled: true,
        priority: 2,
    },
    {
        id: 'clearingPrice',
        labelKey: 'colPrice',
        widthClass: 'w-[72px]',
        titleKey: 'colPriceTitle',
        align: 'text-right',
        enabled: true,
        priority: 3,
    },
    {
        id: 'totalProduction',
        labelKey: 'colProd',
        widthClass: 'w-[72px]',
        titleKey: 'colProdTitle',
        align: 'text-right',
        enabled: true,
        priority: 7,
    },
    {
        id: 'totalConsumption',
        labelKey: 'colCons',
        widthClass: 'w-[72px]',
        titleKey: 'colConsTitle',
        align: 'text-right',
        enabled: true,
        priority: 8,
    },
    {
        id: 'totalSupply',
        labelKey: 'colSupply',
        widthClass: 'w-[72px]',
        titleKey: 'colSupplyTitle',
        align: 'text-right',
        enabled: true,
        priority: 6,
    },
    {
        id: 'totalDemand',
        labelKey: 'colDemand',
        widthClass: 'w-[72px]',
        titleKey: 'colDemandTitle',
        align: 'text-right',
        enabled: true,
        priority: 5,
    },
    {
        id: 'totalSold',
        labelKey: 'colSold',
        widthClass: 'w-[72px]',
        titleKey: 'colSoldTitle',
        align: 'text-right',
        enabled: true,
        priority: 4,
    },
    {
        id: 'priceCostRatio',
        labelKey: 'colPriceCost',
        widthClass: 'w-[72px]',
        titleKey: 'colPriceCostTitle',
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
