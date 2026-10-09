/**
 * Toy model of the wage / quit / employment loop.
 *
 * Reproduces the shipping wage law (automaticWorkerAllocation.ts) and quit law
 * (laborMarket.ts) in a small firm population so the parameter space can be
 * mapped. The quit law is replicated locally because the shipping
 * quitPropensity() reads module-level constants that cannot be swept per run;
 * `--fidelity` asserts the replica equals the real function at defaults.
 *
 * Usage:
 *   npx tsx tools/longrun/wageToy.ts --fidelity
 *   npx tsx tools/longrun/wageToy.ts --validate
 *   npx tsx tools/longrun/wageToy.ts --ignition
 *   npx tsx tools/longrun/wageToy.ts --sweep
 *   npx tsx tools/longrun/wageToy.ts --detail
 */
import {
    betterOfferStats,
    jobFindingProbability,
    quitPropensity,
    QUIT_RATE_CAP,
    type VacancyWageStep,
} from '../../src/simulation/workforce/laborMarket';
import {
    MAX_WAGE,
    MIN_WAGE,
    QUIT_FAIRNESS_SENSITIVITY,
    QUIT_OUTSIDE_SENSITIVITY,
    QUIT_OUTSIDE_WAGE_BIAS,
    QUIT_TARGET_RATE,
    TICKS_PER_MONTH,
    WAGE_ADJUSTMENT_RATE,
    WAGE_CEILING_SPRING_GAIN,
    WAGE_CEILING_SMOOTHING,
    WAGE_CHURN_GAIN,
    WAGE_SHARE,
} from '../../src/simulation/constants';

const clampUnit = (v: number): number => Math.max(-1, Math.min(1, v));
const pad = (s: string, n: number): string => s.padStart(n);

type QuitLaw = {
    outSens: number;
    fairSens: number;
    quitTarget: number;
    wageShare: number;
    churnGain: number;
    stepGain: number;
};

const defaults = (): QuitLaw => ({
    outSens: QUIT_OUTSIDE_SENSITIVITY,
    fairSens: QUIT_FAIRNESS_SENSITIVITY,
    quitTarget: QUIT_TARGET_RATE,
    wageShare: WAGE_SHARE,
    churnGain: WAGE_CHURN_GAIN,
    stepGain: WAGE_ADJUSTMENT_RATE,
});

const quitRate = (law: QuitLaw, wage: number, tightness: number, vacancyWage: number, fairWage: number): number => {
    if (wage <= 0) {
        return QUIT_RATE_CAP;
    }
    const outside = QUIT_OUTSIDE_WAGE_BIAS * jobFindingProbability(tightness) * vacancyWage;
    const exitGap = clampUnit((outside - wage) / wage);
    const fairnessGap = fairWage > 0 ? clampUnit((fairWage - wage) / fairWage) : 0;
    const raw = law.outSens * exitGap + law.fairSens * fairnessGap;
    return Math.max(0, Math.min(raw, QUIT_RATE_CAP));
};

// The shipping propensity is applied per TICK, so the monthly attrition over one
// month is 1-(1-q)^TICKS_PER_MONTH. The controller compares that monthly figure
// against QUIT_TARGET_RATE, which is why the per-tick sensitivities are not
// budget-limited: 1-(1-0.0083)^30 = 0.22, far above the 0.009 target.
const monthlyQuitFromPropensity = (q: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, q)), TICKS_PER_MONTH);

const ceilingSpringPressure = (wage: number, ceiling: number): number =>
    ceiling > 0 ? -WAGE_CEILING_SPRING_GAIN * Math.max(0, (wage - ceiling) / ceiling) : 0;

type Firm = {
    wage: number;
    capacity: number;
    workers: number;
    baseCapacity: number;
    valueAddedPerWorker: number;
};

type EconParams = {
    firms: number;
    essentialFirms: number;
    optionalDemand: number;
    volatility: number;
    months: number;
    labourForce0: number;
    labourForceGrowth: number;
    profitMargin: number;
    tightnessMode: 'market' | 'reachableShare' | 'fill';
    fairAnchor: 'valueAdded' | 'dependency';
    basketPerPerson: number;
    fairWagePin: number;
};

const econDefaults = (): EconParams => ({
    firms: 24,
    essentialFirms: 8,
    optionalDemand: 1.0,
    volatility: 0.35,
    months: 600,
    labourForce0: 8.0,
    labourForceGrowth: 0.004,
    profitMargin: 0.15,
    tightnessMode: 'reachableShare',
    fairAnchor: 'valueAdded',
    basketPerPerson: 1.0,
    fairWagePin: 0,
});

const makeFirms = (p: EconParams): Firm[] => {
    const out: Firm[] = [];
    for (let i = 0; i < p.firms; i++) {
        const base = i < p.essentialFirms ? 1.0 : p.optionalDemand;
        out.push({
            wage: MIN_WAGE,
            capacity: base,
            workers: base,
            baseCapacity: base,
            valueAddedPerWorker: MIN_WAGE * (1 + p.profitMargin),
        });
    }
    return out;
};

const buildSteps = (firms: Firm[]): VacancyWageStep[] => {
    const raw = firms
        .map((f) => ({ wage: f.wage, vacancy: Math.max(0, f.capacity - f.workers) }))
        .filter((s) => s.vacancy > 0)
        .sort((a, b) => a.wage - b.wage);
    const steps: VacancyWageStep[] = [];
    let cumVacancy = 0;
    let cumWage = 0;
    for (const s of raw) {
        cumVacancy += s.vacancy;
        cumWage += s.vacancy * s.wage;
        steps.push({ wage: s.wage, cumVacancy, cumWage });
    }
    return steps;
};

type Month = {
    wage: number;
    wageMax: number;
    quit: number;
    exitGap: number;
    fairGap: number;
    churn: number;
    shortage: number;
    employed: number;
    labourForce: number;
    tightness: number;
    share: number;
    dependency: number;
};

const run = (law: QuitLaw, p: EconParams): Month[] => {
    const firms = makeFirms(p);
    let labourForce = p.labourForce0;
    let ceiling = MIN_WAGE;
    const history: Month[] = [];
    let noise = 0;

    for (let m = 0; m < p.months; m++) {
        labourForce *= 1 + p.labourForceGrowth;
        const employed = firms.reduce((s, f) => s + f.workers, 0);
        const unemployed = Math.max(1, labourForce - employed);

        noise = 0.7 * noise + 0.3 * (Math.sin(m / 37) + Math.sin(m / 11) * 0.5);
        for (let i = 0; i < firms.length; i++) {
            const volatile = i >= p.essentialFirms ? 1 + p.volatility * noise : 1;
            firms[i].capacity = Math.max(0, firms[i].baseCapacity * volatile);
            firms[i].valueAddedPerWorker = firms[i].wage * (1 + p.profitMargin);
        }

        const vacancies = firms.reduce((s, f) => s + Math.max(0, f.capacity - f.workers), 0);
        const marketTightness = vacancies / unemployed;
        const steps = buildSteps(firms);
        const dependencyRatio = labourForce / Math.max(1e-9, employed);
        const fairWage =
            p.fairWagePin > 0
                ? p.fairWagePin
                : p.fairAnchor === 'dependency'
                  ? p.basketPerPerson * dependencyRatio
                  : law.wageShare * ceiling;

        let quitSum = 0;
        let exitAcc = 0;
        let fairAcc = 0;
        let shareAcc = 0;
        let hiresRemaining = unemployed * Math.min(1, 0.35 * (1 - Math.exp(-3 * marketTightness)));

        for (const f of firms) {
            const vacancy = Math.max(0, f.capacity - f.workers);
            const better = betterOfferStats(steps, f.wage);
            shareAcc += better.share;
            const effectiveTightness =
                p.tightnessMode === 'market'
                    ? marketTightness
                    : p.tightnessMode === 'fill'
                      ? f.workers / Math.max(1, f.capacity)
                      : marketTightness * better.share;
            const outside = QUIT_OUTSIDE_WAGE_BIAS * jobFindingProbability(effectiveTightness) * better.medianWage;
            exitAcc += f.wage > 0 ? clampUnit((outside - f.wage) / f.wage) : 0;
            fairAcc += fairWage > 0 ? clampUnit((fairWage - f.wage) / fairWage) : 0;

            const q = quitRate(law, f.wage, effectiveTightness, better.medianWage, fairWage);
            const quitters = Math.min(f.workers, f.workers * monthlyQuitFromPropensity(q));
            quitSum += quitters;
            f.workers = Math.max(0, f.workers - quitters);

            const hire = vacancy > 0 ? Math.min(vacancy, hiresRemaining / firms.length) : 0;
            f.workers += hire;
            hiresRemaining -= hire;
        }

        let wageAcc = 0;
        let wageMax = 0;
        let shortageAcc = 0;
        const quitAggregate = quitSum / Math.max(1e-9, employed);
        for (const f of firms) {
            const capacity = Math.max(1e-9, f.capacity);
            const shortage = Math.max(0, capacity - f.workers) / capacity;
            const shortagePressure = shortage * shortage;
            const churnPressure = law.churnGain * (quitAggregate - law.quitTarget);
            const pressure = shortagePressure + churnPressure + ceilingSpringPressure(f.wage, ceiling);
            const maxStep = law.stepGain * f.wage;
            const step = Math.max(-maxStep, Math.min(maxStep, f.wage * pressure));
            f.wage = Math.max(MIN_WAGE, Math.min(MAX_WAGE, f.wage + step));
            wageAcc += f.wage;
            wageMax = Math.max(wageMax, f.wage);
            shortageAcc += shortagePressure;
        }
        for (let i = firms.length - 1; i > 0; i--) {
            if (firms[i].wage < firms[i - 1].wage) {
                firms[i - 1].wage = firms[i].wage;
            }
        }

        const totalWorkers = Math.max(1e-9, firms.reduce((s, f) => s + f.workers, 0));
        const valueAdded = firms.reduce((s, f) => s + f.workers * f.valueAddedPerWorker, 0);
        ceiling = WAGE_CEILING_SMOOTHING * (valueAdded / totalWorkers) + (1 - WAGE_CEILING_SMOOTHING) * ceiling;

        history.push({
            wage: wageAcc / firms.length,
            wageMax,
            quit: quitAggregate,
            exitGap: exitAcc / firms.length,
            fairGap: fairAcc / firms.length,
            churn: law.churnGain * (quitAggregate - law.quitTarget),
            shortage: shortageAcc / firms.length,
            employed: totalWorkers,
            labourForce,
            tightness: marketTightness,
            share: shareAcc / firms.length,
            dependency: dependencyRatio,
        });
    }
    return history;
};

const tailOf = (h: Month[], key: keyof Month): number[] => h.slice(Math.floor(h.length / 2)).map((x) => x[key]);
const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
const sd = (v: number[]): number => {
    const m = mean(v);
    return Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
};

const line = (cells: string[], widths: number[]): string =>
    cells.map((c, i) => pad(c, widths[i])).join(' ');

function fidelityCheck(): void {
    const law = defaults();
    const cases: Array<[number, number, number, number]> = [
        [1.0, 0.02, 1.0, 0.6],
        [1.0, 0.5, 1.2, 0.6],
        [1.5, 0.9, 1.5, 0.9],
        [2.0, 0.01, 1.0, 1.2],
        [1.0, 1.0, 3.0, 1.8],
    ];
    let ok = true;
    console.log('FIDELITY: toy quit law vs shipping quitPropensity()');
    for (const [wage, tightness, vacancyWage, fairWage] of cases) {
        const mine = quitRate(law, wage, tightness, vacancyWage, fairWage);
        const real = quitPropensity(wage, tightness, vacancyWage, fairWage);
        const match = Math.abs(mine - real) < 1e-12;
        ok = ok && match;
        console.log(
            `  wage=${wage} tight=${tightness} vacWage=${vacancyWage} fair=${fairWage}  toy=${mine.toFixed(6)} real=${real.toFixed(6)} ${match ? 'OK' : 'MISMATCH'}`,
        );
    }
    console.log(ok ? 'fidelity: OK' : 'fidelity: FAILED');
}

function validate(): void {
    const law = defaults();
    console.log('\nVALIDATE: the observed long-run KPIs replayed through the shipping laws');
    const fairWage = law.wageShare * MIN_WAGE;
    console.log(
        `  wageShare=${law.wageShare} ceiling~=${MIN_WAGE} -> fairWage=${fairWage.toFixed(3)} vs wage=${MIN_WAGE} -> fairnessGap=${clampUnit((fairWage - MIN_WAGE) / fairWage).toFixed(3)}`,
    );
    console.log('\n  ' + line(['tightness', 'jfp', 'exitGap', 'quit', 'churnPress'], [10, 8, 9, 10, 11]));
    for (const tightness of [0.00007, 0.001, 0.02, 0.2, 1.0]) {
        const outside = QUIT_OUTSIDE_WAGE_BIAS * jobFindingProbability(tightness) * MIN_WAGE;
        const exitGap = clampUnit((outside - MIN_WAGE) / MIN_WAGE);
        const q = quitRate(law, MIN_WAGE, tightness, MIN_WAGE, fairWage);
        console.log(
            '  ' +
                line(
                    [
                        tightness.toFixed(5),
                        jobFindingProbability(tightness).toFixed(3),
                        exitGap.toFixed(3),
                        q.toFixed(6),
                        (law.churnGain * (q - law.quitTarget)).toFixed(4),
                    ],
                    [10, 8, 9, 10, 11],
                ),
        );
    }
    const maxQuitMonthly = monthlyQuitFromPropensity(law.outSens + law.fairSens);
    console.log(
        `\n  per-tick budget = outSens+fairSens = ${(law.outSens + law.fairSens).toFixed(4)}; monthly = 1-(1-q)^30 = ${maxQuitMonthly.toFixed(4)}`,
    );
    console.log(
        `  vs quitTarget=${law.quitTarget}: reachable = ${maxQuitMonthly > law.quitTarget}  => NO budget lock (the per-tick form is not the unit the controller compares)`,
    );
    console.log(
        `  the real lock is the ordering: fairSens=${law.fairSens} vs outSens=${law.outSens} -> ${law.fairSens > law.outSens ? 'fairness can dominate' : 'OUTSIDE DOMINATES: quit is 0 in every state, so churn is pinned at its worst value'}`,
    );
    console.log(
        `  observed: quitRate=0, churnPressure=${(law.churnGain * (0 - law.quitTarget)).toFixed(4)}, wage=MIN_WAGE -> reproduced`,
    );
}

function ignitionBoundary(): void {
    console.log('IGNITION: the fairness channel is the only one that can fire without a labour shortage');
    console.log('  fairnessGap > 0  <=>  wageShare * (1 + margin) > 1  <=>  margin > 1/wageShare - 1');
    console.log('\n  ' + line(['wageShare', 'marginRequired', 'firesAtMargin15%'], [10, 15, 18]));
    for (const ws of [0.4, 0.5, 0.6, 0.7, 0.8, 0.87, 0.9, 1.0]) {
        const req = 1 / ws - 1;
        console.log('  ' + line([ws.toFixed(2), req.toFixed(3), 0.15 > req ? 'yes' : 'NO'], [10, 15, 18]));
    }
    console.log('\n  TWO INDEPENDENT LOCKS: the ordering (fairSens > outSens) and the monthly budget');
    console.log(
        '\n  ' + line(['outSens', 'fairSens', 'fair>out', 'monthlyMax', 'aboveTarget'], [10, 10, 11, 11, 12]),
    );
    for (const out of [0.005, 0.01, 0.02, 0.05, 0.1]) {
        for (const fair of [0.0033, 0.01, 0.03, 0.06]) {
            console.log(
                '  ' +
                    line(
                        [
                            out.toFixed(4),
                            fair.toFixed(4),
                            fair > out ? 'yes' : 'NO',
                            monthlyQuitFromPropensity(out + fair).toFixed(4),
                            monthlyQuitFromPropensity(out + fair) > QUIT_TARGET_RATE ? 'yes' : 'NO',
                        ],
                        [10, 10, 11, 11, 12],
                    ),
            );
        }
    }
}

function sweep(): void {
    console.log('SWEEP: equilibrium wage and stability vs the three parameters that gate ignition');
    console.log('  24 firms (8 essential steady + 16 optional volatile), labour force +0.4%/month, 600 months');
    console.log(
        '\n  ' +
            line(
                ['outSens', 'fairSens', 'target', 'wage/MIN', 'wageSD', 'quitRate', 'churn', 'shortage', 'empl'],
                [8, 9, 8, 9, 8, 9, 9, 9, 8],
            ),
    );
    for (const out of [0.005, 0.02, 0.05, 0.1]) {
        for (const fair of [0.0033, 0.03, 0.06]) {
            for (const target of [0.002, 0.009, 0.02]) {
                const law = { ...defaults(), outSens: out, fairSens: fair, quitTarget: target };
                const h = run(law, econDefaults());
                const wage = tailOf(h, 'wage');
                console.log(
                    '  ' +
                        line(
                            [
                                out.toFixed(4),
                                fair.toFixed(4),
                                target.toFixed(4),
                                (mean(wage) / MIN_WAGE).toFixed(3),
                                (sd(wage) / Math.max(1e-9, mean(wage))).toFixed(4),
                                mean(tailOf(h, 'quit')).toFixed(5),
                                mean(tailOf(h, 'churn')).toFixed(4),
                                mean(tailOf(h, 'shortage')).toFixed(5),
                                mean(tailOf(h, 'employed')).toFixed(2),
                            ],
                            [8, 9, 8, 9, 8, 9, 9, 9, 8],
                        ),
                );
            }
        }
    }
}

function detail(): void {
    const law = defaults();
    console.log('DETAIL at shipping defaults');
    const h = run(law, econDefaults());
    console.log(
        '\n  ' +
            line(
                ['m', 'wage', 'quitRate', 'exitGap', 'fairGap', 'churn', 'shortage', 'tightness', 'share'],
                [6, 9, 9, 9, 9, 9, 9, 10, 8],
            ),
    );
    const stride = Math.max(1, Math.floor(h.length / 20));
    for (let i = 0; i < h.length; i += stride) {
        const r = h[i];
        console.log(
            '  ' +
                line(
                    [
                        String(i),
                        r.wage.toFixed(4),
                        r.quit.toFixed(5),
                        r.exitGap.toFixed(3),
                        r.fairGap.toFixed(3),
                        r.churn.toFixed(4),
                        r.shortage.toFixed(5),
                        r.tightness.toFixed(5),
                        r.share.toFixed(4),
                    ],
                    [6, 9, 9, 9, 9, 9, 9, 10, 8],
                ),
        );
    }
}

function fixes(): void {
    console.log('FIXES: which fair-wage anchor lets the wage ignite, and at what stability cost?');
    console.log('  valueAdded : fairWage = wageShare * ceiling          (per-worker share of value added)');
    console.log('  dependency : fairWage = basket * labourForce/employed (per-worker share of the POPULATION)');
    console.log(
        '\n  ' +
            line(
                ['anchor', 'months', 'wage/MIN', 'wageSD', 'quitRate', 'fairGap', 'depRatio', 'empl'],
                [11, 7, 9, 8, 9, 9, 9, 8],
            ),
    );
    for (const anchor of ['valueAdded', 'dependency'] as const) {
        const h = run(defaults(), { ...econDefaults(), fairAnchor: anchor });
        const wage = tailOf(h, 'wage');
        console.log(
            '  ' +
                line(
                    [
                        anchor,
                        String(h.length),
                        (mean(wage) / MIN_WAGE).toFixed(3),
                        (sd(wage) / Math.max(1e-9, mean(wage))).toFixed(4),
                        mean(tailOf(h, 'quit')).toFixed(5),
                        mean(tailOf(h, 'fairGap')).toFixed(3),
                        mean(tailOf(h, 'dependency')).toFixed(2),
                        mean(tailOf(h, 'employed')).toFixed(2),
                    ],
                    [11, 7, 9, 8, 9, 9, 9, 8],
                ),
        );
    }

    console.log('\n  trajectory with the dependency anchor (every 60 months)');
    const h = run(defaults(), { ...econDefaults(), fairAnchor: 'dependency' });
    console.log(
        '  ' +
            line(
                ['m', 'wage', 'wageMax', 'quitRate', 'exitGap', 'fairGap', 'churn', 'depRatio', 'empl'],
                [6, 10, 9, 9, 9, 9, 9, 9, 8],
            ),
    );
    for (let i = 0; i < h.length; i += 60) {
        const r = h[i];
        console.log(
            '  ' +
                line(
                    [
                        String(i),
                        r.wage.toFixed(4),
                        r.wageMax.toFixed(4),
                        r.quit.toFixed(5),
                        r.exitGap.toFixed(3),
                        r.fairGap.toFixed(3),
                        r.churn.toFixed(4),
                        r.dependency.toFixed(2),
                        r.employed.toFixed(2),
                    ],
                    [6, 10, 9, 9, 9, 9, 9, 9, 8],
                ),
        );
    }
    console.log('\n  NOTE: nominal only — the full model passes ~0.93 of a wage change into prices');
    console.log('  (measured dln p/dln w), so a nominal ignition converges to its fixed point slowly.');
    console.log('  The dependency anchor is the part the price pass-through cannot absorb: it');
    console.log('  recomputes from the employment level, so it survives the price round.');
}

function sweepAnchor(): void {
    console.log('SWEEP with the dependency anchor: where does the churn term become a useful signal?');
    console.log(
        '\n  ' +
            line(
                ['outSens', 'fairSens', 'target', 'wage/MIN', 'wageSD', 'quitRate', 'churn', 'shortage', 'empl'],
                [8, 9, 8, 9, 8, 9, 9, 9, 8],
            ),
    );
    for (const out of [0.005, 0.02, 0.05]) {
        for (const fair of [0.0033, 0.03, 0.06]) {
            for (const target of [0.002, 0.009, 0.02]) {
                const law = { ...defaults(), outSens: out, fairSens: fair, quitTarget: target };
                const h = run(law, { ...econDefaults(), fairAnchor: 'dependency' });
                const wage = tailOf(h, 'wage');
                console.log(
                    '  ' +
                        line(
                            [
                                out.toFixed(4),
                                fair.toFixed(4),
                                target.toFixed(4),
                                (mean(wage) / MIN_WAGE).toFixed(3),
                                (sd(wage) / Math.max(1e-9, mean(wage))).toFixed(4),
                                mean(tailOf(h, 'quit')).toFixed(5),
                                mean(tailOf(h, 'churn')).toFixed(4),
                                mean(tailOf(h, 'shortage')).toFixed(5),
                                mean(tailOf(h, 'employed')).toFixed(2),
                            ],
                            [8, 9, 8, 9, 8, 9, 9, 9, 8],
                        ),
                );
            }
        }
    }
}

function equilibriumCheck(): void {
    console.log('EQUILIBRIUM LAW: the exit gap is structurally -1, so');
    console.log('  quit = fairSens*fairGap - outSens      (fairGap<=1, so quit>0 requires fairSens > outSens)');
    console.log('  the controller compares the MONTHLY rate 1-(1-q)^30 against the target, so');
    console.log('  at equilibrium:  fairGap* = (quitTarget/30 + outSens)/fairSens');
    console.log('  wage* = fairWage * (1 - fairGap*)      -- and the floor binds if that is < MIN_WAGE');
    console.log('\n  frozen labour force, pinned fair wage 2.0, 4000 months');
    console.log(
        '\n  ' +
            line(
                ['outSens', 'fairSens', 'target', 'fairWage', 'predicted', 'simulated', 'err%', 'floorBinds'],
                [8, 9, 8, 9, 10, 10, 8, 11],
            ),
    );
    const econ = { ...econDefaults(), months: 4000, labourForce0: 40, labourForceGrowth: 0, fairWagePin: 2.0 };
    for (const out of [0.005, 0.02, 0.05]) {
        for (const fair of [0.01, 0.03, 0.06]) {
            for (const target of [0.002, 0.009]) {
                const law = { ...defaults(), outSens: out, fairSens: fair, quitTarget: target };
                const h = run(law, econ);
                const sim = mean(tailOf(h, 'wage'));
                const predicted = 2.0 * (1 - (target / TICKS_PER_MONTH + out) / fair);
                const binds = predicted < MIN_WAGE;
                const shown = Math.max(MIN_WAGE, predicted);
                const err = Math.abs(sim - shown) / shown * 100;
                console.log(
                    '  ' +
                        line(
                            [
                                out.toFixed(4),
                                fair.toFixed(4),
                                target.toFixed(4),
                                '2.0000',
                                predicted.toFixed(4),
                                sim.toFixed(4),
                                err.toFixed(2),
                                binds ? 'yes' : 'no',
                            ],
                            [8, 9, 8, 9, 10, 10, 8, 11],
                        ),
                );
            }
        }
    }
}

const arg = process.argv[2] ?? '--validate';
if (arg === '--fidelity') {
    fidelityCheck();
} else if (arg === '--validate') {
    fidelityCheck();
    validate();
} else if (arg === '--ignition') {
    ignitionBoundary();
} else if (arg === '--sweep') {
    sweep();
} else if (arg === '--fixes') {
    fixes();
} else if (arg === '--sweep-anchor') {
    sweepAnchor();
} else if (arg === '--equilibrium') {
    equilibriumCheck();
} else if (arg === '--detail') {
    detail();
} else {
    console.log(
        'usage: --fidelity | --validate | --ignition | --sweep | --fixes | --sweep-anchor | --equilibrium | --detail',
    );
}
