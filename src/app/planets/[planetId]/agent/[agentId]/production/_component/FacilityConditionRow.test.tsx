import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { FacilityConditionRow } from './FacilityConditionRow';
import { makeProductionFacility } from '@/simulation/utils/testHelper';

vi.mock('next/link', () => ({
    default: ({ children }: { children: React.ReactNode }) => children,
}));

describe('FacilityConditionRow', () => {
    it('shows condition percentage and maintenance consumption', () => {
        const facility = makeProductionFacility();
        facility.maintenanceStatus = 0.5;
        facility.maxMaintenance = 1;
        facility.lastTickMaintenanceConsumption = 0.001;

        render(<FacilityConditionRow facility={facility} planetId='p' agentId='a' />);

        expect(screen.getByText('Condition')).toBeInTheDocument();
        expect(screen.getByText('50% / 100% max')).toBeInTheDocument();
    });

    it('hides restoration row at full maxMaintenance', () => {
        const facility = makeProductionFacility();
        facility.maxMaintenance = 1;
        facility.maintenanceStatus = 1;

        render(<FacilityConditionRow facility={facility} planetId='p' agentId='a' />);

        expect(screen.queryByText('Restoration')).not.toBeInTheDocument();
    });

    it('shows restoration row with progress when degraded', () => {
        const facility = makeProductionFacility();
        facility.maxMaintenance = 0.6;
        facility.maintenanceStatus = 0.5;
        facility.lastTickRestorationConsumption = 0.002;

        render(<FacilityConditionRow facility={facility} planetId='p' agentId='a' />);

        expect(screen.getByText('Restoration')).toBeInTheDocument();
        expect(screen.getByText('60%')).toBeInTheDocument();
    });
});
