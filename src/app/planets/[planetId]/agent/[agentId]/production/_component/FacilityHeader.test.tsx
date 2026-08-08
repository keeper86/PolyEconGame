import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import React from 'react';
import { FacilityHeader } from './FacilityHeader';
import type { Facility, LastTickResults } from '@/simulation/planet/facility';
import { createLastTickResults } from '@/simulation/planet/facility';

function makeFacility(overrides: Partial<Facility> = {}): Facility {
    return {
        planetId: 'test-planet',
        id: 'test-facility-id',
        type: 'production',
        name: 'Test Facility',
        maxScale: 10,
        scale: 3,
        construction: null,
        lastConstructionCompletedTick: 0,
        powerConsumptionPerTick: 1,
        workerRequirement: { primary: 5 },
        pollutionPerTick: { air: 0, water: 0, soil: 0 },
        needs: [],
        produces: [],
        lastTickResults: undefined as unknown as Facility['lastTickResults'],
        ...overrides,
    } as unknown as Facility;
}

function makeResults(overrides: Partial<LastTickResults> = {}): LastTickResults {
    return {
        ...createLastTickResults(),
        workerEfficiency: { primary: 0.8 },
        resourceEfficiency: {},
        overallEfficiency: 0.7,
        ...overrides,
    };
}

describe('FacilityHeader', () => {
    it('uses facility.scale when active (results present) under expansion', () => {
        const facility = makeFacility({
            scale: 3,
            construction: {
                type: 'expansion',
                constructionTargetMaxScale: 8,
                totalConstructionServiceRequired: 1000,
                maximumConstructionServiceConsumption: 50,
                progress: 200,
                lastTickInvestedConstructionServices: 40,
            },
        });
        const results = makeResults();

        render(<FacilityHeader facility={facility} results={results} badge={<span>badge</span>} />);

        expect(screen.getByText('Worker efficiency')).toBeInTheDocument();
        const values = screen.getAllByText('12');
        expect(values.length).toBeGreaterThan(0);
    });

    it('uses constructionTargetMaxScale when not active and under new construction', () => {
        const facility = makeFacility({
            scale: 1,
            construction: {
                type: 'new',
                constructionTargetMaxScale: 5,
                totalConstructionServiceRequired: 1000,
                maximumConstructionServiceConsumption: 50,
                progress: 200,
                lastTickInvestedConstructionServices: 40,
            },
        });

        render(<FacilityHeader facility={facility} badge={<span>badge</span>} />);

        expect(screen.getByText('Worker Requirement')).toBeInTheDocument();
        const values = screen.getAllByText('25');
        expect(values.length).toBeGreaterThan(0);
    });

    it('uses facility.scale when not active and not under construction', () => {
        const facility = makeFacility({ scale: 4, construction: null });

        render(<FacilityHeader facility={facility} badge={<span>badge</span>} />);

        expect(screen.getByText('Worker Requirement')).toBeInTheDocument();
        const values = screen.getAllByText('20');
        expect(values.length).toBeGreaterThan(0);
    });

    it('uses facility.scale when active and under expansion, ignoring constructionTargetMaxScale', () => {
        const facility = makeFacility({
            scale: 2,
            construction: {
                type: 'expansion',
                constructionTargetMaxScale: 100,
                totalConstructionServiceRequired: 1000,
                maximumConstructionServiceConsumption: 50,
                progress: 200,
                lastTickInvestedConstructionServices: 40,
            },
        });
        const results = makeResults();

        render(<FacilityHeader facility={facility} results={results} badge={<span>badge</span>} />);

        expect(screen.getByText('Worker efficiency')).toBeInTheDocument();
        const primaryValues = screen.getAllByText('8');
        expect(primaryValues.length).toBeGreaterThan(0);
        expect(screen.queryByText('500')).not.toBeInTheDocument();
    });
});
