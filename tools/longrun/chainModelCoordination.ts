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
const MAX_YEARS = Number(process.env.HORIZON ?? 6000);
const FILL_THRESHOLD = 0.5;
const STARVATION_MONTHS = 12;
const INPUT_RATIO = 1.5;

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

interface Node {
    scale: number;
    maxScale: number;
    inventory: number;
    expInt: number;
    conInt: number;
    pidInt: number;
    prevError: number;
    filteredError: number;
    soldRatio: number;
    rawConsumed: number;
    blockTicks: number;
}

function makeNode(maxScale: number, inventory: number): Node {
    return {
        scale: maxScale,
        maxScale,
        inventory,
        expInt: 0,
        conInt: 0,
        pidInt: 0,
        prevError: 0,
        filteredError: 0,
        soldRatio: 1,
        rawConsumed: 0,
        blockTicks: 0,
    };
}

function computePid(signal: number, n: Node): number {
    n.filteredError = PID_D_ALPHA * signal + (1 - PID_D_ALPHA) * n.filteredError;
    const P = PID_KP * signal;
    const D = PID_KD * (n.filteredError - n.prevError);
    n.prevError = n.filteredError;
    if (signal > 0 && n.pidInt < 0) n.pidInt = 0;
    const outSat = clamp(P + n.pidInt + D, -PID_OUT_MAX_DOWN, PID_OUT_MAX_UP);
    const satUp = signal > 0 && outSat >= PID_OUT_MAX_UP;
    const satDown = signal < 0 && outSat <= -PID_OUT_MAX_DOWN;
    if (!satUp && !satDown) n.pidInt = clamp(n.pidInt + PID_KI * signal, -PID_IMAX, PID_IMAX);
    return clamp(P + n.pidInt + D, -PID_OUT_MAX_DOWN, PID_OUT_MAX_UP);
}

function constructionBlockTicks(maxScale: number): number {
    return Math.max(30, Math.round(30 * Math.log(Math.max(1, MAX_SCALE_EXPAND_FRACTION * maxScale))));
}

interface Cfg {
    growthPercentPerYear: number;
    stages: number;
    seedStaffing: number;
    staffingGate: number | null;
    workersGate: boolean;
    construction: boolean;
    seedScale: number;
    plateau?: boolean;
}

interface AnnualRow {
    year: number;
    staffing: number;
    capGrowth: number;
    fires: number;
    contractions: number;
    fill: number;
    capSum: number;
}

interface SimOut {
    years: number;
    collapsed: boolean;
    annual: AnnualRow[];
}

export function simulateChain(cfg: Cfg): SimOut {
    const gPerTick = Math.pow(1 + cfg.growthPercentPerYear / 100, 1 / TICKS_PER_YEAR) - 1;
    const stages = cfg.stages;
    const sumAtSeed = (Math.pow(INPUT_RATIO, stages) - 1) / (INPUT_RATIO - 1);
    let labor = sumAtSeed * cfg.seedScale * cfg.seedStaffing;
    let demandMultiplier = 1;
    let smoothedFill = 1;
    const nodes: Node[] = [];
    for (let k = 0; k < stages; k++) {
        const scale = Math.pow(INPUT_RATIO, stages - 1 - k) * cfg.seedScale;
        nodes.push(makeNode(scale, STORAGE_TARGET_MONTHS * TICKS_PER_MONTH * scale));
    }
    let starvationMonths = 0;
    let fillSum = 0;
    let fires = 0;
    let contractions = 0;
    let lastFires = 0;
    let lastContractions = 0;
    let collapseYear = MAX_YEARS;
    const annual: SimOut['annual'] = [];

    const totalTicks = MAX_YEARS * TICKS_PER_YEAR;
    for (let tick = 1; tick <= totalTicks; tick++) {
        const effGrowth = cfg.plateau ? gPerTick * clamp((smoothedFill - 0.5) / 0.5, 0, 1) : gPerTick;
        demandMultiplier *= 1 + effGrowth;
        labor *= 1 + effGrowth;
        const needFinal = cfg.seedScale * demandMultiplier;

        for (const n of nodes) {
            const invTarget = STORAGE_TARGET_MONTHS * TICKS_PER_MONTH * n.scale;
            const signal = clamp((invTarget - n.inventory) / Math.max(1e-9, invTarget), -1, 1);
            const pidOut = computePid(signal, n);
            n.scale = clamp(n.scale + pidOut * n.maxScale, MIN_SCALE_FRACTION * n.maxScale, n.maxScale);
        }

        const totalWorkerDemand = nodes.reduce((s, n) => s + n.scale, 0);
        const staffing = Math.min(1, labor / Math.max(1e-9, totalWorkerDemand));
        const unemployed = Math.max(0, labor - totalWorkerDemand);

        let finalFill = 1;
        for (let k = stages - 1; k >= 0; k--) {
            const n = nodes[k];
            const need = k === stages - 1 ? needFinal : nodes[k + 1].rawConsumed;
            const upstreamRatio = k === 0 ? 1 : nodes[k - 1].soldRatio;
            const atCeiling = n.scale >= n.maxScale * 0.999;
            const eff = Math.min(staffing, upstreamRatio);
            const produced = n.scale * eff;
            n.inventory += produced;
            const consumed = Math.min(need, n.inventory);
            n.inventory -= consumed;
            n.soldRatio = need > 0 ? consumed / need : 1;
            n.rawConsumed = produced * INPUT_RATIO;
            if (k === stages - 1) {
                finalFill = n.soldRatio;
            }

            if (atCeiling && n.inventory < invTargetOf(n)) {
                n.expInt = Math.min(180, n.expInt + STORAGE_EXPANSION_RATE);
            } else {
                n.expInt = Math.max(0, n.expInt - EXPANSION_INTEGRAL_DECAY);
            }
            const atFloor = n.scale <= MIN_SCALE_FRACTION * n.maxScale * 1.001;
            if (atFloor && n.inventory > invTargetOf(n)) {
                n.conInt = Math.min(180, n.conInt + STORAGE_CONTRACTION_RATE);
            } else {
                n.conInt = Math.max(0, n.conInt - CONTRACTION_INTEGRAL_DECAY);
            }

            if (n.blockTicks <= 0 && n.expInt >= EXPANSION_INTEGRAL_THRESHOLD) {
                const newWorkers =
                    MAX_SCALE_EXPAND_FRACTION * n.maxScale * (1 + EXPANSION_WORKER_RESERVE_MARGIN);
                const staffingOk = cfg.staffingGate === null || staffing >= cfg.staffingGate;
                const workersOk = !cfg.workersGate || unemployed >= newWorkers;
                if (staffingOk && workersOk) {
                    n.maxScale *= 1 + MAX_SCALE_EXPAND_FRACTION;
                    n.expInt = 0;
                    fires++;
                    if (cfg.construction) n.blockTicks = constructionBlockTicks(n.maxScale);
                }
            }
            if (n.blockTicks > 0) n.blockTicks--;

            if (n.conInt >= CONTRACTION_INTEGRAL_THRESHOLD) {
                n.maxScale *= 1 - MAX_SCALE_CONTRACT_FRACTION;
                n.scale = Math.min(n.scale, n.maxScale);
                n.conInt = 0;
                contractions++;
            }
        }

        fillSum += finalFill;
        if (tick % TICKS_PER_MONTH === 0) {
            const monthFill = fillSum / TICKS_PER_MONTH;
            fillSum = 0;
            smoothedFill = 0.98 * smoothedFill + 0.02 * monthFill;
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
            const prevYear = annual.length ? annual[annual.length - 1] : null;
            const capSum = nodes.reduce((s, n) => s + n.maxScale, 0);
            const capGrowth =
                prevYear && prevYear.capSum ? Math.pow(capSum / prevYear.capSum, 1) - 1 : 0;
            annual.push({
                year: tick / TICKS_PER_YEAR,
                staffing,
                capGrowth: prevYear ? capGrowth : 0,
                fires: fires - lastFires,
                contractions: contractions - lastContractions,
                fill: finalFill,
                capSum,
            });
            lastFires = fires;
            lastContractions = contractions;
        }
    }

    return { years: collapseYear, collapsed: collapseYear < MAX_YEARS, annual };
}

function invTargetOf(n: Node): number {
    return STORAGE_TARGET_MONTHS * TICKS_PER_MONTH * n.scale;
}


function run(label: string, cfg: Cfg): void {
    const r = simulateChain(cfg);
    const rows = r.annual;
    const surv = r.collapsed ? r.years.toFixed(1) : '6000';
    const late = rows.slice(Math.max(0, rows.length - 100));
    const early = rows.slice(0, 100);
    const staffingNow = rows.length ? rows[rows.length - 1].staffing : 0;
    const staffingEarly = rows.length ? early.reduce((s, x) => s + x.staffing, 0) / early.length : 0;
    const staffingLate = late.length ? late.reduce((s, x) => s + x.staffing, 0) / late.length : 0;
    const capGrowthLate = late.length
        ? Math.pow(late[late.length - 1].capSum / late[0].capSum, 1 / Math.max(1, late[late.length - 1].year - late[0].year)) - 1
        : 0;
    const firesYear = rows.length ? rows.reduce((s, x) => s + x.fires, 0) / Math.max(1, rows.length) : 0;
    const maxFiresYear = rows.length ? Math.max(...rows.map((x) => x.fires)) : 0;
    console.log(
        `  ${label.padEnd(38)} surv=${surv.padStart(5)}  staffing early/late=${staffingEarly.toFixed(3)}/${staffingLate.toFixed(3)}  now=${staffingNow.toFixed(3)}  capGrowth(late,%/yr)=${(capGrowthLate * 100).toFixed(3)}  fires/yr(avg/max)=${firesYear.toFixed(1)}/${maxFiresYear}`,
    );
}

export function main(): void {
    const g = Number(process.env.GROWTH ?? 0.55);
    console.log(`COORDINATION TOY - ${g}%/yr growth, labor per capita constant, ${INPUT_RATIO} input ratio per stage`);
    console.log('Chain of N stages (root->...->final) sharing ONE labor pool. Real gates on by default.\n');

    console.log('--- stage count vs staffing-gate-only (no workersAvailable) ---');
    for (const stages of [1, 3, 6, 12]) {
        run(`stages=${stages} staffingGate-only`, {
            growthPercentPerYear: g,
            stages,
            seedStaffing: 1.0,
            staffingGate: 0.9,
            workersGate: false,
            construction: false,
            seedScale: 1,
        });
    }
    console.log('\n--- stage count vs BOTH gates ---');
    for (const stages of [1, 3, 6, 12]) {
        run(`stages=${stages} both-gates`, {
            growthPercentPerYear: g,
            stages,
            seedStaffing: 1.0,
            staffingGate: 0.9,
            workersGate: true,
            construction: false,
            seedScale: 1,
        });
    }
    console.log('\n--- stage count vs both gates + construction delay ---');
    for (const stages of [1, 3, 6, 12]) {
        run(`stages=${stages} both+constr`, {
            growthPercentPerYear: g,
            stages,
            seedStaffing: 1.0,
            staffingGate: 0.9,
            workersGate: true,
            construction: true,
            seedScale: 1,
        });
    }
    console.log('\n--- plateau feedback (population growth decelerates as food fill falls) ---');
    for (const stages of [6]) {
        run(`stages=${stages} both-gates NO plateau`, {
            growthPercentPerYear: g,
            stages,
            seedStaffing: 1.0,
            staffingGate: 0.9,
            workersGate: true,
            construction: true,
            seedScale: 1,
            plateau: false,
        });
        run(`stages=${stages} both-gates + plateau`, {
            growthPercentPerYear: g,
            stages,
            seedStaffing: 1.0,
            staffingGate: 0.9,
            workersGate: true,
            construction: true,
            seedScale: 1,
            plateau: true,
        });
    }
    console.log('\n--- scale-invariance at stages=6 (both gates) ---');
    for (const sc of [1, 1e5, 1e8]) {
        run(`seedScale=${sc.toExponential(0)}`, {
            growthPercentPerYear: g,
            stages: 6,
            seedStaffing: 1.0,
            staffingGate: 0.9,
            workersGate: true,
            construction: true,
            seedScale: sc,
        });
    }
}

if (require.main === module) {
    main();
}

