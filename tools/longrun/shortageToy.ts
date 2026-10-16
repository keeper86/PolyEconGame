import {
    MAX_WAGE,
    MIN_WAGE,
    TICKS_PER_MONTH,
    WAGE_ADJUSTMENT_RATE,
    WAGE_CEILING_SMOOTHING,
    WAGE_CEILING_SPRING_GAIN,
    WAGE_SHARE,
} from '../../src/simulation/constants';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const clamp01 = (v: number): number => clamp(v, 0, 1);
const pad = (s: string, n: number): string => s.padStart(n);

type ShortageSource = 'ownSlots' | 'reachableTightness' | 'hiringFailure';
type CeilingMode = 'asIs' | 'nonNegative';

type Params = {
    capacity: number;
    hireCapPerTick: number;
    marketWillingPerTick: number;
    affordableCeiling: number;
    preRevenueCeiling: number;
    revenueArrivalMonth: number;
    deflationFloor: number;
    marketTightness: number;
    months: number;
    shortageSource: ShortageSource;
    ceilingMode: CeilingMode;
};

const defaults = (): Params => ({
    capacity: 2000,
    hireCapPerTick: 2,
    marketWillingPerTick: 50,
    affordableCeiling: 5.0,
    preRevenueCeiling: 5.0,
    revenueArrivalMonth: 0,
    deflationFloor: MIN_WAGE,
    marketTightness: 0.001,
    months: 48,
    shortageSource: 'ownSlots',
    ceilingMode: 'nonNegative',
});

type Month = {
    month: number;
    workers: number;
    shortage: number;
    hiringFailure: number;
    pressure: number;
    headroom: number;
    ceiling: number;
    wage: number;
};

const effectiveCeiling = (ceiling: number, mode: CeilingMode): number =>
    mode === 'nonNegative' ? Math.max(0, ceiling) : ceiling;

const headroomOf = (wage: number, ceiling: number, mode: CeilingMode): number => {
    const reference = WAGE_SHARE * ceiling;
    if (reference > 0) {
        return clamp01((reference - wage) / reference);
    }
    return mode === 'nonNegative' ? 0 : 1;
};

const springOf = (wage: number, ceiling: number, mode: CeilingMode): number => {
    const reference = WAGE_SHARE * ceiling;
    if (reference <= 0) {
        return mode === 'nonNegative' ? -WAGE_CEILING_SPRING_GAIN : 0;
    }
    return -WAGE_CEILING_SPRING_GAIN * Math.max(0, (wage - reference) / reference);
};

export function run(p: Params): Month[] {
    let workers = 0;
    let wage = Math.max(MIN_WAGE, p.deflationFloor);
    let ceiling = 0;
    const history: Month[] = [];

    for (let month = 1; month <= p.months; month++) {
        let requested = 0;
        let achieved = 0;
        for (let tick = 0; tick < TICKS_PER_MONTH; tick++) {
            const gap = Math.max(0, p.capacity - workers);
            const want = Math.min(gap, p.hireCapPerTick);
            const got = Math.min(want, p.marketWillingPerTick);
            requested += want;
            achieved += got;
            workers += got;
        }
        const ceilingTarget = month < p.revenueArrivalMonth ? p.preRevenueCeiling : p.affordableCeiling;
        ceiling = WAGE_CEILING_SMOOTHING * ceilingTarget + (1 - WAGE_CEILING_SMOOTHING) * ceiling;
        const ceilingForControl = effectiveCeiling(ceiling, p.ceilingMode);

        const ownShortage = Math.max(0, p.capacity - workers) / Math.max(1, p.capacity);
        const hiringFailure = requested > 0 ? (requested - achieved) / requested : 0;
        const shortage =
            p.shortageSource === 'ownSlots'
                ? ownShortage
                : p.shortageSource === 'hiringFailure'
                  ? hiringFailure
                  : clamp01(p.marketTightness);
        const shortagePressure = shortage * shortage;

        const headroom = headroomOf(wage, ceilingForControl, p.ceilingMode);
        const damped = shortagePressure > 0 ? shortagePressure * headroom : shortagePressure;
        const pressure = damped + springOf(wage, ceilingForControl, p.ceilingMode);
        const step = clamp(wage * pressure, -WAGE_ADJUSTMENT_RATE * wage, WAGE_ADJUSTMENT_RATE * wage);
        wage = clamp(wage + step, Math.max(MIN_WAGE, p.deflationFloor), MAX_WAGE);

        history.push({ month, workers, shortage, hiringFailure, pressure, headroom, ceiling, wage });
    }
    return history;
}

const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
const line = (cells: string[], widths: number[]): string => cells.map((c, i) => pad(c, widths[i])).join(' ');
const peakWage = (h: Month[]): number => Math.max(...h.map((m) => m.wage));
const monthsToFill = (h: Month[], capacity: number): string => {
    const found = h.find((m) => m.workers >= capacity);
    return found ? String(found.month) : 'never';
};

function hireCapSweep(): void {
    console.log('HIRE-CAP SWEEP  (own-slot shortage, tightness=0.001 = deep slack, capacity=2000, ceiling=5 -> target wage=3.0)');
    console.log('  ' + line(['cap/tick', 'monthsToFill', 'peakWage', 'endWage'], [10, 13, 10, 10]));
    for (const cap of [1, 2, 5, 10, 50, 1000]) {
        const p = defaults();
        p.hireCapPerTick = cap;
        const h = run(p);
        console.log(
            '  ' +
                line(
                    [String(cap), monthsToFill(h, p.capacity), peakWage(h).toFixed(3), h[h.length - 1].wage.toFixed(3)],
                    [10, 13, 10, 10],
                ),
        );
    }
}

function capacitySweep(): void {
    console.log('\nCAPACITY SWEEP  (own-slot shortage, cap/tick=2, tightness=0.001, ceiling=5 -> target wage=3.0)');
    console.log('  ' + line(['capacity', 'monthsToFill', 'peakWage', 'endWage'], [10, 13, 10, 10]));
    for (const capacity of [100, 500, 2000, 20000]) {
        const p = defaults();
        p.capacity = capacity;
        const h = run(p);
        console.log(
            '  ' +
                line(
                    [String(capacity), monthsToFill(h, capacity), peakWage(h).toFixed(3), h[h.length - 1].wage.toFixed(3)],
                    [10, 13, 10, 10],
                ),
        );
    }
}

function tightnessSweep(): void {
    console.log('\nMARKET-TIGHTNESS SENSITIVITY  (capacity=2000, cap/tick=2, ceiling=5 -> target wage=3.0)');
    console.log('  ' + line(['tightness', 'peak(ownSlots)', 'peak(tightness)', 'comment'], [10, 14, 15, 30]));
    for (const tightness of [0.001, 0.01, 0.1, 0.5, 2.0]) {
        const own = defaults();
        own.marketTightness = tightness;
        const market = defaults();
        market.marketTightness = tightness;
        market.shortageSource = 'reachableTightness';
        const comment = tightness <= 0.05 ? 'slack market: no real labour shortage' : 'genuinely tight market';
        console.log(
            '  ' +
                line(
                    [tightness.toFixed(3), peakWage(run(own)).toFixed(3), peakWage(run(market)).toFixed(3), comment],
                    [10, 14, 15, 30],
                ),
        );
    }
}


function hiringSweep(): void {
    console.log('\nHIRING-SUCCESS vs OWN-SLOTS  (capacity=2000, cap/tick=2, ceiling=5, adjacent tightness=0.001)');
    console.log('  ' + line(['shortageSource', 'marketWilling', 'monthsToFill', 'peakWage', 'endWage'], [17, 14, 13, 10, 10]));
    for (const source of ['ownSlots', 'hiringFailure'] as ShortageSource[]) {
        for (const willing of [50, 0.5]) {
            const p = defaults();
            p.shortageSource = source;
            p.marketWillingPerTick = willing;
            const h = run(p);
            console.log(
                '  ' +
                    line(
                        [
                            source,
                            willing.toFixed(2),
                            monthsToFill(h, p.capacity),
                            peakWage(h).toFixed(3),
                            h[h.length - 1].wage.toFixed(3),
                        ],
                        [17, 14, 13, 10, 10],
                    ),
            );
        }
    }
}

function ceilingSweep(): void {
    console.log('\nNEGATIVE CEILING  (ownSlots, capacity=2000, cap/tick=2, willing=50, ceiling=-1)');
    console.log('  ' + line(['ceilingMode', 'shortage', 'headroom', 'peakWage', 'endWage'], [13, 10, 10, 10, 10]));
    for (const mode of ['asIs', 'nonNegative'] as CeilingMode[]) {
        const p = defaults();
        p.ceilingMode = mode;
        p.affordableCeiling = -1;
        const h = run(p);
        const mid = h[Math.floor(h.length / 2)];
        console.log(
            '  ' +
                line(
                    [
                        mode,
                        mid.shortage.toFixed(3),
                        mid.headroom.toFixed(3),
                        peakWage(h).toFixed(3),
                        h[h.length - 1].wage.toFixed(3),
                    ],
                    [13, 10, 10, 10, 10],
                ),
        );
    }
}

function fixCompare(): void {
    console.log('\nPROPOSED FIX  (slack market willing=50, capacity=2000, cap/tick=2, ceiling=5 -> target 3.0)');
    console.log('  ' + line(['variant', 'peakWage', 'endWage', 'workers@m12'], [30, 10, 10, 12]));
    const variants: Array<[string, Partial<Params>]> = [
        ['as-is (ownSlots, asIs ceiling)', { shortageSource: 'ownSlots', ceilingMode: 'asIs' }],
        ['shortage=hiringFailure', { shortageSource: 'hiringFailure', ceilingMode: 'asIs' }],
        ['hiringFailure + nonNegative ceiling', { shortageSource: 'hiringFailure', ceilingMode: 'nonNegative' }],
    ];
    for (const [label, over] of variants) {
        const p: Params = { ...defaults(), ...over };
        const h = run(p);
        const at12 = h[Math.min(11, h.length - 1)].workers;
        console.log(
            '  ' + line([label, peakWage(h).toFixed(3), h[h.length - 1].wage.toFixed(3), String(at12)], [30, 10, 10, 12]),
        );
    }
}

function startupCompare(): void {
    console.log(
        '\nSTARTUP CHICKEN-AND-EGG  (capacity=2000, cap/tick=2, willing=50, no revenue until m12 (ceiling=-1), then ceiling=5 -> target 3.0)',
    );
    console.log('  ' + line(['variant', 'wage@m6', 'wage@m11', 'wage@m24', 'peakWage', 'endWage'], [40, 9, 9, 9, 10, 10]));
    const variants: Array<[string, Partial<Params>]> = [
        ['no gate (reference<=0 -> headroom 1)', { ceilingMode: 'asIs' }],
        ['affordability gate, floor MIN_WAGE', { ceilingMode: 'nonNegative', deflationFloor: MIN_WAGE }],
        ['gate + floor = inherited seed 1.5', { ceilingMode: 'nonNegative', deflationFloor: 1.5 }],
        ['gate + theoretical pre-revenue ceiling', { ceilingMode: 'nonNegative', preRevenueCeiling: 5 }],
        ['gate + optimistic pre-revenue ceiling', { ceilingMode: 'nonNegative', preRevenueCeiling: 8 }],
    ];
    for (const [label, over] of variants) {
        const p: Params = { ...defaults(), revenueArrivalMonth: 12, preRevenueCeiling: -1, ...over };
        const h = run(p);
        const at = (m: number): number => h[Math.min(m, h.length) - 1].wage;
        console.log(
            '  ' +
                line(
                    [
                        label,
                        at(6).toFixed(3),
                        at(11).toFixed(3),
                        at(24).toFixed(3),
                        peakWage(h).toFixed(3),
                        h[h.length - 1].wage.toFixed(3),
                    ],
                    [40, 9, 9, 9, 10, 10],
                ),
        );
    }
}

function ignitionSweep(): void {
    const threshold = MIN_WAGE / WAGE_SHARE;
    console.log(
        `\nIGNITION THRESHOLD  (capacity=2000, cap/tick=2, slack market). Pin releases when WAGE_SHARE*ceiling > MIN_WAGE, i.e. ceiling > ${threshold.toFixed(3)}`,
    );
    console.log('  ' + line(['ceiling', 'target=WS*c', 'headroom@1', 'peakWage', 'endWage'], [10, 12, 12, 10, 10]));
    for (const ceiling of [1.0, 1.4, 1.6, threshold, 1.8, 2.0, 2.5, 3.0]) {
        const p = defaults();
        p.affordableCeiling = ceiling;
        const h = run(p);
        const headroom = headroomOf(MIN_WAGE, effectiveCeiling(ceiling, p.ceilingMode), p.ceilingMode);
        console.log(
            '  ' +
                line(
                    [
                        ceiling.toFixed(3),
                        (WAGE_SHARE * ceiling).toFixed(3),
                        headroom.toFixed(3),
                        peakWage(h).toFixed(3),
                        h[h.length - 1].wage.toFixed(3),
                    ],
                    [10, 12, 12, 10, 10],
                ),
        );
    }

    console.log('\nIGNITION vs OPERATING MARGIN  (ceiling = MIN_WAGE*(1+margin); target=WS*ceiling)');
    console.log('  ' + line(['margin', 'target', 'vs MIN_WAGE', 'endWage'], [10, 10, 14, 10]));
    for (const margin of [-0.5, 0.0, 0.25, 0.5, 0.6667, 1.0, 2.0]) {
        const p = defaults();
        p.affordableCeiling = MIN_WAGE * (1 + margin);
        const h = run(p);
        const target = WAGE_SHARE * p.affordableCeiling;
        console.log(
            '  ' +
                line(
                    [
                        margin.toFixed(4),
                        target.toFixed(3),
                        target > MIN_WAGE ? 'above: fires' : 'below: dead',
                        h[h.length - 1].wage.toFixed(3),
                    ],
                    [10, 10, 14, 10],
                ),
        );
    }
}

function trace(): void {
    const p = defaults();
    const h = run(p);
    console.log(
        `\nTRACE  (own-slot shortage, capacity=${p.capacity}, cap/tick=${p.hireCapPerTick}, ceiling=${p.affordableCeiling} -> target wage=${(WAGE_SHARE * p.affordableCeiling).toFixed(2)})`,
    );
    console.log(
        '  ' +
            line(
                ['month', 'workers', 'shortage', 'pressure', 'headroom', 'ceiling', 'target', 'wage'],
                [7, 9, 10, 10, 10, 9, 8, 8],
            ),
    );
    for (const m of h) {
        if (m.month % 4 !== 0 && m.month !== h.length) {
            continue;
        }
        console.log(
            '  ' +
                line(
                    [
                        String(m.month),
                        String(m.workers),
                        m.shortage.toFixed(3),
                        m.pressure.toFixed(3),
                        m.headroom.toFixed(3),
                        m.ceiling.toFixed(3),
                        (WAGE_SHARE * m.ceiling).toFixed(3),
                        m.wage.toFixed(3),
                    ],
                    [7, 9, 10, 10, 10, 9, 8, 8],
                ),
        );
    }
    console.log(`  mean wage after fill = ${mean(h.slice(-6).map((m) => m.wage)).toFixed(3)}  (market wage = 1.000)`);
}


function main(): void {
    const arg = process.argv[2] ?? '--all';
    if (arg === '--all') {
        hireCapSweep();
        capacitySweep();
        tightnessSweep();
        hiringSweep();
        ceilingSweep();
        fixCompare();
        startupCompare();
        trace();
        return;
    }
    if (arg === '--hireCap') {
        hireCapSweep();
        return;
    }
    if (arg === '--capacity') {
        capacitySweep();
        return;
    }
    if (arg === '--tightness') {
        tightnessSweep();
        return;
    }
    if (arg === '--hiring') {
        hiringSweep();
        return;
    }
    if (arg === '--ceiling') {
        ceilingSweep();
        return;
    }
    if (arg === '--fix') {
        fixCompare();
        return;
    }
    if (arg === '--startup') {
        startupCompare();
        return;
    }
    if (arg === '--trace') {
        trace();
        return;
    }
    if (arg === '--ignition') {
        ignitionSweep();
        return;
    }
    console.log(
        'usage: shortageToy.ts [--all | --hireCap | --capacity | --tightness | --hiring | --ceiling | --fix | --startup | --ignition | --trace]',
    );
}

main();
