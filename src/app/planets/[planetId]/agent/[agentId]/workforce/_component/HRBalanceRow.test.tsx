import { screen } from '@testing-library/react';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';
import { describe, it, expect } from 'vitest';
import React from 'react';
import { HRBalanceRow } from './HRBalanceRow';

describe('HRBalanceRow', () => {
    it('renders balance equation when demand > 0', () => {
        renderWithIntl(<HRBalanceRow demand={10} buffer={20} production={15} />);

        expect(screen.getByText('2 days')).toBeInTheDocument();
        expect(screen.getByText('1.5 days')).toBeInTheDocument();
        expect(screen.getByText('1 day')).toBeInTheDocument();
        expect(screen.getByText('production')).toBeInTheDocument();
        expect(screen.getByText('demand')).toBeInTheDocument();
        expect(screen.getByText('buffer')).toBeInTheDocument();
    });

    it('shows no-demand state when demand is zero', () => {
        renderWithIntl(<HRBalanceRow demand={0} buffer={0} production={0} />);

        const workerTexts = screen.getAllByText('0 workers');
        expect(workerTexts).toHaveLength(1);
        expect(screen.getByText('0 worker-days')).toBeInTheDocument();
        expect(screen.getByText('production')).toBeInTheDocument();
        expect(screen.getByText('demand')).toBeInTheDocument();
        expect(screen.getByText('buffer')).toBeInTheDocument();
    });

    it('shows no-demand state when demand is zero with non-zero buffer', () => {
        renderWithIntl(<HRBalanceRow demand={0} buffer={100} production={50} />);

        expect(screen.queryByText('Infinity days')).not.toBeInTheDocument();
        expect(screen.queryByText('Infinity')).not.toBeInTheDocument();
        const workerTexts = screen.getAllByText('50 workers');
        expect(workerTexts).toHaveLength(1);
    });

    it('renders buffer below 1 day in red', () => {
        renderWithIntl(<HRBalanceRow demand={10} buffer={5} production={10} />);

        const bufferValue = screen.getByText('0.5 days');
        expect(bufferValue).toBeInTheDocument();
        expect(bufferValue.className).toContain('text-red-600');
    });

    it('renders buffer of 2+ days in green', () => {
        renderWithIntl(<HRBalanceRow demand={10} buffer={20} production={10} />);

        const bufferValue = screen.getByText('2 days');
        expect(bufferValue).toBeInTheDocument();
        expect(bufferValue.className).toContain('text-green-600');
    });

    it('renders children below the balance equation', () => {
        renderWithIntl(
            <HRBalanceRow demand={10} buffer={20} production={15}>
                <span>starvation bar</span>
            </HRBalanceRow>,
        );

        expect(screen.getByText('starvation bar')).toBeInTheDocument();
    });

    it('renders children in the no-demand state', () => {
        renderWithIntl(
            <HRBalanceRow demand={0} buffer={0} production={0}>
                <span>starvation bar</span>
            </HRBalanceRow>,
        );

        expect(screen.getByText('starvation bar')).toBeInTheDocument();
    });
});
