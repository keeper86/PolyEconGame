import {
    ASK_PRICE_SENSITIVITY,
    ASK_VOLUME_FLOOR_FRACTION,
    AUTOMATED_COST_FLOOR_BUFFER,
    BID_OFFER_MAX_COST_MULTIPLIER,
    BID_PRICE_SENSITIVITY,
    BID_VOLUME_FLOOR_FRACTION,
    JOINT_DEMAND_WEIGHT_MAX,
    JOINT_DEMAND_WEIGHT_MIN,
    PRICE_ADJUST_MAX_DOWN,
    PRICE_ADJUST_MAX_UP,
    PRICE_CEIL,
    PRICE_FLOOR,
    SELL_THROUGH_EMA_ALPHA,
    TARGET_SELL_THROUGH,
    TICKS_PER_MONTH,
} from '../../src/simulation/constants';
import { initialMarketPrices } from '../../src/simulation/initialUniverse/initialMarketPrices';
import { sellThroughFactor } from '../../src/simulation/market/automaticPricing';
import { buyVolumeFraction, sellVolumeFraction } from '../../src/simulation/market/volumeFraction';
import { oilRefinery } from '../../src/simulation/planet/productionFacilities';
import {
    auxiliaryCostPerTick,
    auxiliaryCostRates,
    facilityInputCostPerTick,
    facilityWageCostPerTick,
} from '../../src/simulation/planet/auxiliaryCosts';
import { makePlanet } from '../../src/simulation/utils/testHelper';

const REF: Record<string, number> = {
    Fuel: initialMarketPrices.Fuel ?? 1.5,
    Plastic: initialMarketPrices.Plastic ?? 1.5,
    Chemical: initialMarketPrices.Chemical ?? 6,
};
const QTY: Record<string, number> = { Fuel: 80, Plastic: 60, Chemical: 60 };
const NAMES = Object.keys(QTY);

function demandAtDesign(): Record<string, { amplitude: number; elasticity: number }> {
    const demands: Record<string, { amplitude: number; elasticity: number }> = {};
    for (const name of NAMES) {
        demands[name] = { amplitude: QTY[name] * REF[name], elasticity: 1 };
    }
    return demands;
}

type Demand = { amplitude: number; elasticity: number };
type Scenario = {
    label: string;
    demands: Record<string, Demand>;
    shockAtTick?: number;
    shock?: Record<string, Demand>;
};

const SCENARIOS: Scenario[] = [
    { label: 'symmetric', demands: demandAtDesign() },
    { label: 'fuelGlut', demands: { ...demandAtDesign(), Fuel: { amplitude: 0.2, elasticity: 1 } } },
    { label: 'chemicalSqueeze', demands: { ...demandAtDesign(), Chemical: { amplitude: 3, elasticity: 1 } } },
    {
        label: 'elasticMix',
        demands: {
            Fuel: { amplitude: QTY.Fuel * Math.pow(REF.Fuel, 3), elasticity: 3 },
            Plastic: { amplitude: QTY.Plastic * REF.Plastic, elasticity: 1 },
            Chemical: { amplitude: QTY.Chemical * Math.pow(REF.Chemical, 0.3), elasticity: 0.3 },
        },
    },
    {
        label: 'stepShock',
        demands: demandAtDesign(),
        shockAtTick: 2500,
        shock: { ...demandAtDesign(), Fuel: { amplitude: 0.2, elasticity: 1 } },
    },
];

const EATAS = (process.env.EATAS ?? '0.25,0.5,0.75,1').split(',').map(Number);

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

type OutState = {
    name: string;
    q: number;
    ref: number;
    price: number;
    inventory: number;
    smoothedSellThrough: number;
    avgDemand: number;
};

type Rule = {
    key: string;
    label: string;
    floors: (states: OutState[], C: number) => Record<string, number>;
};

const buildRules = (): Rule[] => [
    {
        key: 'A',
        label: 'A quantity share',
        floors: (states, C) => {
            const totalQ = states.reduce((s, o) => s + o.q, 0);
            return Object.fromEntries(states.map((o) => [o.name, C / totalQ]));
        },
    },
    {
        key: 'B',
        label: 'B live revenue share',
        floors: (states, C) => {
            const R = states.reduce((s, o) => s + o.q * o.price, 0);
            return Object.fromEntries(states.map((o) => [o.name, R > 0 ? (C * o.price) / R : 0]));
        },
    },
    {
        key: 'C',
        label: 'C reference weights (eta=0)',
        floors: (states, C) => {
            const totalRef = states.reduce((s, o) => s + o.q * o.ref, 0);
            return Object.fromEntries(
                states.map((o) => [o.name, totalRef > 0 ? (C * o.ref) / totalRef : C / states.length]),
            );
        },
    },
    ...EATAS.map((eta) => ({
        key: `D${eta}`,
        label: `D demand-coupled eta=${eta}`,
        floors: (states: OutState[], C: number) => {
            let kappaMean = 0;
            const kappa: Record<string, number> = {};
            for (const o of states) {
                const k = o.q > 0 && o.avgDemand > 0 ? o.avgDemand / o.q : 1;
                kappa[o.name] = k;
                kappaMean += k;
            }
            kappaMean /= states.length;
            let totalWeighted = 0;
            const weight: Record<string, number> = {};
            for (const o of states) {
                const ratio =
                    kappaMean > 0
                        ? clamp(kappa[o.name] / kappaMean, JOINT_DEMAND_WEIGHT_MIN, JOINT_DEMAND_WEIGHT_MAX)
                        : 1;
                weight[o.name] = o.ref * Math.pow(ratio, eta);
                totalWeighted += o.q * weight[o.name];
            }
            return Object.fromEntries(
                states.map((o) => [
                    o.name,
                    totalWeighted > 0 ? (C * weight[o.name]) / totalWeighted : C / states.length,
                ]),
            );
        },
    })),
];

function measureLoopGain(rule: Rule, states: OutState[], C: number): number {
    const fuel = states.find((o) => o.name === 'Fuel')!;
    const p0 = fuel.price;
    const f0 = rule.floors(states, C).Fuel;
    const perturbed = states.map((o) => (o === fuel ? { ...o, price: p0 * 1.05 } : o));
    const f1 = rule.floors(perturbed, C).Fuel;
    if (p0 <= 0 || f0 <= 0) {
        return Number.NaN;
    }
    return Math.log(f1 / f0) / Math.log((p0 * 1.05) / p0);
}

function std(values: number[]): number {
    if (values.length < 2) {
        return 0;
    }
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return Math.sqrt(values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length);
}

function runRule(rule: Rule, scenario: Scenario, ticks: number): Record<string, number> {
    const planet = makePlanet();
    const refinery = oilRefinery('catalog', 'preview');
    const rates = auxiliaryCostRates(planet);
    const C =
        facilityInputCostPerTick(refinery, planet) +
        facilityWageCostPerTick(refinery, planet) +
        auxiliaryCostPerTick(refinery, rates);

    const states: OutState[] = NAMES.map((name) => {
        const d = scenario.demands[name];
        const ref = REF[name];
        return {
            name,
            q: QTY[name],
            ref,
            price: ref,
            inventory: QTY[name] * 30,
            smoothedSellThrough: 1,
            avgDemand: d.amplitude * Math.pow(ref, -d.elasticity),
        };
    });

    const demandOf = (name: string, tick: number): Demand => {
        if (scenario.shockAtTick !== undefined && scenario.shock && tick >= scenario.shockAtTick) {
            return scenario.shock[name];
        }
        return scenario.demands[name];
    };

    const priceLog = NAMES.map(() => [] as number[]);

    for (let t = 1; t <= ticks; t++) {
        const floors = rule.floors(states, C);
        for (const o of states) {
            const d = demandOf(o.name, t);
            const rawDemand = d.amplitude * Math.pow(o.price, -d.elasticity);
            const bidFrac = buyVolumeFraction(
                o.price,
                floors[o.name],
                BID_PRICE_SENSITIVITY,
                BID_VOLUME_FLOOR_FRACTION,
                BID_OFFER_MAX_COST_MULTIPLIER,
            );
            const bid = rawDemand * bidFrac;
            const retainment = o.q * 30;
            const offered =
                Math.max(0, o.inventory - retainment) *
                sellVolumeFraction(
                    o.price,
                    floors[o.name],
                    ASK_PRICE_SENSITIVITY,
                    ASK_VOLUME_FLOOR_FRACTION,
                    AUTOMATED_COST_FLOOR_BUFFER,
                );
            const sold = Math.min(bid, offered);
            o.inventory += o.q - sold;
            const sellThrough = offered > 0 ? sold / offered : 1;
            o.smoothedSellThrough =
                t === 1
                    ? sellThrough
                    : SELL_THROUGH_EMA_ALPHA * sellThrough + (1 - SELL_THROUGH_EMA_ALPHA) * o.smoothedSellThrough;
            const factor = sellThroughFactor(
                o.smoothedSellThrough,
                TARGET_SELL_THROUGH,
                PRICE_ADJUST_MAX_UP,
                PRICE_ADJUST_MAX_DOWN,
            );
            o.price = clamp(o.price * factor, PRICE_FLOOR, PRICE_CEIL);
            o.avgDemand = t === 1 ? bid : (1 / TICKS_PER_MONTH) * bid + (1 - 1 / TICKS_PER_MONTH) * o.avgDemand;
            priceLog[NAMES.indexOf(o.name)].push(Math.log(o.price));
        }
    }

    const lastPrices = Object.fromEntries(states.map((o) => [o.name, o.price]));
    const lastFloors = rule.floors(states, C);
    const spread = lastPrices.Chemical / lastPrices.Fuel;
    const R = NAMES.reduce((s, n) => s + QTY[n] * lastPrices[n], 0);
    const oscillation = Math.max(...NAMES.map((n) => std(priceLog[NAMES.indexOf(n)].slice(-500))));
    const diverged =
        NAMES.some((n) => lastPrices[n] <= PRICE_FLOOR * 1.01 || lastPrices[n] >= PRICE_CEIL * 0.99) ||
        !Number.isFinite(R / C);

    return {
        spread,
        bundleCoverage: R / C,
        oscillation,
        diverged: diverged ? 1 : 0,
        loopGainFuel: measureLoopGain(rule, states, C),
        inventoryFuel: states[NAMES.indexOf('Fuel')].inventory,
        fuel: lastPrices.Fuel,
        plastic: lastPrices.Plastic,
        chemical: lastPrices.Chemical,
        floorFuel: lastFloors.Fuel,
        floorChemical: lastFloors.Chemical,
    };
}


const TICKS = 5000;

function main(): void {
    const rules = buildRules();
    const filter = (process.env.SCENARIOS ?? '').split(',').filter(Boolean);
    const scenarios = filter.length > 0 ? SCENARIOS.filter((s) => filter.includes(s.label)) : SCENARIOS;
    console.log(`Joint-cost allocation sweep — ${TICKS} ticks, cost C from the real sim primitives\n`);
    for (const scenario of scenarios) {
        console.log(`\n=== scenario: ${scenario.label} ===`);
        console.log(
            ['rule', 'fuel', 'plastic', 'chemical', 'spread c/f', 'R/C', 'osc', 'div', 'gain', 'invFuel'].join(
                '  |  ',
            ),
        );
        for (const rule of rules) {
            const r = runRule(rule, scenario, TICKS);
            const row = [
                rule.key.padEnd(20),
                r.fuel.toFixed(3).padStart(6),
                r.plastic.toFixed(3).padStart(6),
                r.chemical.toFixed(3).padStart(7),
                r.spread.toFixed(3).padStart(8),
                r.bundleCoverage.toFixed(3).padStart(6),
                r.oscillation.toExponential(1).padStart(8),
                String(r.diverged).padStart(5),
                r.loopGainFuel.toFixed(3).padStart(7),
                Math.round(r.inventoryFuel).toLocaleString().padStart(10),
            ];
            console.log(row.join('  |  '));
        }
    }
}

main();

