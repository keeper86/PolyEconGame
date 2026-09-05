import { DEFAULT_CONFIG, MAX_HORIZON_YEARS, simulate } from './chainModel';

function bandRatio(values: number[], windowYears: number): { p90: number; worst: number } {
    const w = Math.max(2, windowYears);
    const ratios: number[] = [];
    for (let i = 0; i + w <= values.length; i++) {
        const slice = values.slice(i, i + w).filter((v) => v > 0);
        if (slice.length < w * 0.7) continue;
        ratios.push(Math.max(...slice) / Math.min(...slice));
    }
    if (ratios.length === 0) return { p90: 1, worst: 1 };
    ratios.sort((a, b) => a - b);
    return { p90: ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * 0.9))], worst: ratios[ratios.length - 1] };
}

const growths = [0.2, 0.6, 1.0, 2.0];
const chainLengths = [2, 3] as const;

console.log('Chain-length scan (inventory controller, maxscale target = sim mode, 3-month target, cap=3x)');
console.log('osc = p90 rolling 30y max/min scale ratio over years 120-600; surv = years survived\n');

console.log('  growth  chain |  surv  conv.osc mine.osc root.osc conv.worst mine.worst root.worst');
for (const g of growths) {
    for (const chain of chainLengths) {
        const r = simulate({
            ...DEFAULT_CONFIG,
            growthPercentPerYear: g,
            controller: 'inventory',
            targetMode: 'maxscale',
            inventoryMonths: 9,
            targetFrac: 1 / 3,
            chainLength: chain,
        });
        const rows = r.rows.slice(120);
        const conv = bandRatio(rows.map((x) => x.converterScale), 30);
        const mine = bandRatio(rows.map((x) => x.mineScale), 30);
        const root = bandRatio(rows.map((x) => x.rootMineScale), 30);
        const surv = r.collapsed ? r.years.toFixed(1) : '600';
        const flag = r.collapsed ? ' COLLAPSE' : '';
        console.log(
            `  ${g.toFixed(1).padStart(5)}  ${chain.toFixed(0).padStart(5)} |  ${surv.padStart(4)} ${conv.p90.toFixed(2).padStart(8)} ${mine.p90.toFixed(2).padStart(8)} ${root.p90.toFixed(2).padStart(8)} ${conv.worst.toFixed(2).padStart(10)} ${mine.worst.toFixed(2).padStart(10)} ${root.worst.toFixed(2).padStart(10)}${flag}`,
        );
    }
}
