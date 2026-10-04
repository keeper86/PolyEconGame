import { fireEvent, screen } from '@testing-library/react';
import { renderWithIntl as render } from 'tests/vitest/renderWithIntl';
import { describe, expect, it, vi } from 'vitest';
import { ProductSelector } from './MultiProductPriceChart';

vi.mock('@/components/client/ProductIcon', () => ({ ProductIcon: () => null }));

const RAW_NAMES = ['Iron Ore', 'Water'];

describe('ProductSelector', () => {
    it('disables "None" while nothing in the level is selected', () => {
        render(<ProductSelector allResourceNames={RAW_NAMES} selected={[]} onChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'All' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'None' })).toBeDisabled();
    });

    it('disables "All" once every resource in the level is selected', () => {
        render(<ProductSelector allResourceNames={RAW_NAMES} selected={RAW_NAMES} onChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'All' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'None' })).toBeEnabled();
    });

    it('enables both buttons while the level is partially selected', () => {
        render(<ProductSelector allResourceNames={RAW_NAMES} selected={[RAW_NAMES[0]]} onChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'All' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'None' })).toBeEnabled();
    });

    it('selects the whole level when "All" is clicked', () => {
        const onChange = vi.fn();
        render(<ProductSelector allResourceNames={RAW_NAMES} selected={[]} onChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'All' }));
        expect(onChange).toHaveBeenCalledWith(RAW_NAMES);
    });
});
