import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    mutate: vi.fn(),
    isPending: { current: false },
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: h.toast }));

vi.mock('@/hooks/useMessages', () => ({
    useSendMessage: () => ({ mutate: h.mutate, isPending: h.isPending.current }),
}));

vi.mock('@/app/messages/_components/RecipientPicker', () => ({
    RecipientPicker: ({ onChange }: { onChange: (recipient: unknown) => void }) => (
        <button
            type='button'
            onClick={() => onChange({ userId: 'u2', displayName: 'Bob', username: 'bobby', companyName: 'Bob Corp' })}
        >
            pick-recipient
        </button>
    ),
}));

import { ComposeMessageDialog } from './ComposeMessageDialog';

const openDialog = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'New message' }));
};

const fillMessage = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'pick-recipient' }));
    await userEvent.type(screen.getByLabelText('Subject'), 'Hi');
    await userEvent.type(screen.getByLabelText('Message'), 'Hello');
};

describe('ComposeMessageDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        h.mutate.mockReset();
        h.isPending.current = false;
        h.mutate.mockImplementation((_input, options) => options.onSuccess());
    });

    it('keeps send disabled until recipient, subject and body are set', async () => {
        render(<ComposeMessageDialog />);
        await openDialog();

        const send = screen.getByRole('button', { name: 'Send' });
        expect(send).toBeDisabled();

        await userEvent.click(screen.getByRole('button', { name: 'pick-recipient' }));
        expect(send).toBeDisabled();

        await userEvent.type(screen.getByLabelText('Subject'), 'Hi');
        expect(send).toBeDisabled();

        await userEvent.type(screen.getByLabelText('Message'), 'Hello');
        expect(send).toBeEnabled();
    });

    it('sends a trimmed message and closes the dialog', async () => {
        render(<ComposeMessageDialog />);
        await openDialog();

        await userEvent.click(screen.getByRole('button', { name: 'pick-recipient' }));
        await userEvent.type(screen.getByLabelText('Subject'), '  Hi  ');
        await userEvent.type(screen.getByLabelText('Message'), '  Hello  ');
        await userEvent.click(screen.getByRole('button', { name: 'Send' }));

        expect(h.mutate).toHaveBeenCalledWith(
            { recipientUserId: 'u2', subject: 'Hi', body: 'Hello' },
            expect.anything(),
        );
        expect(h.toast.success).toHaveBeenCalledWith('Message sent');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows an error toast when sending fails', async () => {
        h.mutate.mockImplementation((_input, options) => options.onError(new Error('boom')));
        render(<ComposeMessageDialog />);
        await openDialog();

        await fillMessage();
        await userEvent.click(screen.getByRole('button', { name: 'Send' }));

        expect(h.toast.error).toHaveBeenCalledWith('boom');
    });

    it('clears the form when the dialog is closed', async () => {
        render(<ComposeMessageDialog />);
        await openDialog();

        await fillMessage();
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        await openDialog();

        expect(screen.getByLabelText('Subject')).toHaveValue('');
        expect(screen.getByLabelText('Message')).toHaveValue('');
    });
});
