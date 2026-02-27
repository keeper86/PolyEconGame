export const TICKS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const TICKS_PER_YEAR = TICKS_PER_MONTH * MONTHS_PER_YEAR; // = 360, derived — never set independently
export const FOOD_PER_PERSON_PER_TICK = 1 / TICKS_PER_YEAR; // tons per person per tick

/** True only on clean month boundaries (every TICKS_PER_MONTH ticks). */
export const isMonthBoundary = (tick: number): boolean => tick > 0 && tick % TICKS_PER_MONTH === 0;

/** True only on clean year boundaries (every TICKS_PER_YEAR ticks). */
export const isYearBoundary = (tick: number): boolean => tick > 0 && tick % TICKS_PER_YEAR === 0;
