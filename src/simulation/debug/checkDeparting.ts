/**
 * simulation/debug/checkDeparting.ts
 *
 * Debug/experiment script that exercises the departing pipeline in the labor
 * market month tick.  Originally lived in scripts/checkDeparting.ts.
 *
 * Run with: npx tsx src/simulation/debug/checkDeparting.ts
 */

import { agentMap, planetMap, makeAgent, makePlanet } from '../workforce/testHelpers';
import { laborMarketMonthTick } from '../workforce/laborMarketMonthTick';

function printPipeline(wf: any) {
    for (let t = 0; t < 1; t++) {
        console.log('departing.none:', wf[t].departing.none.slice());
    }
}

async function main() {
    const agent = makeAgent();
    const { planet } = makePlanet();
    const wf = agent.assets.p.workforceDemography!;

    // Build a pipeline for tenure 0
    const NOTICE_PERIOD_MONTHS = wf[0].departing.none.length;
    const pipeline = new Array(NOTICE_PERIOD_MONTHS).fill(0);
    pipeline[0] = 5;
    pipeline[1] = 3;
    pipeline[NOTICE_PERIOD_MONTHS - 1] = 1;
    wf[0].departing.none = pipeline;

    console.log('Before month tick:');
    printPipeline(wf);

    laborMarketMonthTick(agentMap(agent), planetMap(planet));

    console.log('After month tick:');
    printPipeline(wf);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
