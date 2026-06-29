export const STORAGE_LABEL_COLUMN_WIDTH = 145;

export interface StorageColumnConfig {
    id: string;
    label: string;
    widthClass: string;
    title: string;
    align: 'text-left' | 'text-center' | 'text-right';
    enabled: boolean;
    priority: number;
}

export const STORAGE_COLUMNS: StorageColumnConfig[] = [
    {
        id: 'prod',
        label: 'Prod',
        widthClass: 'w-[100px]',
        title: 'Production: per tick | this month | last month',
        align: 'text-right',
        enabled: true,
        priority: 1,
    },
    {
        id: 'cons',
        label: 'Cons',
        widthClass: 'w-[100px]',
        title: 'Consumption: per tick | this month | last month',
        align: 'text-right',
        enabled: true,
        priority: 2,
    },
    {
        id: 'depr',
        label: 'Depr',
        widthClass: 'w-[100px]',
        title: 'Depreciation: per tick | this month | last month',
        align: 'text-right',
        enabled: true,
        priority: 3,
    },
    {
        id: 'bought',
        label: 'Bought',
        widthClass: 'w-[100px]',
        title: 'Market purchases: per tick | this month | last month',
        align: 'text-right',
        enabled: true,
        priority: 4,
    },
    {
        id: 'sold',
        label: 'Sold',
        widthClass: 'w-[100px]',
        title: 'Market sales: per tick | this month | last month',
        align: 'text-right',
        enabled: true,
        priority: 5,
    },
];

export function getStorageColumnWidthClass(columnId: string): string {
    const column = STORAGE_COLUMNS.find((col) => col.id === columnId);
    return column?.widthClass || 'w-auto';
}

export function getStorageColumnPriority(columnId: string): number {
    const column = STORAGE_COLUMNS.find((col) => col.id === columnId);
    return column?.priority || 999;
}

export function getStorageColumnAlignClass(columnId: string): string {
    const column = STORAGE_COLUMNS.find((col) => col.id === columnId);
    return column?.align || 'text-left';
}

export function getStorageEnabledColumns(): StorageColumnConfig[] {
    return STORAGE_COLUMNS.filter((col) => col.enabled);
}

export function getStorageEnabledColumnsByPriority(): StorageColumnConfig[] {
    return getStorageEnabledColumns().sort((a, b) => a.priority - b.priority);
}

export function getStorageEnabledColumnsInDisplayOrder(): StorageColumnConfig[] {
    return STORAGE_COLUMNS.filter((col) => col.enabled);
}

export function getStorageColumnClasses(columnId: string): string {
    const widthClass = getStorageColumnWidthClass(columnId);
    const alignClass = getStorageColumnAlignClass(columnId);
    return `${widthClass} ${alignClass} shrink-0`.trim();
}

export function getStorageHeaderColumnClasses(columnId: string): string {
    const baseClasses = getStorageColumnClasses(columnId);
    return `${baseClasses} text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 select-none`.trim();
}

const WIDTH_MAP: Record<string, number> = {
    'w-[100px]': 100,
    'w-auto': 0,
};

export function getStorageVisibleColumns(availableWidth: number): StorageColumnConfig[] {
    const allColumns = getStorageEnabledColumnsByPriority();
    const GAP = 8;

    const visible: StorageColumnConfig[] = [];
    let currentWidth = 0;

    for (const column of allColumns) {
        const colWidth = WIDTH_MAP[column.widthClass] || 100;
        const needed = visible.length === 0 ? colWidth : colWidth + GAP;
        if (currentWidth + needed <= availableWidth) {
            visible.push(column);
            currentWidth += needed;
        } else {
            break;
        }
    }

    return getStorageEnabledColumnsInDisplayOrder().filter((col) => visible.some((v) => v.id === col.id));
}
