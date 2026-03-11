import { TICKS_PER_YEAR } from '../constants';

/**
 * Convert an annual probability to its per-tick equivalent so that
 * compounding over `TICKS_PER_YEAR` ticks yields the same annual rate.
 *
 *   1 - (1 - annualRate)^(1 / TICKS_PER_YEAR)
 */

export const convertAnnualToPerTick = (annualRate: number): number => {
    if (annualRate >= 1) {
        return 1;
    }
    return 1 - Math.pow(1 - annualRate, 1 / TICKS_PER_YEAR);
};
