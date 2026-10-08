import {
    QUIT_FAIRNESS_SENSITIVITY,
    QUIT_OUTSIDE_SENSITIVITY,
    QUIT_TARGET_RATE,
    TICKS_PER_MONTH,
} from '../../src/simulation/constants';
import { quitPropensity } from '../../src/simulation/workforce/laborMarket';

const WAGE = 1;

const fairnessScan = () => {
    console.log('A. fairness-only channel (tightness 0, no vacancy wage => outside 0):');
    console.log('   fairWage  fairGap   propensity/tick  propensity/month');
    for (let fairWage = 1.2; fairWage <= 3.01; fairWage += 0.2) {
        const p = quitPropensity(WAGE, 0, 0, fairWage);
        const fairGap = (fairWage - WAGE) / fairWage;
        console.log(
            `   ${fairWage.toFixed(2).padStart(8)} ${fairGap.toFixed(3).padStart(8)} ${p.toFixed(5).padStart(16)} ${(
                p * TICKS_PER_MONTH
            )
                .toFixed(4)
                .padStart(17)}`,
        );
    }
};

const outsideScan = () => {
    console.log('\nB. outside-only channel (fairWage = wage => fairnessGap 0):');
    console.log('   vacancyWage  exitGap  propensity/tick');
    for (const vacancyWage of [1.0, 1.1, 1.2, 1.3, 1.5, 2.0, 3.0]) {
        const p = quitPropensity(WAGE, 3, vacancyWage, WAGE);
        console.log(`   ${vacancyWage.toFixed(2).padStart(12)} ${(vacancyWage - WAGE).toFixed(2).padStart(8)} ${p.toFixed(5).padStart(16)}`);
    }
};

const scalingInvariance = () => {
    console.log('\nC. scaling both sensitivities by k (ratio 2 kept, exitGap -1, fairGap 0.3):');
    const exitGap = -1;
    const fairGap = 0.3;
    for (const k of [1, 10, 100, 1000]) {
        const raw = k * QUIT_OUTSIDE_SENSITIVITY * exitGap + k * QUIT_FAIRNESS_SENSITIVITY * fairGap;
        console.log(`   k=${String(k).padStart(4)}  raw=${raw.toFixed(5).padStart(9)}  sign=${raw > 0 ? '+' : '-'}`);
    }
};

const targetScale = () => {
    console.log('\nD. the control target vs the term scale:');
    console.log(`   QUIT_TARGET_RATE            = ${QUIT_TARGET_RATE}/month = ${(QUIT_TARGET_RATE / TICKS_PER_MONTH).toFixed(5)}/tick`);
    console.log(`   term scale (fair, gap 0.5)  = ${(QUIT_FAIRNESS_SENSITIVITY * 0.5).toFixed(4)}/tick`);
    console.log(`   term scale (outside, gap 1) = ${(QUIT_OUTSIDE_SENSITIVITY * 1).toFixed(4)}/tick`);
    console.log(
        `   ratio target/term scale     = ${(QUIT_TARGET_RATE / TICKS_PER_MONTH / (QUIT_FAIRNESS_SENSITIVITY * 0.5)).toFixed(6)}`,
    );
};

fairnessScan();
outsideScan();
scalingInvariance();
targetScale();
