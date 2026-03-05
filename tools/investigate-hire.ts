import { updateAllocatedWorkers, laborMarketTick, emptyAgeMoments } from '../src/simulation/workforce';
import { earth, earthGovernment, testCompany } from '../src/simulation/entities';
import type { GameState } from '../src/simulation/engine';
import { computePopulationOccupationTotals, computeAgentWorkforceTotals } from '../src/simulation/invariants';

function makeTinyPlanet(total = 10) {
    const p = JSON.parse(JSON.stringify(earth));
    // zero out population
    const dem = p.population.demography;
    for (let age = 0; age < dem.length; age++) {
        for (const edu of Object.keys(dem[age])) {
            for (const occ of Object.keys(dem[age][edu])) {
                dem[age][edu][occ] = 0;
            }
        }
    }
    // add `total` unoccupied at employable ages
    let perAge = Math.floor(total / (dem.length - 14));
    let rem = total - perAge * (dem.length - 14);
    for (let age = 14; age < dem.length; age++) {
        dem[age].none.unoccupied = perAge + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
    }
    p.population.demography = dem;
    return p;
}

(async function main(){
    const tiny = makeTinyPlanet(10);
    const agents = [JSON.parse(JSON.stringify(earthGovernment)), JSON.parse(JSON.stringify(testCompany))];
    // Clear any existing workforce
    for (const a of agents) {
        for (const assetsKey of Object.keys(a.assets)) {
            a.assets[assetsKey].workforceDemography = a.assets[assetsKey].workforceDemography || [];
            // zero all actives
            const wf = a.assets[assetsKey].workforceDemography;
            for (const cohort of wf) {
                for (const edu of Object.keys(cohort.active)) cohort.active[edu] = emptyAgeMoments();
            }
        }
    }

    console.log('POP pre', computePopulationOccupationTotals(tiny, 14));
    console.log('AGENTS pre', computeAgentWorkforceTotals(new Map(agents.map((a: any) => [a.id, a])), tiny.id));

    // Force allocatedWorkers to some demand to trigger hires. We'll set productionFacilities scaled small so demand fits tiny pop.
    // Use existing assets.productionFacilities configs; updateAllocatedWorkers will compute requirements.
    updateAllocatedWorkers(agents as any, [tiny] as any);
    console.log('AllocatedWorkers after update:', agents.map(a=>({id:a.id, allocated:a.assets[tiny.id].allocatedWorkers })));

    // Now run laborMarketTick to perform hires
    laborMarketTick(agents as any, [tiny] as any);

    console.log('POP post', computePopulationOccupationTotals(tiny, 14));
    console.log('AGENTS post', computeAgentWorkforceTotals(new Map(agents.map((a: any) => [a.id, a])), tiny.id));
    // print per-agent workforce breakdown
    for (const a of agents) {
        const wf = a.assets[tiny.id].workforceDemography;
        let totals = 0;
        if (wf) totals = wf.reduce((s:any,c:any)=>s+Object.values(c.active).reduce((ss:number,v:any)=>ss+(v.count ?? 0),0),0);
        console.log('agent', a.id, 'totalActive', totals);
    }
})();
