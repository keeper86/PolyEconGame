// Monthly probe: dump, for every agent that owns an Iron Mine, the workforce
// accounting that can explain a mine-side worker shortage. Gated by MINE_PROBE=1
// in run.ts. Records per-education: firm internal pool (active/onboarding/leaving),
// wage offered, slot capacity vs fill, and the mine's production workerEfficiency.
//
// The point of the probe is to see WHY a mine runs at low workerEfficiency while the
// planet shows large unemployment: is the firm's own onboarding dry (no recruits into
// its active pool), is its offered wage stuck at the floor, are the slots filled with
// overqualified but under-productive bodies, or is demand (req x scale) climbing faster
// than the pool? Each field addresses one candidate.
import type { GameState } from '../../src/simulation/planet/planet';
import type { ProductionFacility, Facility } from '../../src/simulation/planet/facility';
import { educationLevelKeys, type EducationLevelType } from '../../src/simulation/population/education';
import { getAllFacilities } from '../../src/simulation/planet/planet';
import {
    totalActiveForEdu,
    totalDepartingForEdu,
    totalOnboardingForEdu,
    sumSlotFillByEdu,
    sumTotalUsedByEdu,
} from '../../src/simulation/workforce/workforceAggregates';
import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import path from 'node:path';

type EduRec = { [L in EducationLevelType]?: number };

const empty = (): EduRec => ({ none: 0, primary: 0, secondary: 0, tertiary: 0 });
const fmt = (r: EduRec): string => educationLevelKeys.map((e) => Math.round(r[e] ?? 0)).join(',');

const minesOf = (fac: Facility): ProductionFacility | null =>
    fac.type === 'production' && fac.name === 'Iron Mine' ? (fac as ProductionFacility) : null;

export function mineWorkerProbe(gameState: GameState, outDir: string): void {
    const file = path.join(outDir, 'mineProbe.csv');
    for (const agent of gameState.agents.values()) {
        for (const [planetId, assets] of Object.entries(agent.assets)) {
            const facilities = getAllFacilities(assets, true);
            const mine = facilities.map(minesOf).find((m) => m !== null);
            if (!mine) {
                continue;
            }
            const wf = assets.workforceDemography;
            const byEdu = (fn: (w: NonNullable<typeof wf>, e: EducationLevelType) => number): EduRec =>
                wf ? educationLevelKeys.reduce((a, e) => ((a[e] = fn(wf, e)), a), empty()) : empty();

            const active = byEdu(totalActiveForEdu);
            const onboarding = byEdu(totalOnboardingForEdu);
            const departing = byEdu(totalDepartingForEdu);
            const slotFill = sumSlotFillByEdu(assets);
            const slotUsed = sumTotalUsedByEdu(assets);
            const cap = assets.totalSlotCapacity ?? empty();

            const res = mine.lastTickResults;
            const wEff = (res?.workerEfficiency ?? {}) as Partial<Record<EducationLevelType, number>>;
            const dem = empty();
            for (const e of educationLevelKeys) {
                dem[e] = (mine.workerRequirement[e] ?? 0) * mine.scale;
            }
            const wage = assets.wagePerEdu ?? empty();
            const alloc = assets.allocatedWorkers ?? empty();

            const weAll = educationLevelKeys
                .map((e) => (wEff[e] === undefined ? `${e}:na` : `${e}:${wEff[e].toFixed(3)}`))
                .join(' ');

            row(
                file,
                [
                    String(gameState.tick),
                    agent.id,
                    mine.scale.toFixed(2),
                    weAll,
                    `active(${fmt(active)})`,
                    `onboard(${fmt(onboarding)})`,
                    `depart(${fmt(departing)})`,
                    `slotsFill(${fmt(slotFill)})`,
                    `slotsCap(${fmt(cap)})`,
                    `used(${fmt(slotUsed)})`,
                    `wage(${fmt({ none: wage.none, primary: wage.primary, secondary: wage.secondary, tertiary: wage.tertiary })})`,
                    `allocTrg(${fmt(alloc)})`,
                    `demReqScale(${fmt(dem)})`,
                    `deposits(${Math.round(assets.deposits)})`,
                ].join(' | '),
            );
        }
    }
}

let headerShown = false;
function row(file: string, text: string): void {
    if (!headerShown) {
        mkdirSync(path.dirname(file), { recursive: true });
        if (!existsSync(file)) {
            writeFileSync(
                file,
                'tick | agent | mineScale | workerEff(per-edu) | active(per-edu) | onboarding | departing | slotsFilled | slotCaps | used | wage | allocTarget | demReq*scale | deposits\n',
            );
        }
        headerShown = true;
    }
    appendFileSync(file, text + '\n');
}
