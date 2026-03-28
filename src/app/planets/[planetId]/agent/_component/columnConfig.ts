/**
 * Column configuration for the market table.
 * This provides a single source of truth for column widths, visibility, and other properties.
 */

export interface ColumnConfig {
    /** Unique identifier for the column */
    id: string;
    /** Display label for the header */
    label: string;
    /** Tailwind width class (e.g., 'w-14', 'w-12', 'w-[4.5rem]') */
    widthClass: string;
    /** Tailwind responsive display class (e.g., 'hidden sm:inline-block') */
    responsiveClass?: string;
    /** Title attribute for tooltip */
    title: string;
    /** Text alignment ('text-left', 'text-center', 'text-right') */
    align: 'text-left' | 'text-center' | 'text-right';
    /** Whether this column should be included in the table */
    enabled: boolean;
}

export const MARKET_COLUMNS: ColumnConfig[] = [
    {
        id: 'clearingPrice',
        label: 'Price',
        widthClass: 'w-18',
        responsiveClass: '',
        title: 'Clearing price',
        align: 'text-right',
        enabled: true,
    },
    {
        id: 'totalProduction',
        label: 'Prod',
        widthClass: 'w-18',
        responsiveClass: 'hidden sm:inline-block',
        title: 'Total production',
        align: 'text-right',
        enabled: true,
    },
    {
        id: 'totalSupply',
        label: 'Supply',
        widthClass: 'w-18',
        responsiveClass: 'hidden md:inline-block',
        title: 'Total supply',
        align: 'text-right',
        enabled: true,
    },
    {
        id: 'totalDemand',
        label: 'Demand',
        widthClass: 'w-18',
        responsiveClass: 'hidden md:inline-block',
        title: 'Total demand',
        align: 'text-right',
        enabled: true,
    },
    {
        id: 'totalSold',
        label: 'Sold',
        widthClass: 'w-18',
        responsiveClass: 'hidden sm:inline-block',
        title: 'Total sold',
        align: 'text-right',
        enabled: true,
    },
    {
        id: 'marketFill',
        label: 'Fill',
        widthClass: 'w-[4.5rem]',
        responsiveClass: '',
        title: 'Market fill status',
        align: 'text-right',
        enabled: true,
    },
];

/**
 * Get the width class for a column by ID
 */
export function getColumnWidthClass(columnId: string): string {
    const column = MARKET_COLUMNS.find((col) => col.id === columnId);
    return column?.widthClass || 'w-auto';
}

/**
 * Get the responsive class for a column by ID
 */
export function getColumnResponsiveClass(columnId: string): string {
    const column = MARKET_COLUMNS.find((col) => col.id === columnId);
    return column?.responsiveClass || '';
}

/**
 * Get the alignment class for a column by ID
 */
export function getColumnAlignClass(columnId: string): string {
    const column = MARKET_COLUMNS.find((col) => col.id === columnId);
    return column?.align || 'text-left';
}

/**
 * Get all enabled columns
 */
export function getEnabledColumns(): ColumnConfig[] {
    return MARKET_COLUMNS.filter((col) => col.enabled);
}

/**
 * Helper to generate column classes for a cell
 */
export function getColumnClasses(columnId: string): string {
    const widthClass = getColumnWidthClass(columnId);
    const responsiveClass = getColumnResponsiveClass(columnId);
    const alignClass = getColumnAlignClass(columnId);

    return `${widthClass} ${responsiveClass} ${alignClass} shrink-0`.trim();
}

/**
 * Helper to generate column classes for a header cell
 */
export function getHeaderColumnClasses(columnId: string): string {
    const baseClasses = getColumnClasses(columnId);
    return `${baseClasses} text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 select-none`.trim();
}
