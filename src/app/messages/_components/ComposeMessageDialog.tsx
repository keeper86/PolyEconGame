'use client';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RecipientPicker } from '@/app/messages/_components/RecipientPicker';
import { useSendMessage } from '@/hooks/useMessages';
import type { RecipientCandidate } from '@/app/messages/_components/recipientLabel';
import { useErrorMessage } from '@/i18n/errors';
import { PenSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

export function ComposeMessageDialog() {
    const [open, setOpen] = useState(false);
    const [recipient, setRecipient] = useState<RecipientCandidate | null>(null);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');

    const sendMessage = useSendMessage();
    const t = useTranslations('Toasts');
    const tMsg = useTranslations('Messages');
    const tc = useTranslations('Common');
    const showError = useErrorMessage();

    const reset = () => {
        setRecipient(null);
        setSubject('');
        setBody('');
    };

    const canSubmit = recipient !== null && subject.trim() !== '' && body.trim() !== '';

    const handleSubmit = () => {
        if (recipient === null) {
            return;
        }
        sendMessage.mutate(
            { recipientUserId: recipient.userId, subject: subject.trim(), body: body.trim() },
            {
                onSuccess: () => {
                    toast.success(t('messageSent'));
                    reset();
                    setOpen(false);
                },
                onError: (error) => {
                    toast.error(error instanceof Error ? showError(error) : t('messageSendFailed'));
                },
            },
        );
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) {
            reset();
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button className='gap-2'>
                    <PenSquare className='h-4 w-4' />
                    {tMsg('compose.button')}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{tMsg('compose.title')}</DialogTitle>
                    <DialogDescription>{tMsg('compose.description')}</DialogDescription>
                </DialogHeader>

                <div className='flex flex-col gap-4 py-2'>
                    <div className='flex flex-col gap-2'>
                        <Label htmlFor='message-recipient'>{tMsg('compose.recipient')}</Label>
                        <RecipientPicker id='message-recipient' value={recipient} onChange={setRecipient} />
                    </div>

                    <div className='flex flex-col gap-2'>
                        <Label htmlFor='message-subject'>{tMsg('compose.subject')}</Label>
                        <Input
                            id='message-subject'
                            value={subject}
                            maxLength={200}
                            onChange={(event) => setSubject(event.target.value)}
                        />
                    </div>

                    <div className='flex flex-col gap-2'>
                        <Label htmlFor='message-body'>{tMsg('compose.message')}</Label>
                        <textarea
                            id='message-body'
                            value={body}
                            maxLength={5000}
                            rows={6}
                            onChange={(event) => setBody(event.target.value)}
                            className='flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant='outline' onClick={() => handleOpenChange(false)}>
                        {tc('cancel')}
                    </Button>
                    <Button disabled={!canSubmit || sendMessage.isPending} onClick={handleSubmit}>
                        {tMsg('compose.send')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
