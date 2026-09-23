import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BuildPlaceholderCard } from './BuildPlaceholderCard';

describe('BuildPlaceholderCard', () => {
    it('shows the label and triggers onClick', async () => {
        const onClick = vi.fn();
        render(<BuildPlaceholderCard label='Build shipyard' onClick={onClick} />);

        await userEvent.click(screen.getByText('Build shipyard'));

        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
