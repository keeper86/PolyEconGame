import { TICKS_PER_YEAR } from '../../src/simulation/constants';
import { advanceTick, seedRng } from '../../src/simulation/engine';
import { auxiliaryCostPerTick, auxiliaryCostRates } from '../../src/simulation/planet/auxiliaryCosts';
import { facilityInputCostPerTick, facilityWageCostPerTick } from '../../src/simulation/planet/auxiliaryCosts';
import { maintenanceFacility } from '../../src/simulation/planet/productionFacilities';
import { maintenanceServiceResourceType } from '../../src/simulation/planet/services';
import { buildBenchmarkWorld } from './world';

function main(): void {
    const years = Number(process.argv[2] ?? 4);
    seedRng(1001);
    const { gameState, planet } = buildBenchmarkWorld({});
    const template = maintenanceFacility('catalog', 'preview');

    const totalTicks = years * TICKS_PER_YEAR;
    for (let t = 1; t <= totalTicks; t++) {
        gameState.tick = t;
        advanceTick(gameState);
        if (t % TICKS_PER_YEAR !== 0) {
            continue;
        }
        const rates = auxiliaryCostRates(planet);
        const inputPerUnit = facilityInputCostPerTick(template, planet) / 100;
        const wagePerUnit = facilityWageCostPerTick(template, planet) / 100;
        const auxPerUnit = auxiliaryCostPerTick(template, rates) / 100;
        const floor = planet.lastProductionCostFloors[maintenanceServiceResourceType.name] ?? 0;
        const price = planet.marketPrices[maintenanceServiceResourceType.name] ?? 0;
        const wage = planet.wagePerEdu.none ?? 0;
        const steel = planet.marketPrices.Steel ?? 0;
        const electronics = planet.marketPrices.Electronics ?? 0;
        const plastic = planet.marketPrices.Plastic ?? 0;
        console.log(
            `y${(t / TICKS_PER_YEAR).toFixed(2)}: floor=${floor.toFixed(1)} price=${price.toFixed(1)} ` +
                `ratio=${(price / Math.max(1e-9, floor)).toFixed(2)} | input=${inputPerUnit.toFixed(1)} ` +
                `wage=${wagePerUnit.toFixed(1)} aux=${auxPerUnit.toFixed(1)} | wageRate=${wage.toFixed(1)} ` +
                `steel=${steel.toFixed(1)} electronics=${electronics.toFixed(1)} plastic=${plastic.toFixed(1)}`,
        );
    }
}

main();
