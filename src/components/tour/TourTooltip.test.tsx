import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';
import type { Step, TooltipRenderProps } from 'react-joyride';
import { TourTooltip } from './TourTooltip';

function renderTooltip(step: Partial<Step> = {}): void {
    const props = {
        continuous: true,
        index: 0,
        isLastStep: false,
        size: 3,
        step: { target: 'body', content: 'Body copy', title: 'A title', ...step } as Step,
        backProps: {},
        closeProps: {},
        primaryProps: {},
        tooltipProps: {},
    } as unknown as TooltipRenderProps;

    renderWithIntl(<TourTooltip {...props} />);
}

describe('TourTooltip blocking steps', () => {
    it('marks a blocking step as required and explains how to continue', () => {
        renderTooltip({ data: { blocking: true } });

        expect(screen.getByText('Action required')).toBeInTheDocument();
        expect(screen.getByText(/advances automatically once you have done it/i)).toBeInTheDocument();
    });

    it('replaces the primary "Next" button with a waiting indicator on blocking steps', () => {
        renderTooltip({ data: { blocking: true } });

        expect(screen.getByRole('button', { name: /waiting for your click/i })).toBeDisabled();
        expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    });

    it('keeps the primary "Next" button and no banner on regular steps', () => {
        renderTooltip();

        expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
        expect(screen.queryByText('Action required')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /waiting for your click/i })).not.toBeInTheDocument();
    });

    it('never offers a primary button on a blocking step, even on the last step', () => {
        const props = {
            continuous: true,
            index: 1,
            isLastStep: true,
            size: 3,
            step: { target: 'body', content: 'Body copy', title: 'A title', data: { blocking: true } } as Step,
            backProps: {},
            closeProps: {},
            primaryProps: {},
            tooltipProps: {},
        } as unknown as TooltipRenderProps;

        renderWithIntl(<TourTooltip {...props} />);

        expect(screen.queryByRole('button', { name: 'Finish' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /waiting for your click/i })).toBeDisabled();
    });
});
