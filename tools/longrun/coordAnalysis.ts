import { simulateChain } from './chainModelCoordination';

const plateau = process.env.PLATEAU === '1';
const r = simulateChain({
    growthPercentPerYear: 0.55,
    stages: 6,
    seedStaffing: 1.0,
    staffingGate: 0.9,
    workersGate: true,
    construction: true,
    seedScale: 1,
    plateau,
});
console.log(`plateau=${plateau} result: collapse`, r.collapsed, 'at', r.years.toFixed(1));
const a = r.annual;
const marks = [1, 500, 1000, 2000, 4000, 6000, 8000, 10000, 11000, 12000, 12400];
for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const isMark = marks.includes(Math.floor(x.year)) || i === a.length - 1;
    if (!isMark) continue;
    const w = a.slice(Math.max(0, i - 50), i + 1);
    const capYr =
        w.length > 1
            ? (Math.pow(w[w.length - 1].capSum / w[0].capSum, 1 / (w[w.length - 1].year - w[0].year)) - 1) * 100
            : 0;
    const fireSum = w.reduce((s, z) => s + z.fires, 0);
    console.log(
        `  y${String(Math.floor(x.year)).padStart(6)}  staffing=${x.staffing.toFixed(3)}  capGrowth(50y,%/yr)=${capYr.toFixed(4)}  fires(50y)=${fireSum}  fill=${x.fill.toFixed(3)}`,
    );
}

