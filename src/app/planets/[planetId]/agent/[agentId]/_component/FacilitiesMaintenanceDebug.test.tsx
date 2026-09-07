import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FacilitiesMaintenanceDebug } from './FacilitiesMaintenanceDebug';
import { makeAgentPlanetAssets, makeProductionFacility } from '@/simulation/utils/testHelper';

describe('FacilitiesMaintenanceDebug', () => {
    it('shows condition and full state for a healthy facility', () => {
        const facility = makeProductionFacility();
        facility.maintenanceStatus = 1;
        facility.maxMaintenance = 1;

        const assets = makeAgentPlanetAssets('p', { productionFacilities: [facility] });
        assets.storage.department = null;
        // The auto-granted storage shells render their own health row in the debug list. Degrade
        // them so this test isolates the healthy production facility's '100% / 100% max'/'full'.
        for (const shell of Object.values(assets.storage.shells)) {
            shell.maintenanceStatus = 0.5;
            shell.maxMaintenance = 1;
        }

        render(<FacilitiesMaintenanceDebug assets={assets} />);

        expect(screen.getByText('Test Facility')).toBeInTheDocument();
        expect(screen.getByText('100% / 100% max')).toBeInTheDocument();
        expect(screen.getByText('full')).toBeInTheDocument();
    });

    it('marks a facility under-maintained when consumption lags demand', () => {
        const facility = makeProductionFacility();
        facility.maintenanceStatus = 0.5;
        facility.maxMaintenance = 1;
        facility.lastTickMaintenanceConsumption = 0;

        const assets = makeAgentPlanetAssets('p', { productionFacilities: [facility] });
        assets.storage.department = null;

        render(<FacilitiesMaintenanceDebug assets={assets} />);

        expect(screen.getByText('under-maintained')).toBeInTheDocument();
    });

    it('marks a facility under construction as not maintained', () => {
        const facility = makeProductionFacility();
        facility.construction = {
            type: 'new',
            constructionTargetMaxScale: 1,
            totalConstructionServiceRequired: 1,
            maximumConstructionServiceConsumption: 1,
            progress: 0,
            lastTickInvestedConstructionServices: 0,
        };

        const assets = makeAgentPlanetAssets('p', { productionFacilities: [facility] });
        assets.storage.department = null;

        render(<FacilitiesMaintenanceDebug assets={assets} />);

        expect(screen.getByText('under construction')).toBeInTheDocument();
    });
});
