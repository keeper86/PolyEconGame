import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardHeaderBlock } from './CardHeaderBlock';

describe('CardHeaderBlock', () => {
    it('renders title, badge and details', () => {
        render(
            <CardHeaderBlock
                title='Refinery'
                titleClassName=''
                badge={<span>badge</span>}
                details={<span>details</span>}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Refinery' })).toBeInTheDocument();
        expect(screen.getByText('badge')).toBeInTheDocument();
        expect(screen.getByText('details')).toBeInTheDocument();
    });

    it('omits the details block when details are null', () => {
        render(<CardHeaderBlock title='Refinery' titleClassName='' badge={<span>badge</span>} details={null} />);

        expect(screen.getByRole('heading', { name: 'Refinery' })).toBeInTheDocument();
    });
});
