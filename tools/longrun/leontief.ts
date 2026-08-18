import { FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK } from '../../src/simulation/constants';
import { ALL_PRODUCTION_FACILITY_ENTRIES, type FacilityType } from '../../src/simulation/planet/productionFacilities';
import { maintenanceServiceResourceType } from '../../src/simulation/planet/services';

const TOOL_PLANET = 'tool';
const TOOL_ID = 'preview';
const MAINTENANCE = maintenanceServiceResourceType.name;

interface Leontief {
    resources: string[];
    a: number[][];
    maintenanceIndex: number;
}

function buildLeontiefMatrix(): Leontief {
    const produced = new Map<string, number>();
    for (const key of Object.keys(ALL_PRODUCTION_FACILITY_ENTRIES) as FacilityType[]) {
        const f = ALL_PRODUCTION_FACILITY_ENTRIES[key].factory(TOOL_PLANET, TOOL_ID);
        for (const out of f.produces) {
            produced.set(out.resource.name, out.quantity);
        }
    }
    const resources = [...produced.keys()];
    const idx = new Map(resources.map((r, i) => [r, i]));
    const n = resources.length;
    const a: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

    for (const key of Object.keys(ALL_PRODUCTION_FACILITY_ENTRIES) as FacilityType[]) {
        const f = ALL_PRODUCTION_FACILITY_ENTRIES[key].factory(TOOL_PLANET, TOOL_ID);
        if (f.produces.length === 0) {
            continue;
        }
        const totalOutput = f.produces.reduce((sum, out) => sum + out.quantity, 0);
        for (const out of f.produces) {
            const j = idx.get(out.resource.name)!;
            const share = out.quantity / totalOutput;
            for (const need of f.needs) {
                if (need.resource.form === 'landBoundResource') {
                    continue;
                }
                const i = idx.get(need.resource.name);
                if (i === undefined) {
                    continue;
                }
                a[i][j] += (need.quantity * share) / out.quantity;
            }
            const mi = idx.get(MAINTENANCE)!;
            a[mi][j] += (FACILITY_MAINTENANCE_DEMAND_PER_SCALE_PER_TICK * share) / out.quantity;
        }
    }

    return { resources, a, maintenanceIndex: idx.get(MAINTENANCE)! };
}

function spectralRadius(a: number[][]): number {
    const n = a.length;
    let x = Array(n).fill(1 / Math.sqrt(n));
    for (let iter = 0; iter < 2000; iter++) {
        const y = Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                y[i] += a[i][j] * x[j];
            }
        }
        const norm = Math.sqrt(y.reduce((s, v) => s + v * v, 0));
        if (norm < 1e-15) {
            break;
        }
        for (let i = 0; i < n; i++) {
            y[i] /= norm;
        }
        x = y;
    }
    const ax = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            ax[i] += a[i][j] * x[j];
        }
    }
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
        num += x[i] * ax[i];
        den += x[i] * x[i];
    }
    return den > 0 ? num / den : 0;
}

function matmul(a: number[][], b: number[][]): number[][] {
    const n = a.length;
    const c = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
        for (let k = 0; k < n; k++) {
            if (a[i][k] === 0) {
                continue;
            }
            for (let j = 0; j < n; j++) {
                c[i][j] += a[i][k] * b[k][j];
            }
        }
    }
    return c;
}

function main(): void {
    const { resources, a, maintenanceIndex: m } = buildLeontiefMatrix();
    const n = resources.length;
    const rho = spectralRadius(a);
    console.log(`Sectors: ${n}`);
    console.log(
        `Spectral radius rho(A) = ${rho.toFixed(6)}` +
            (rho >= 1 ? '  (>= 1: Hawkins-Simon violated - economy not productive)' : ''),
    );
    console.log('');
    console.log('Maintenance self-multiplier (Leontief inverse diagonal, Neumann series rounds):');
    let B = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    let L = B.map((row) => [...row]);
    for (let k = 0; k < 12; k++) {
        B = matmul(B, a);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                L[i][j] += B[i][j];
            }
        }
        console.log(`  round ${String(k + 1).padStart(2)}: cumulative multiplier ${L[m][m].toFixed(6)}`);
        if (Math.abs(B[m][m]) < 1e-12) {
            break;
        }
    }
    console.log('');
    console.log('Top direct inputs INTO Maintenance (A[input][Maintenance]):');
    const into = resources
        .map((r, i) => ({ r, v: a[i][m] }))
        .filter((x) => x.v > 0)
        .sort((x, y) => y.v - x.v);
    for (const x of into.slice(0, 8)) {
        console.log(`  ${x.r.padEnd(24)} ${x.v.toFixed(6)}`);
    }
}

main();
