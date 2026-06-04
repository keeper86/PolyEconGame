import { educationLevelKeys } from '../population/education';
import type { PopulationCategory } from '../population/population';
import { MAX_AGE, SKILL } from '../population/population';
import type { Agent, Planet } from '../planet/planet';

export const governmentTick = (planet: Planet, agent: Agent) => {
    if (agent.id !== planet.governmentId) {
        throw new Error(`Tick called on non-government agent ${agent.id} of planet ${planet.id}`);
    }

    const assets = agent.assets[planet.id];
    if (!assets || assets.deposits <= 0) {
        return;
    }

    // Collect all unableToWork cohort cells that have population.
    const cells: PopulationCategory[] = [];
    for (let age = 0; age <= MAX_AGE; age++) {
        const ageCohort = planet.population.demography[age];
        if (!ageCohort) {
            continue;
        }
        const unableToWork = ageCohort.unableToWork;
        for (const edu of educationLevelKeys) {
            for (const skill of SKILL) {
                const cat = unableToWork[edu][skill];
                if (cat.total > 0) {
                    cells.push(cat);
                }
            }
        }
    }

    if (cells.length === 0) {
        return;
    }

    // Sort ascending by wealth mean so the water-fill works poorest-first.
    cells.sort((a, b) => a.wealth.mean - b.wealth.mean);

    // --- Water-fill equilibrium ---
    // Find level T such that the budget exactly raises all cells below T up to T.
    let remainingBudget = assets.deposits;
    let cumulativePop = 0;
    let T = cells[cells.length - 1].wealth.mean;

    for (let i = 0; i < cells.length; i++) {
        cumulativePop += cells[i].total;
        const currentLevel = cells[i].wealth.mean;
        const nextLevel = i + 1 < cells.length ? cells[i + 1].wealth.mean : Infinity;

        if (nextLevel === Infinity) {
            // Last distinct level: distribute remainder flat.
            T = currentLevel + remainingBudget / cumulativePop;
            break;
        }

        const stepHeight = nextLevel - currentLevel;
        const cost = stepHeight * cumulativePop;

        if (remainingBudget <= cost) {
            T = currentLevel + remainingBudget / cumulativePop;
            break;
        }

        remainingBudget -= cost;
        // All cells 0..i are now conceptually at nextLevel; continue to next step.
    }

    // Apply transfers to all cells below T.
    let totalDistributed = 0;
    for (const cat of cells) {
        if (cat.wealth.mean < T) {
            const delta = (T - cat.wealth.mean) * cat.total;
            totalDistributed += delta;
            cat.wealth = { mean: T, variance: cat.wealth.variance };
        }
    }

    // Keep bank householdDeposits in sync with the new household wealth.
    planet.bank.householdDeposits += totalDistributed;
    assets.deposits -= totalDistributed;
};
