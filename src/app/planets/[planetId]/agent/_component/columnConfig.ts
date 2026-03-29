/**
 * Column configuration for the market table.
 * This provides a single source of truth for column widths, visibility, and other properties.
 */

export interface ColumnConfig {
    /** Unique identifier for the column */
    id: string;
    /** Display label for the header */
    label: string;
    /** Tailwind width class (e.g., 'w-[72px]') */
    widthClass: string;
    /** Title attribute for tooltip */
    title: string;
    /** Text alignment ('text-left', 'text-center', 'text-right') */
    align: 'text-left' | 'text-center' | 'text-right';
    /** Whether this column should be included in the table */
    enabled: boolean;
    /** Priority for responsive dropping (1 = highest, 7 = lowest) */
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
        priority: 3,
    },
    {
        id: 'clearingPrice',
        label: 'Price',
        widthClass: 'w-[72px]',
        title: 'Clearing price',
        align: 'text-right',
        enabled: true,
        priority: 1,
    },
    {
        id: 'totalProduction',
        label: 'Prod',
        widthClass: 'w-[72px]',
        title: 'Total production',
        align: 'text-right',
        enabled: true,
        priority: 5,
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
        priority: 7,
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
        id: 'marketFill',
        label: 'Fill',
        widthClass: 'w-[72px]',
        title: 'Market fill status',
        align: 'text-right',
        enabled: true,
        priority: 2,
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
 * Get the priority for a column by ID
 */
export function getColumnPriority(columnId: string): number {
    const column = MARKET_COLUMNS.find((col) => col.id === columnId);
    return column?.priority || 999;
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
 * Get all enabled columns sorted by priority (highest first)
 */
export function getEnabledColumnsByPriority(): ColumnConfig[] {
    return getEnabledColumns().sort((a, b) => a.priority - b.priority);
}

/**
 * Get all enabled columns in display order (as defined in MARKET_COLUMNS)
 */
export function getEnabledColumnsInDisplayOrder(): ColumnConfig[] {
    return MARKET_COLUMNS.filter((col) => col.enabled);
}

/**
 * Helper to generate column classes for a cell
 */
export function getColumnClasses(columnId: string): string {
    const widthClass = getColumnWidthClass(columnId);
    const alignClass = getColumnAlignClass(columnId);

    return `${widthClass} ${alignClass} shrink-0`.trim();
}

/**
 * Helper to generate column classes for a header cell
 */
export function getHeaderColumnClasses(columnId: string): string {
    const baseClasses = getColumnClasses(columnId);
    return `${baseClasses} text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 select-none`.trim();
}

/**
 * Calculate total width in pixels for a set of columns
 */
export function calculateTotalWidth(columns: ColumnConfig[]): number {
    // Map width classes to pixel values
    const widthMap: Record<string, number> = {
        'w-[72px]': 72,
        'w-[4.5rem]': 72, // 4.5rem = 72px at 16px base
        'w-auto': 0,
    };

    return columns.reduce((total, column) => {
        return total + (widthMap[column.widthClass] || 0);
    }, 0);
}

/**
 * Get visible columns based on available width
 */
export function getVisibleColumns(availableWidth: number): ColumnConfig[] {
    const allColumns = getEnabledColumnsByPriority(); // Sorted by priority (highest first)
    const visible: ColumnConfig[] = [];
    let currentWidth = 0;

    for (const column of allColumns) {
        const columnWidth = 72; // All our columns are w-[72px] = 72px
        if (currentWidth + columnWidth <= availableWidth) {
            visible.push(column);
            currentWidth += columnWidth;
        } else {
            break; // Can't fit more columns
        }
    }

    // Return in display order, not priority order
    return getEnabledColumnsInDisplayOrder().filter((col) => visible.some((v) => v.id === col.id));
}
