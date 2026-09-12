const TICKS_PER_YEAR = 360;
const TICKS_PER_MONTH = 30;
const MAX_YEARS = 40;
const STARVATION_MONTHS = 12;

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

const BASE_WAGE = 1;
const WAGE_SCARCITY_K = 4;
const WAGE_ADJUST = 0.02;
const QUIT_SENS = 0.008;
const BUFFER_MONTHS = 3;

interface Cfg {
    shockPercent: number;
    shockYear: number;
    quitSignal: 'market' | 'better' | 'none';
    quitSensitivity?: number;
}

interface Row {
    year: number;
    wfA: number;
    wfB: number;
    pool: number;
    wageA: number;
    fillA: number;
    buffer: number;
}

interface SimOut {
    years: number;
    collapsed: boolean;
    rows: Row[];
}

export function simulateLaborMarket(cfg: Cfg): SimOut {
    const sens = cfg.quitSensitivity ?? QUIT_SENS;
    const needA0 = 380;
    const needB0 = 600;
    let wfA = 380;
    let wfB = 600;
    let pool = 3;
    let wageA = BASE_WAGE;
    const wageB = BASE_WAGE;
    let needA = needA0;
    let needB = needB0;
    let buffer = BUFFER_MONTHS * TICKS_PER_MONTH * wfA;
    let starvationMonths = 0;
    let collapseYear = MAX_YEARS;
    const rows: Row[] = [];
    let shocked = false;

    for (let tick = 1; tick <= MAX_YEARS * TICKS_PER_YEAR; tick++) {
        const year = tick / TICKS_PER_YEAR;
        if (!shocked && tick >= cfg.shockYear * TICKS_PER_YEAR) {
            needA *= 1 + cfg.shockPercent / 100;
            shocked = true;
        }
        needA *= Math.pow(1.0005, 1 / TICKS_PER_YEAR);
        needB *= Math.pow(1.0005, 1 / TICKS_PER_YEAR);

        const vacanciesA = Math.max(0, needA - wfA);
        const vacanciesB = Math.max(0, needB - wfB);
        const fillA = needA > 0 ? wfA / needA : 1;

        const targetWageA = BASE_WAGE * (1 + WAGE_SCARCITY_K * Math.max(0, 1 - fillA));
        wageA += WAGE_ADJUST * (targetWageA - wageA);

        let pullB = 0;
        if (cfg.quitSignal !== 'none' && wageA > wageB && vacanciesA > 0) {
            const outside =
                cfg.quitSignal === 'better'
                    ? wageA
                    : (wageA * vacanciesA + wageB * vacanciesB) / Math.max(1, vacanciesA + vacanciesB);
            pullB = Math.max(0, outside - wageB) / wageB;
        }
        const quitsB = wfB * sens * pullB;
        wfB -= quitsB;
        pool += quitsB;

        const hireA = Math.min(vacanciesA, pool);
        wfA += hireA;
        pool -= hireA;
        const hireB = Math.min(vacanciesB, pool * 0.1);
        wfB += hireB;
        pool -= hireB;

        buffer += wfA - needA;
        if (buffer < 0) {
            starvationMonths++;
        } else {
            starvationMonths = 0;
            buffer = Math.min(buffer, BUFFER_MONTHS * TICKS_PER_MONTH * wfA);
        }
        if (starvationMonths >= STARVATION_MONTHS) {
            collapseYear = year;
            break;
        }
        if (tick % TICKS_PER_YEAR === 0) {
            rows.push({ year, wfA, wfB, pool, wageA, fillA, buffer });
        }
    }

    return { years: collapseYear, collapsed: collapseYear < MAX_YEARS, rows };
}

export function main(): void {
    console.log('LABOR-MARKET SHOCK TOY - balanced economy, essential need JUMPS +60% at y3.');
    console.log('Labor is tight (pool ~0). Essential must pull workers from the luxury via wages before its 3-month buffer drains.\n');
    const cfgs = [
        { label: 'no wage pull', quitSignal: 'none' as const },
        { label: 'market-average quit signal (current model)', quitSignal: 'market' as const },
        { label: 'better-offers quit signal (proposed fix)', quitSignal: 'better' as const },
        { label: 'better-offers, weak sensitivity (x0.1)', quitSignal: 'better' as const, quitSensitivity: QUIT_SENS * 0.1 },
    ];
    for (const c of cfgs) {
        const r = simulateLaborMarket({
            shockPercent: 60,
            shockYear: 3,
            quitSignal: c.quitSignal,
            quitSensitivity: c.quitSensitivity,
        });
        const surv = r.collapsed ? r.years.toFixed(1) : 'survived';
        const y3 = r.rows.find((x) => x.year >= 3);
        const y5 = r.rows.find((x) => x.year >= 5);
        const y10 = r.rows.find((x) => x.year >= 10);
        const fmt = (row?: Row) => (row ? `fill=${row.fillA.toFixed(3)} wA=${row.wageA.toFixed(1)} wfA=${row.wfA.toFixed(0)}` : '-');
        console.log(
            `  ${c.label.padEnd(44)} ${surv.padStart(8)}  y3:${fmt(y3)}  y5:${fmt(y5)}  y10:${fmt(y10)}`,
        );
    }
}

if (require.main === module) {
    main();
}
