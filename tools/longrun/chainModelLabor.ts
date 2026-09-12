import {
    CONTRACTION_INTEGRAL_DECAY,
    CONTRACTION_INTEGRAL_THRESHOLD,
    EXPANSION_INTEGRAL_DECAY,
    EXPANSION_INTEGRAL_THRESHOLD,
    EXPANSION_WORKER_RESERVE_MARGIN,
    MAX_SCALE_CONTRACT_FRACTION,
    MAX_SCALE_EXPAND_FRACTION,
    MIN_SCALE_FRACTION,
    PID_D_ALPHA,
    PID_IMAX,
    PID_KD,
    PID_KI,
    PID_KP,
    PID_OUT_MAX_DOWN,
    PID_OUT_MAX_UP,
    STORAGE_CONTRACTION_RATE,
    STORAGE_EXPANSION_RATE,
    STORAGE_TARGET_MONTHS,
} from '../../src/simulation/planet/automaticProductionScale/constants';

const TICKS_PER_YEAR = 360;
const TICKS_PER_MONTH = 30;
const MAX_YEARS = Number(process.env.HORIZON ?? 600);
const FILL_THRESHOLD = 0.5;
const STARVATION_MONTHS = 12;

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

interface Cfg {
    growthPercentPerYear: number;
    seedScale: number;
    seedStaffing: number;
    staffingGate: number | null;
    workersGate: boolean;
    smooth: boolean;
    contractionEnabled: boolean;
    construction: 'none' | 'log';
    smoothGrowthCap: number;
}

interface Row {
    year: number;
    scale: number;
    maxScale: number;
    staffing: number;
    unemployedFrac: number;
    expansions: number;
    contractions: number;
}

interface Result {
    years: number;
    collapsed: boolean;
    rows: Row[];
}

function computePid(signal: number, s: { integral: number; prevError: number; filteredError: number }): number {
    s.filteredError = PID_D_ALPHA * signal + (1 - PID_D_ALPHA) * s.filteredError;
    const P = PID_KP * signal;
    const D = PID_KD * (s.filteredError - s.prevError);
    s.prevError = s.filteredError;
    if (signal > 0 && s.integral < 0) s.integral = 0;
    const outSat = clamp(P + s.integral + D, -PID_OUT_MAX_DOWN, PID_OUT_MAX_UP);
    const satUp = signal > 0 && outSat >= PID_OUT_MAX_UP;
    const satDown = signal < 0 && outSat <= -PID_OUT_MAX_DOWN;
    if (!satUp && !satDown) s.integral = clamp(s.integral + PID_KI * signal, -PID_IMAX, PID_IMAX);
    return clamp(P + s.integral + D, -PID_OUT_MAX_DOWN, PID_OUT_MAX_UP);
}

function constructionBlockTicks(maxScale: number): number {
    const delta = Math.max(1, MAX_SCALE_EXPAND_FRACTION * maxScale);
    return Math.max(30, Math.round(30 * Math.log(delta)));
}

export function simulateLabor(cfg: Cfg): Result {
    const gPerTick = Math.pow(1 + cfg.growthPercentPerYear / 100, 1 / TICKS_PER_YEAR) - 1;
    const workersPerScale = 1;
    let maxScale = cfg.seedScale;
    let scale = cfg.seedScale;
    let inventory = STORAGE_TARGET_MONTHS * TICKS_PER_MONTH * cfg.seedScale;
    let labor = cfg.seedScale * cfg.seedStaffing;
    let expansionIntegral = 0;
    let contractionIntegral = 0;
    let blockedTicks = 0;
    const pid = { integral: 0, prevError: 0, filteredError: 0 };
    let expansions = 0;
    let contractions = 0;
    let starvationMonths = 0;
    let fillSum = 0;
    const rows: Row[] = [];
    let collapseYear = MAX_YEARS;

    const totalTicks = MAX_YEARS * TICKS_PER_YEAR;
    for (let tick = 1; tick <= totalTicks; tick++) {
        const need = cfg.seedScale * Math.pow(1 + gPerTick, tick);
        labor *= 1 + gPerTick;
        const invTarget = STORAGE_TARGET_MONTHS * TICKS_PER_MONTH * scale;

        const pidOut = computePid(clamp((invTarget - inventory) / Math.max(1e-9, invTarget), -1, 1), pid);
        scale = clamp(scale + pidOut * maxScale, MIN_SCALE_FRACTION * maxScale, maxScale);

        const atCeiling = scale >= maxScale * 0.999;
        const atFloor = scale <= MIN_SCALE_FRACTION * maxScale * 1.001;

        const workerDemand = workersPerScale * scale;
        const staffing = Math.min(1, labor / Math.max(1e-9, workerDemand));
        const unemployed = Math.max(0, labor - workerDemand);

        const output = scale * staffing;
        inventory += output;
        const consumed = Math.min(need, inventory);
        inventory -= consumed;
        const fill = need > 0 ? consumed / need : 1;

        if (atCeiling && inventory < invTarget) {
            expansionIntegral = Math.min(180, expansionIntegral + STORAGE_EXPANSION_RATE);
        } else {
            expansionIntegral = Math.max(0, expansionIntegral - EXPANSION_INTEGRAL_DECAY);
        }
        if (atFloor && inventory > invTarget) {
            contractionIntegral = Math.min(180, contractionIntegral + STORAGE_CONTRACTION_RATE);
        } else {
            contractionIntegral = Math.max(0, contractionIntegral - CONTRACTION_INTEGRAL_DECAY);
        }

        const expansionSize = MAX_SCALE_EXPAND_FRACTION * maxScale;
        if (blockedTicks <= 0 && expansionIntegral >= EXPANSION_INTEGRAL_THRESHOLD) {
            const newWorkers =
                workersPerScale * expansionSize * (cfg.smooth ? 1 : 1 + EXPANSION_WORKER_RESERVE_MARGIN);
            const staffingOk = cfg.staffingGate === null || staffing >= cfg.staffingGate;
            const workersOk = !cfg.workersGate || unemployed >= newWorkers;
            if (staffingOk && workersOk) {
                maxScale *= 1 + MAX_SCALE_EXPAND_FRACTION;
                expansionIntegral = 0;
                expansions++;
                if (cfg.construction === 'log') blockedTicks = constructionBlockTicks(maxScale);
            }
        }
        if (blockedTicks > 0) blockedTicks--;

        if (cfg.contractionEnabled && contractionIntegral >= CONTRACTION_INTEGRAL_THRESHOLD) {
            maxScale *= 1 - MAX_SCALE_CONTRACT_FRACTION;
            scale = Math.min(scale, maxScale);
            contractionIntegral = 0;
            contractions++;
        }

        fillSum += fill;
        if (tick % TICKS_PER_MONTH === 0) {
            const monthFill = fillSum / TICKS_PER_MONTH;
            fillSum = 0;
            if (monthFill < FILL_THRESHOLD) {
                starvationMonths++;
            } else {
                starvationMonths = 0;
            }
            if (starvationMonths >= STARVATION_MONTHS) {
                collapseYear = tick / TICKS_PER_YEAR;
                break;
            }
        }
        if (tick % TICKS_PER_YEAR === 0) {
            rows.push({
                year: tick / TICKS_PER_YEAR,
                scale,
                maxScale,
                staffing,
                unemployedFrac: workerDemand > 0 ? unemployed / workerDemand : 0,
                expansions,
                contractions,
            });
        }
    }

    return { years: collapseYear, collapsed: collapseYear < MAX_YEARS, rows };
}


function summarize(r: Result, fromYear: number): { staffing: number; capGrowth: number } {
    const rows = r.rows.filter((x) => x.year >= fromYear);
    if (rows.length === 0) return { staffing: 0, capGrowth: 0 };
    const meanStaffing = rows.reduce((s, x) => s + x.staffing, 0) / rows.length;
    const first = rows[0];
    const last = rows[rows.length - 1];
    const years = Math.max(1, last.year - first.year);
    const capGrowth = Math.pow(last.maxScale / first.maxScale, 1 / years) - 1;
    return { staffing: meanStaffing, capGrowth };
}

function run(label: string, cfg: Cfg): void {
    const r = simulateLabor(cfg);
    const s = summarize(r, 100);
    const surv = r.collapsed ? r.years.toFixed(1) : '600';
    const staffingMin = r.rows.length ? Math.min(...r.rows.map((x) => x.staffing)) : 0;
    const last = r.rows.at(-1);
    console.log(
        `  ${label.padEnd(48)} surv=${surv.padStart(5)}  staffing(mn/avg)=${staffingMin.toFixed(2)}/${s.staffing.toFixed(3)}  capGrowth(avg%/yr)=${(s.capGrowth * 100).toFixed(3)}  exp=${last?.expansions ?? 0} con=${last?.contractions ?? 0}`,
    );
}

export function main(): void {
    const g = Number(process.env.GROWTH ?? 0.55);
    const scales = [1, 1e5, 1e8];
    console.log(`LABOR TOY - growth ${g}%/yr. Demand & labor both grow at g (labor per capita constant).`);
    console.log('Gates: staffing-efficiency >= 0.9 AND workersAvailable (unemployed >= 2.5% lump x1.3 reserve)');
    console.log('seedStaffing 1.0 = balanced full employment at seed; 0.87 = real-world overbuilt start.\n');

    for (const seed of [1.0, 0.87]) {
        console.log(`--- seedStaffing ${seed} (start staffing ${seed}) ---`);
        for (const constr of ['none', 'log'] as const) {
            run(`lump+2gates+constr-${constr}`, {
                growthPercentPerYear: g,
                seedScale: 1,
                seedStaffing: seed,
                staffingGate: 0.9,
                workersGate: true,
                smooth: false,
                contractionEnabled: true,
                construction: constr,
                smoothGrowthCap: 0,
            });
        }
        run('lump+staffingGate-only (no workersAvailable)', {
            growthPercentPerYear: g,
            seedScale: 1,
            seedStaffing: seed,
            staffingGate: 0.9,
            workersGate: false,
            smooth: false,
            contractionEnabled: true,
            construction: 'none',
            smoothGrowthCap: 0,
        });
        run('lump+staffingGate-only + constr-log', {
            growthPercentPerYear: g,
            seedScale: 1,
            seedStaffing: seed,
            staffingGate: 0.9,
            workersGate: false,
            smooth: false,
            contractionEnabled: true,
            construction: 'log',
            smoothGrowthCap: 0,
        });
        run('lump+workersAvailable-only (no staffing gate)', {
            growthPercentPerYear: g,
            seedScale: 1,
            seedStaffing: seed,
            staffingGate: null,
            workersGate: true,
            smooth: false,
            contractionEnabled: true,
            construction: 'none',
            smoothGrowthCap: 0,
        });
        run('no gates at all', {
            growthPercentPerYear: g,
            seedScale: 1,
            seedStaffing: seed,
            staffingGate: null,
            workersGate: false,
            smooth: false,
            contractionEnabled: true,
            construction: 'none',
            smoothGrowthCap: 0,
        });
        console.log('');
    }

    console.log('--- scale-invariance check (balanced seed, both gates): should survive identically at any seedScale ---');
    for (const sc of scales) {
        run(`seedScale=${sc.toExponential(0)}`, {
            growthPercentPerYear: g,
            seedScale: sc,
            seedStaffing: 1.0,
            staffingGate: 0.9,
            workersGate: true,
            smooth: false,
            contractionEnabled: true,
            construction: 'none',
            smoothGrowthCap: 0,
        });
    }
    console.log('');
    console.log('--- scale-invariance WITH real log construction delay ---');
    for (const sc of scales) {
        run(`seedScale=${sc.toExponential(0)}`, {
            growthPercentPerYear: g,
            seedScale: sc,
            seedStaffing: 1.0,
            staffingGate: 0.9,
            workersGate: true,
            smooth: false,
            contractionEnabled: true,
            construction: 'log',
            smoothGrowthCap: 0,
        });
    }
}

if (require.main === module) {
    main();
}

