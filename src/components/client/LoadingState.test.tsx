import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';
import { LoadingState } from './LoadingState';

describe('LoadingState', () => {
    it('renders with default message', () => {
        renderWithIntl(<LoadingState />);
        expect(screen.getByText('Loading…')).toBeInTheDocument();
    });

    it('renders with custom message', () => {
        renderWithIntl(<LoadingState message='Loading skills assessment…' />);
        expect(screen.getByText('Loading skills assessment…')).toBeInTheDocument();
    });

    it('renders spinner', () => {
        const { container } = renderWithIntl(<LoadingState />);
        const spinner = container.querySelector('svg');
        expect(spinner).toBeInTheDocument();
    });

    it('applies custom className', () => {
        const { container } = renderWithIntl(<LoadingState className='custom-class' />);
        const wrapper = container.firstChild as HTMLElement;
        expect(wrapper.className).toContain('custom-class');
    });

    it('applies custom minHeight', () => {
        const { container } = renderWithIntl(<LoadingState minHeight='min-h-[600px]' />);
        const wrapper = container.firstChild as HTMLElement;
        expect(wrapper.className).toContain('min-h-[600px]');
    });
});
