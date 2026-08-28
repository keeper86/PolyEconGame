import { expect } from 'vitest';
import { educationLevelKeys } from '../population/education';
import type { Agent, Planet } from '../planet/planet';
import { OCCUPATIONS } from '../population/population';
import { totalPopulation, sumPopOcc, sumWorkforceForEdu } from './testHelper';

export function assertWorkforcePopulationConsistency(planet: Planet, agents: Agent[], label = ''): void {
    for (const edu of educationLevelKeys) {
        const popEmployed = sumPopOcc(planet, edu, 'employed');
        let wfTotal = 0;
        for (const agent of agents) {
            wfTotal += sumWorkforceForEdu(agent, planet.id, edu);
        }
        expect(
            wfTotal,
            `${label} workforce ↔ population mismatch for edu=${edu}: wf=${wfTotal}, pop(employed)=${popEmployed}`,
        ).toBe(popEmployed);
    }
}

export function assertTotalPopulationConserved(planet: Planet, expectedTotal: number, label = ''): void {
    const actual = totalPopulation(planet);
    expect(actual, `${label} total population changed: expected=${expectedTotal}, got=${actual}`).toBe(expectedTotal);
}

export function assertAllNonNegative(planet: Planet, agents: Agent[]): void {
    for (let age = 0; age < planet.population.demography.length; age++) {
        const cohort = planet.population.demography[age];
        for (const occ of OCCUPATIONS) {
            for (const edu of educationLevelKeys) {
                expect(
                    cohort[occ][edu].total,
                    `negative population at age=${age}, occ=${occ}, edu=${edu}: ${cohort[occ][edu].total}`,
                ).toBeGreaterThanOrEqual(0);
            }
        }
    }

    for (const agent of agents) {
        const wf = agent.assets[planet.id]?.workforceDemography;
        if (!wf) {
            continue;
        }
        for (let age = 0; age < wf.length; age++) {
            for (const edu of educationLevelKeys) {
                const cell = wf[age][edu];
                expect(
                    cell.active,
                    `negative active at age=${age}, edu=${edu} for agent ${agent.id}`,
                ).toBeGreaterThanOrEqual(0);
                for (let m = 0; m < cell.voluntaryDeparting.length; m++) {
                    expect(
                        cell.voluntaryDeparting[m],
                        `negative departing at age=${age}, edu=${edu}, m=${m} for agent ${agent.id}`,
                    ).toBeGreaterThanOrEqual(0);
                    expect(
                        cell.departingFired[m],
                        `negative departingFired at age=${age}, edu=${edu}, m=${m} for agent ${agent.id}`,
                    ).toBeGreaterThanOrEqual(0);
                }
            }
        }
    }
}
