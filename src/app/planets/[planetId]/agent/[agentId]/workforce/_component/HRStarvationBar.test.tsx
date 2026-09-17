import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import React from 'react';
import { HRStarvationBar } from './HRStarvationBar';

describe('HRStarvationBar', () => {
    it('shows full productivity without starvation', () => {
        render(<HRStarvationBar starvation={0} />);

        expect(screen.getByText('100%')).toBeInTheDocument();
        expect(screen.getByText(/HR productivity/)).toBeInTheDocument();
    });

    it('shows half productivity at full starvation', () => {
        render(<HRStarvationBar starvation={1} />);

        expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('fills the bar in proportion to productivity', () => {
        const { container } = render(<HRStarvationBar starvation={0} />);
        const fill = container.querySelector('.transition-all') as HTMLElement;

        expect(fill.style.width).toBe('100%');
    });

    it('colours the bar by starvation level', () => {
        const healthy = render(<HRStarvationBar starvation={0} />).container.querySelector(
            '.transition-all',
        ) as HTMLElement;
        const starving = render(<HRStarvationBar starvation={1} />).container.querySelector(
            '.transition-all',
        ) as HTMLElement;

        expect(healthy.style.backgroundColor).not.toBe('');
        expect(starving.style.backgroundColor).not.toBe(healthy.style.backgroundColor);
    });
});
