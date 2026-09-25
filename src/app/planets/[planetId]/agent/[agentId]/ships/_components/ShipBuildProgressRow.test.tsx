import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShipBuildProgressRow } from './ShipBuildProgressRow';

describe('ShipBuildProgressRow', () => {
    it('shows the ship being built and its progress', () => {
        render(<ShipBuildProgressRow shipName='Hauler' progress={0.42} />);

        expect(screen.getByText('Building Hauler')).toBeInTheDocument();
        expect(screen.getByText('42%')).toBeInTheDocument();
    });
});
