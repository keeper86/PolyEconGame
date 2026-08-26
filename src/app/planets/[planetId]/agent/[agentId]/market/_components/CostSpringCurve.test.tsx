import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { CostSpringCurve } from './CostSpringCurve';

vi.mock('recharts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('recharts')>();
    return {
        ...actual,
        ResponsiveContainer: ({ children }: { children: React.ReactElement }) => {
            const chartElement = children as React.ReactElement<{ width?: number; height?: number }>;
            return React.cloneElement(chartElement, { width: 600, height: 170 });
        },
    };
});

const params = { strength: 0.1, reference: 1.5, maxUp: 1.05, maxDown: 0.95 };

describe('CostSpringCurve', () => {
    it('renders the current market price marker when currentRatio is given', () => {
        const { container } = render(
            <CostSpringCurve mode='sell' ghost={params} active={params} currentRatio={6.25} />,
        );
        expect(container.querySelectorAll('.recharts-reference-dot')).toHaveLength(4);
        expect(container.querySelectorAll('.recharts-reference-line')).toHaveLength(3);
        const priceTick = screen.getByText('6.3');
        expect(priceTick).toBeInTheDocument();
        expect(priceTick.closest('text')?.getAttribute('fill')).toBe('#fbbf24');
        const fullPushTick = screen.getByText('1.2');
        expect(fullPushTick).toBeInTheDocument();
        expect(fullPushTick.closest('text')?.getAttribute('fill')).toBe('#f87171');
        const referenceTick = screen.getByText('1.5');
        expect(referenceTick).toBeInTheDocument();
        expect(referenceTick.closest('text')?.getAttribute('fill')).toBe('#38bdf8');
    });

    it('renders no market price marker without currentRatio', () => {
        const { container } = render(<CostSpringCurve mode='sell' ghost={params} active={params} />);
        expect(container.querySelectorAll('.recharts-reference-dot')).toHaveLength(2);
        expect(container.querySelectorAll('.recharts-reference-line')).toHaveLength(2);
        expect(screen.queryByText('6.25')).not.toBeInTheDocument();
    });

    it('places the market price dot inside the plot area at the ratio position', () => {
        const { container } = render(
            <CostSpringCurve mode='sell' ghost={params} active={params} currentRatio={6.25} />,
        );
        const svg = container.querySelector('svg');
        const circles = container.querySelectorAll('.recharts-reference-dot circle');
        const dot = circles[circles.length - 1];
        const cx = Number(dot.getAttribute('cx'));
        const cy = Number(dot.getAttribute('cy'));
        expect(cx).toBeGreaterThan(0);
        expect(cx).toBeLessThan(Number(svg?.getAttribute('width')));
        expect(cy).toBeGreaterThan(0);
        expect(cy).toBeLessThan(Number(svg?.getAttribute('height')));
    });
});
