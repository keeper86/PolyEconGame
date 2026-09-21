import { describe, expect, it } from 'vitest';
import { START_YEAR, TICKS_PER_MONTH, TICKS_PER_YEAR } from '@/simulation/constants';
import {
    YEAR_WINDOW,
    decadeAxis,
    decadeCentre,
    decadeStart,
    decadeWindowAxis,
    ghostMonthVisible,
    isLiveMonthPoint,
    monthAxis,
    monthCentre,
    yearAxis,
    yearCentre,
    yearStart,
    yearWindowAxis,
} from './historyChartAxis';

function tickFor(year: number, monthIndex: number, day: number): number {
    return (year - START_YEAR) * TICKS_PER_YEAR + monthIndex * TICKS_PER_MONTH + day;
}

function livePosition(year: number, monthIndex: number, day: number): number {
    return monthIndex + (day - 1) / TICKS_PER_MONTH;
}

describe('historyChartAxis', () => {
    it('places monthly, yearly and decade averages at the interval centre', () => {
        expect(monthCentre(tickFor(START_YEAR + 1, 2, 15))).toBe(2.5);
        expect(yearCentre(tickFor(START_YEAR + 1, 2, 15))).toBe(START_YEAR + 1.5);
        expect(yearStart(tickFor(START_YEAR + 1, 2, 15))).toBe(START_YEAR + 1);
        expect(decadeStart(tickFor(START_YEAR + 1, 2, 15))).toBe(START_YEAR);
        expect(decadeCentre(tickFor(START_YEAR + 1, 2, 15))).toBe(START_YEAR + 5);
    });

    it('puts month ticks under the averages and gridlines on the month starts', () => {
        const axis = monthAxis();
        expect(axis.domain).toEqual([0, 12]);
        expect(axis.ticks).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5]);
        expect(axis.gridValues).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        expect(axis.tickFormatter(0.5)).toBe('Jan');
        expect(axis.tickFormatter(11.5)).toBe('Dec');
    });

    it('puts year ticks under the averages and gridlines on the year starts', () => {
        const axis = yearAxis(START_YEAR, START_YEAR + 3.4);
        expect(axis.domain[0]).toBe(START_YEAR);
        expect(axis.ticks[0]).toBe(START_YEAR + 0.5);
        expect(axis.gridValues[0]).toBe(START_YEAR);
        expect(axis.tickFormatter(axis.ticks[0])).toBe(`${START_YEAR}`);
        axis.ticks.forEach((tick) => expect(tick % 1).toBe(0.5));
        axis.gridValues.forEach((value) => expect(value % 1).toBe(0));
    });

    it('puts decade ticks under the averages and gridlines on the decade starts', () => {
        const axis = decadeAxis(START_YEAR, START_YEAR + 53);
        expect(axis.domain).toEqual([START_YEAR, START_YEAR + 60]);
        expect(axis.ticks).toEqual([
            START_YEAR + 5,
            START_YEAR + 15,
            START_YEAR + 25,
            START_YEAR + 35,
            START_YEAR + 45,
            START_YEAR + 55,
        ]);
        expect(axis.gridValues).toEqual([
            START_YEAR,
            START_YEAR + 10,
            START_YEAR + 20,
            START_YEAR + 30,
            START_YEAR + 40,
            START_YEAR + 50,
            START_YEAR + 60,
        ]);
        expect(axis.tickFormatter(START_YEAR + 5)).toBe(`${START_YEAR}s`);
    });

    it('keeps the year window at eleven years when there is no history yet', () => {
        expect(yearWindowAxis(undefined, undefined).domain).toEqual([START_YEAR, START_YEAR + YEAR_WINDOW]);
        expect(yearWindowAxis(undefined, START_YEAR + 3.4).domain).toEqual([START_YEAR, START_YEAR + YEAR_WINDOW]);

        const late = yearWindowAxis(undefined, START_YEAR + 40.2);
        expect(late.domain).toEqual([START_YEAR + 30, START_YEAR + 41]);
        expect(late.ticks).toHaveLength(YEAR_WINDOW);
    });

    it('keeps the history window once yearly points exist', () => {
        const withHistory = yearWindowAxis(START_YEAR, START_YEAR + 12.6);
        const plain = yearAxis(START_YEAR, START_YEAR + 12.6);
        expect(withHistory.domain).toEqual(plain.domain);
        expect(withHistory.ticks).toEqual(plain.ticks);
        expect(withHistory.gridValues).toEqual(plain.gridValues);
    });

    it('keeps the decade window at six decades when there is no history yet', () => {
        expect(decadeWindowAxis(undefined, undefined).domain).toEqual([START_YEAR, START_YEAR + 60]);
        expect(decadeWindowAxis(undefined, START_YEAR + 3.4).domain).toEqual([START_YEAR, START_YEAR + 60]);
        expect(decadeWindowAxis(undefined, START_YEAR + 80.2).domain).toEqual([START_YEAR + 30, START_YEAR + 90]);
    });

    it('keeps the history window once decade points exist', () => {
        const firstDecade = START_YEAR + 20;
        const withHistory = decadeWindowAxis(firstDecade, START_YEAR + 53);
        const plain = decadeAxis(firstDecade, START_YEAR + 53);
        expect(withHistory.domain).toEqual(plain.domain);
        expect(withHistory.ticks).toEqual(plain.ticks);
        expect(withHistory.gridValues).toEqual(plain.gridValues);
    });

    it('keeps the ghost month visible until one day before the live tick reaches its centre', () => {
        const april = tickFor(START_YEAR + 1, 3, 15);
        expect(ghostMonthVisible(april, livePosition(START_YEAR + 1, 3, 14))).toBe(true);
        expect(ghostMonthVisible(april, livePosition(START_YEAR + 1, 3, 15))).toBe(false);
        expect(ghostMonthVisible(april, livePosition(START_YEAR + 1, 3, 20))).toBe(false);
        expect(ghostMonthVisible(tickFor(START_YEAR + 1, 4, 15), livePosition(START_YEAR + 1, 3, 20))).toBe(true);
    });

    it('detects live points by their off-centre month position', () => {
        expect(isLiveMonthPoint(undefined)).toBe(false);
        expect(isLiveMonthPoint(0)).toBe(false);
        expect(isLiveMonthPoint(3.5)).toBe(false);
        expect(isLiveMonthPoint(3.4667)).toBe(true);
    });
});
