import { tickToDate } from '@/components/client/TickDisplay';
export type { Granularity } from '@/components/client/GranularityButtonGroup';

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MONTHLY_X_TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const MONTHLY_GRID_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function bucketDecadeLabel(bucket: number): string {
    const { year } = tickToDate(bucket);
    const decadeStart = Math.floor(year / 10) * 10;
    return `${decadeStart}s`;
}
