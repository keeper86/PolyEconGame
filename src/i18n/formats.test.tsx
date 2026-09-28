import { screen } from '@testing-library/react';
import { useFormatter } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from 'tests/vitest/renderWithIntl';

const ISO = '2026-09-26T12:00:00.000Z';

function Timestamp({ iso }: { iso: string }) {
    const format = useFormatter();
    return <span>{format.dateTime(new Date(iso), 'timestamp')}</span>;
}

describe('timestamp format', () => {
    it('resolves the named format and renders the year', () => {
        renderWithIntl(<Timestamp iso={ISO} />);

        expect(screen.getByText(/2026/)).toBeInTheDocument();
    });

    it('renders German differently from English', () => {
        const { unmount } = renderWithIntl(<Timestamp iso={ISO} />);
        const english = screen.getByText(/2026/).textContent;
        unmount();

        renderWithIntl(<Timestamp iso={ISO} />, { locale: 'de' });

        expect(screen.getByText(/2026/).textContent).not.toBe(english);
    });
});
